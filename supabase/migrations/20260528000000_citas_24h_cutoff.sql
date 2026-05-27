-- Migración: 24h pre-booking cutoff.
-- Una cita no puede ser agendada con menos de 24 horas de anticipación.
-- Reemplaza crear_cita_atomic (versión anterior: 20260527120000_citas_patient_busy_check.sql).

BEGIN;

CREATE OR REPLACE FUNCTION public.crear_cita_atomic(
  p_doctor_id            UUID,
  p_servicio_id          UUID,
  p_fecha_hora_cita      TIMESTAMPTZ,
  p_para_titular         BOOLEAN,
  p_motivo_cita          TEXT DEFAULT NULL,
  p_paciente_nombre      TEXT DEFAULT NULL,
  p_paciente_telefono    TEXT DEFAULT NULL,
  p_paciente_correo      TEXT DEFAULT NULL,
  p_paciente_cedula      TEXT DEFAULT NULL,
  p_contrato_servicio_id UUID DEFAULT NULL,
  p_metodo_pago          TEXT DEFAULT NULL,
  p_monto                NUMERIC DEFAULT NULL,
  p_servicio_asociado    TEXT DEFAULT NULL,
  p_notas                TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           UUID := auth.uid();
  v_user_rol          TEXT;
  v_user_empresa_id   UUID;
  v_user_titular_id   UUID;
  v_titular_ref_id    UUID;
  v_servicio          RECORD;
  v_doctor            RECORD;
  v_ubicacion_id      UUID;
  v_doctor_tz         TEXT;
  v_dia_semana        SMALLINT;
  v_fecha_hora_fin    TIMESTAMPTZ;
  v_cuota_disponible  INT;
  v_estado_inicial    public.estado_sync;
  v_auto_confirmar    BOOLEAN := FALSE;
  v_cita_id           UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol, empresa_id, titular_id
    INTO v_user_rol, v_user_empresa_id, v_user_titular_id
  FROM public.users WHERE id = v_user_id;

  IF v_user_rol NOT IN ('miembro', 'admin', 'empresa_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  -- ── NEW: 24h pre-booking cutoff ───────────────────────────────────────────
  -- Comparación NOW() (UTC) vs p_fecha_hora_cita (TIMESTAMPTZ).
  -- Timezone-agnostic: el offset del cliente no afecta esta validación.
  IF p_fecha_hora_cita < NOW() + INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'BOOKING_TOO_SOON' USING ERRCODE = 'P0001';
  END IF;
  -- ── END NEW ───────────────────────────────────────────────────────────────

  v_titular_ref_id := COALESCE(v_user_titular_id, v_user_id);

  SELECT * INTO v_servicio FROM public.servicios WHERE id = p_servicio_id AND activo;
  IF v_servicio IS NULL THEN
    RAISE EXCEPTION 'SERVICIO_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT d.*, u.zona_horaria AS tz
    INTO v_doctor
  FROM public.doctores d
  JOIN public.ubicaciones u ON u.id = d.ubicacion_id
  WHERE d.id = p_doctor_id AND d.activo;

  IF v_doctor IS NULL THEN
    RAISE EXCEPTION 'DOCTOR_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_ubicacion_id := v_doctor.ubicacion_id;
  v_doctor_tz    := v_doctor.tz;

  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_servicios
    WHERE doctor_id = p_doctor_id AND servicio_id = p_servicio_id
  ) THEN
    RAISE EXCEPTION 'INVALID_DOCTOR_SERVICE' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('cita_slot:' || p_doctor_id::TEXT || ':' || (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::DATE::TEXT)
  );

  v_dia_semana := EXTRACT(DOW FROM (p_fecha_hora_cita AT TIME ZONE v_doctor_tz))::SMALLINT;

  SELECT (p_fecha_hora_cita + (h.slot_duracion * v_servicio.slot_duracion || ' minutes')::INTERVAL)
    INTO v_fecha_hora_fin
  FROM public.horarios_doctores h
  WHERE h.doctor_id = p_doctor_id
    AND h.dia_semana = v_dia_semana
    AND h.activo
    AND (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::TIME >= h.hora_inicio
    AND (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::TIME +
        (h.slot_duracion * v_servicio.slot_duracion || ' minutes')::INTERVAL
        <= h.hora_fin::INTERVAL
  ORDER BY h.hora_inicio
  LIMIT 1;

  IF v_fecha_hora_fin IS NULL THEN
    RAISE EXCEPTION 'SLOT_OUT_OF_HOURS' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.excepciones_horario e
    WHERE (e.doctor_id IS NULL OR e.doctor_id = p_doctor_id)
      AND tstzrange(e.fecha_inicio, e.fecha_fin, '[)')
          && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
  ) THEN
    RAISE EXCEPTION 'SLOT_IN_EXCEPTION' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.citas c
    WHERE c.doctor_id = p_doctor_id
      AND c.estado_sync NOT IN ('cancelado', 'rechazado')
      AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
          && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = 'P0001';
  END IF;

  -- ── Patient-busy check (from previous migration) ─────────────────────────
  IF p_para_titular THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('patient_slot:titular:' || v_user_id::TEXT
               || ':' || (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::DATE::TEXT)
    );
    IF EXISTS (
      SELECT 1 FROM public.citas c
      WHERE c.paciente_id = v_user_id
        AND c.para_titular = TRUE
        AND c.estado_sync NOT IN ('cancelado','rechazado')
        AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
            && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
    ) THEN
      RAISE EXCEPTION 'PATIENT_BUSY' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- Familiar: identificado por cédula normalizada (sin guiones).
    -- Si no hay cédula, no podemos identificar al familiar — saltamos el check.
    -- Nota: scoped a `c.paciente_id = v_user_id` (citas que ESTE usuario
    -- agendó). No bloqueamos entre distintos titulares del mismo familiar
    -- compartido — el modelo actual no tiene 1 cedula = 1 persona global.
    IF COALESCE(REPLACE(p_paciente_cedula, '-', ''), '') <> '' THEN
      PERFORM pg_advisory_xact_lock(
        hashtext('patient_slot:familiar:' || v_user_id::TEXT
                 || ':' || REPLACE(p_paciente_cedula, '-', '')
                 || ':' || (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::DATE::TEXT)
      );
      IF EXISTS (
        SELECT 1 FROM public.citas c
        WHERE c.paciente_id = v_user_id
          AND c.para_titular = FALSE
          AND REPLACE(COALESCE(c.paciente_cedula,''),'-','')
              = REPLACE(p_paciente_cedula,'-','')
          AND c.estado_sync NOT IN ('cancelado','rechazado')
          AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
              && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
      ) THEN
        RAISE EXCEPTION 'PATIENT_BUSY' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF p_contrato_servicio_id IS NOT NULL THEN
    SELECT public.check_cuota_disponible(p_contrato_servicio_id, v_titular_ref_id)
      INTO v_cuota_disponible;

    IF v_cuota_disponible IS NULL OR v_cuota_disponible <= 0 THEN
      IF p_metodo_pago IS NULL THEN
        RAISE EXCEPTION 'QUOTA_EXCEEDED' USING ERRCODE = 'P0001';
      END IF;
      v_estado_inicial := CASE
        WHEN p_metodo_pago = 'pago_clinica' THEN 'pendiente_admin'::public.estado_sync
        ELSE 'pendiente_pago'::public.estado_sync
      END;
    ELSE
      v_estado_inicial := 'pendiente_empresa'::public.estado_sync;
    END IF;
  ELSIF p_metodo_pago IS NOT NULL THEN
    v_estado_inicial := CASE
      WHEN p_metodo_pago = 'pago_clinica' THEN 'pendiente_admin'::public.estado_sync
      ELSE 'pendiente_pago'::public.estado_sync
    END;
  ELSE
    RAISE EXCEPTION 'CONTRATO_OR_METODO_PAGO_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF v_user_empresa_id IS NOT NULL THEN
    SELECT COALESCE(auto_confirmar_citas, FALSE) INTO v_auto_confirmar
    FROM public.empresas WHERE id = v_user_empresa_id;
  END IF;

  IF v_auto_confirmar AND v_estado_inicial = 'pendiente_empresa' THEN
    v_estado_inicial := 'confirmado'::public.estado_sync;
  END IF;

  INSERT INTO public.citas (
    paciente_id, empresa_id,
    doctor_id, servicio_id, ubicacion_id,
    fecha_hora_cita, fecha_hora_fin,
    servicio_asociado, estado_sync,
    para_titular,
    paciente_nombre, paciente_telefono, paciente_correo, paciente_cedula,
    motivo_cita, notas,
    contrato_servicio_id,
    titular_ref_id,
    confirmado_por, confirmado_at
  ) VALUES (
    v_user_id, v_user_empresa_id,
    p_doctor_id, p_servicio_id, v_ubicacion_id,
    p_fecha_hora_cita, v_fecha_hora_fin,
    p_servicio_asociado, v_estado_inicial,
    p_para_titular,
    p_paciente_nombre, p_paciente_telefono, p_paciente_correo,
    REPLACE(COALESCE(p_paciente_cedula, ''), '-', ''),
    p_motivo_cita, p_notas,
    CASE WHEN v_estado_inicial = 'pendiente_empresa' OR v_cuota_disponible > 0
         THEN p_contrato_servicio_id ELSE NULL END,
    CASE WHEN v_estado_inicial = 'pendiente_empresa' OR v_cuota_disponible > 0
         THEN v_titular_ref_id ELSE NULL END,
    CASE WHEN v_estado_inicial = 'confirmado' THEN v_user_id ELSE NULL END,
    CASE WHEN v_estado_inicial = 'confirmado' THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_cita_id;

  IF p_metodo_pago IS NOT NULL AND p_contrato_servicio_id IS NULL THEN
    INSERT INTO public.pagos (cita_id, metodo, monto)
    VALUES (v_cita_id, p_metodo_pago::public.metodo_pago, p_monto);
  END IF;

  RETURN v_cita_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = 'P0001';
END;
$$;

-- GRANT EXECUTE preserved automatically by CREATE OR REPLACE
-- (originally granted by 20260522000600_citas_native_rpc_crear_cita.sql).

COMMIT;
