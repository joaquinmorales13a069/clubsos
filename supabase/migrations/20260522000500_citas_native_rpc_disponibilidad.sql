-- Migración: RPCs de consulta de disponibilidad.
-- - obtener_slots_disponibles(doctor, servicio, fecha) → grid del día con bool
-- - obtener_dias_disponibles(doctor, mes_inicio, mes_fin) → días con al menos 1 slot

BEGIN;

CREATE OR REPLACE FUNCTION public.obtener_slots_disponibles(
  p_doctor_id   UUID,
  p_servicio_id UUID,
  p_fecha       DATE
)
RETURNS TABLE (
  hora_inicio TIMESTAMPTZ,
  hora_fin    TIMESTAMPTZ,
  disponible  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_servicio_slots SMALLINT;
  v_doctor_tz      TEXT;
  v_dia_semana     SMALLINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_servicios
    WHERE doctor_id = p_doctor_id AND servicio_id = p_servicio_id
  ) THEN
    RAISE EXCEPTION 'INVALID_DOCTOR_SERVICE' USING ERRCODE = 'P0001';
  END IF;

  SELECT slot_duracion INTO v_servicio_slots
  FROM public.servicios WHERE id = p_servicio_id;

  SELECT u.zona_horaria INTO v_doctor_tz
  FROM public.doctores d
  JOIN public.ubicaciones u ON u.id = d.ubicacion_id
  WHERE d.id = p_doctor_id;

  IF v_doctor_tz IS NULL THEN
    v_doctor_tz := 'America/Managua';
  END IF;

  v_dia_semana := EXTRACT(DOW FROM p_fecha)::SMALLINT;

  RETURN QUERY
  WITH bloques AS (
    SELECT
      h.hora_inicio,
      h.hora_fin,
      h.slot_duracion AS slot_minutos
    FROM public.horarios_doctores h
    WHERE h.doctor_id = p_doctor_id
      AND h.dia_semana = v_dia_semana
      AND h.activo
  ),
  slots AS (
    SELECT
      (timestamp_at_tz)::TIMESTAMPTZ AS slot_start,
      (timestamp_at_tz + ((b.slot_minutos * v_servicio_slots) || ' minutes')::INTERVAL)::TIMESTAMPTZ AS slot_end,
      b.slot_minutos
    FROM bloques b,
    LATERAL (
      SELECT generate_series(
        (p_fecha || ' ' || b.hora_inicio)::TIMESTAMP AT TIME ZONE v_doctor_tz,
        ((p_fecha || ' ' || b.hora_fin)::TIMESTAMP AT TIME ZONE v_doctor_tz)
          - ((b.slot_minutos * v_servicio_slots) || ' minutes')::INTERVAL,
        (b.slot_minutos || ' minutes')::INTERVAL
      ) AS timestamp_at_tz
    ) gs
  ),
  ocupados AS (
    SELECT s.slot_start
    FROM slots s
    WHERE EXISTS (
      SELECT 1 FROM public.citas c
      WHERE c.doctor_id = p_doctor_id
        AND c.estado_sync NOT IN ('cancelado', 'rechazado')
        AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
            && tstzrange(s.slot_start, s.slot_end, '[)')
    )
  ),
  bloqueados AS (
    SELECT s.slot_start
    FROM slots s
    WHERE EXISTS (
      SELECT 1 FROM public.excepciones_horario e
      WHERE (e.doctor_id IS NULL OR e.doctor_id = p_doctor_id)
        AND tstzrange(e.fecha_inicio, e.fecha_fin, '[)')
            && tstzrange(s.slot_start, s.slot_end, '[)')
    )
  )
  SELECT
    s.slot_start,
    s.slot_end,
    (s.slot_start NOT IN (SELECT slot_start FROM ocupados))
    AND (s.slot_start NOT IN (SELECT slot_start FROM bloqueados))
    AS disponible
  FROM slots s
  ORDER BY s.slot_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_slots_disponibles(UUID, UUID, DATE)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.obtener_dias_disponibles(
  p_doctor_id   UUID,
  p_fecha_inicio DATE,
  p_fecha_fin    DATE
)
RETURNS TABLE (
  fecha       DATE,
  tiene_slots BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_tz TEXT;
BEGIN
  SELECT u.zona_horaria INTO v_doctor_tz
  FROM public.doctores d
  JOIN public.ubicaciones u ON u.id = d.ubicacion_id
  WHERE d.id = p_doctor_id;

  IF v_doctor_tz IS NULL THEN
    v_doctor_tz := 'America/Managua';
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT d::DATE AS f
    FROM generate_series(p_fecha_inicio, p_fecha_fin, '1 day'::INTERVAL) d
  ),
  con_horario AS (
    SELECT
      d.f,
      EXISTS (
        SELECT 1 FROM public.horarios_doctores h
        WHERE h.doctor_id = p_doctor_id
          AND h.dia_semana = EXTRACT(DOW FROM d.f)::SMALLINT
          AND h.activo
      ) AS atiende
    FROM dias d
  ),
  con_excepciones AS (
    SELECT
      ch.f,
      ch.atiende AND NOT EXISTS (
        SELECT 1 FROM public.excepciones_horario e
        WHERE (e.doctor_id IS NULL OR e.doctor_id = p_doctor_id)
          AND tstzrange(e.fecha_inicio, e.fecha_fin, '[)')
              @> tstzrange(
                (ch.f || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_doctor_tz,
                ((ch.f + 1) || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_doctor_tz,
                '[)'
              )
      ) AS atiende_efectivo
    FROM con_horario ch
  )
  SELECT ce.f, ce.atiende_efectivo
  FROM con_excepciones ce
  ORDER BY ce.f;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_dias_disponibles(UUID, DATE, DATE)
  TO authenticated;

COMMIT;
