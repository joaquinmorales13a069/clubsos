-- Migración: RPC crear_excepcion_con_cancelaciones.
-- Inserta una excepción de horario Y cancela todas las citas existentes que
-- caen dentro de su scope+ventana. La cancelación dispara el trigger
-- tr_cita_estado_change → cita_eventos → edge function (email al paciente).

BEGIN;

CREATE OR REPLACE FUNCTION public.crear_excepcion_con_cancelaciones(
  p_doctor_id    UUID,
  p_ubicacion_id UUID,
  p_fecha_inicio TIMESTAMPTZ,
  p_fecha_fin    TIMESTAMPTZ,
  p_motivo       TEXT
)
RETURNS TABLE (
  excepcion_id            UUID,
  citas_canceladas_count  INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID := auth.uid();
  v_user_rol      TEXT;
  v_excepcion_id  UUID;
  v_motivo_cancel TEXT;
  v_count         INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol INTO v_user_rol FROM public.users WHERE id = v_user_id;
  IF v_user_rol <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF p_fecha_fin <= p_fecha_inicio THEN
    RAISE EXCEPTION 'INVALID_RANGE' USING ERRCODE = 'P0001';
  END IF;

  -- 1) Insertar la excepción.
  INSERT INTO public.excepciones_horario (doctor_id, ubicacion_id, fecha_inicio, fecha_fin, motivo)
  VALUES (p_doctor_id, p_ubicacion_id, p_fecha_inicio, p_fecha_fin, p_motivo)
  RETURNING id INTO v_excepcion_id;

  -- 2) Componer el motivo de cancelación que verá el paciente en el email.
  v_motivo_cancel := CASE
    WHEN p_motivo IS NULL OR TRIM(p_motivo) = ''
      THEN 'Bloqueo administrativo del horario'
    ELSE 'Bloqueo administrativo: ' || p_motivo
  END;

  -- 3) Cancelar citas afectadas. El trigger tr_cita_estado_change escribirá
  -- un evento 'cancelada' por cada fila → edge function envía email al
  -- paciente con este motivo.
  WITH affected AS (
    UPDATE public.citas c
    SET estado_sync        = 'cancelado'::public.estado_sync,
        motivo_cancelacion = v_motivo_cancel,
        cancelado_por      = v_user_id,
        cancelado_at       = NOW()
    WHERE c.estado_sync NOT IN ('cancelado', 'rechazado')
      AND (p_doctor_id    IS NULL OR c.doctor_id    = p_doctor_id)
      AND (p_ubicacion_id IS NULL OR c.ubicacion_id = p_ubicacion_id)
      AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
          && tstzrange(p_fecha_inicio, p_fecha_fin, '[)')
    RETURNING c.id
  )
  SELECT COUNT(*)::INT INTO v_count FROM affected;

  RETURN QUERY SELECT v_excepcion_id, v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_excepcion_con_cancelaciones(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO authenticated;

COMMIT;
