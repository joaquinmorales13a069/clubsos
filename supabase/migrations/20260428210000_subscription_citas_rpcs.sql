-- Migration: subscription_citas_rpcs

-- ── Helper: compute start of current quota period ───────────────────────────
CREATE OR REPLACE FUNCTION public.current_period_start(p_contrato_id UUID)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tipo         TEXT;
  v_dia          INT;
  v_inicio       DATE;
  v_today        DATE := CURRENT_DATE;
  v_period_start DATE;
BEGIN
  SELECT tipo_reset, dia_reset, fecha_inicio
    INTO v_tipo, v_dia, v_inicio
    FROM public.contratos WHERE id = p_contrato_id;

  IF v_tipo = 'mensual' THEN
    v_period_start := DATE_TRUNC('month', v_today) + (v_dia - 1) * INTERVAL '1 day';
    IF v_period_start > v_today THEN
      v_period_start := v_period_start - INTERVAL '1 month';
    END IF;

  ELSIF v_tipo = 'semanal' THEN
    v_period_start := v_today - ((EXTRACT(ISODOW FROM v_today)::INT - v_dia + 7) % 7) * INTERVAL '1 day';

  ELSE -- personalizado: period length in days from fecha_inicio
    v_period_start := v_inicio + ((v_today - v_inicio) / v_dia) * v_dia * INTERVAL '1 day';
  END IF;

  RETURN v_period_start;
END;
$$;

-- ── RPC: check_cuota_disponible ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_cuota_disponible(
  p_contrato_servicio_id UUID,
  p_titular_ref_id       UUID
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuota    INT;
  v_used     INT;
  v_contrato UUID;
  v_period   DATE;
BEGIN
  SELECT cuota_por_titular, contrato_id
    INTO v_cuota, v_contrato
    FROM public.contrato_servicios
   WHERE id = p_contrato_servicio_id;

  v_period := public.current_period_start(v_contrato);

  SELECT COUNT(*)
    INTO v_used
    FROM public.citas
   WHERE contrato_servicio_id = p_contrato_servicio_id
     AND titular_ref_id       = p_titular_ref_id
     AND estado_sync NOT IN ('cancelado', 'rechazado')
     AND fecha_hora_cita >= v_period::TIMESTAMPTZ;

  RETURN v_cuota - v_used;
END;
$$;

-- ── RPC: get_empresa_contrato_usage ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_empresa_contrato_usage(p_empresa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '[]'::JSONB;
  v_row    RECORD;
BEGIN
  FOR v_row IN
    SELECT
      c.id        AS contrato_id,
      c.nombre    AS contrato_nombre,
      c.tipo_reset,
      c.dia_reset,
      c.fecha_inicio,
      c.fecha_fin,
      cs.id       AS cs_id,
      s.nombre    AS servicio_nombre,
      cs.cuota_por_titular,
      (SELECT COUNT(DISTINCT u.id)
         FROM public.users u
        WHERE u.empresa_id = p_empresa_id
          AND u.rol = 'miembro'
          AND u.titular_id IS NULL) AS titulares_count,
      (SELECT COUNT(*)
         FROM public.citas ci
        WHERE ci.contrato_servicio_id = cs.id
          AND ci.estado_sync NOT IN ('cancelado','rechazado')
          AND ci.fecha_hora_cita >= public.current_period_start(c.id)::TIMESTAMPTZ
      ) AS used
    FROM public.contratos c
    JOIN public.contrato_servicios cs ON cs.contrato_id = c.id
    JOIN public.servicios s           ON s.id = cs.servicio_id
   WHERE c.empresa_id = p_empresa_id
     AND c.activo = true
   ORDER BY c.nombre, s.nombre
  LOOP
    v_result := v_result || jsonb_build_object(
      'contrato_id',       v_row.contrato_id,
      'contrato_nombre',   v_row.contrato_nombre,
      'tipo_reset',        v_row.tipo_reset,
      'dia_reset',         v_row.dia_reset,
      'fecha_inicio',      v_row.fecha_inicio,
      'fecha_fin',         v_row.fecha_fin,
      'cs_id',             v_row.cs_id,
      'servicio_nombre',   v_row.servicio_nombre,
      'cuota_por_titular', v_row.cuota_por_titular,
      'titulares_count',   v_row.titulares_count,
      'total_cuota',       v_row.cuota_por_titular * v_row.titulares_count,
      'used',              v_row.used,
      'period_start',      public.current_period_start(v_row.contrato_id)
    );
  END LOOP;
  RETURN v_result;
END;
$$;

-- ── RPC: get_miembro_contrato_usage ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_miembro_contrato_usage(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id    UUID;
  v_titular_ref   UUID;
  v_familiares    INT;
  v_result        JSONB := '[]'::JSONB;
  v_row           RECORD;
BEGIN
  SELECT u.empresa_id,
         COALESCE(u.titular_id, u.id) AS titular_ref,
         (SELECT COUNT(*) FROM public.users f WHERE f.titular_id = COALESCE(u.titular_id, u.id))::INT AS fam_count
    INTO v_empresa_id, v_titular_ref, v_familiares
    FROM public.users u
   WHERE u.id = p_user_id;

  FOR v_row IN
    SELECT
      c.id        AS contrato_id,
      c.nombre    AS contrato_nombre,
      c.tipo_reset,
      c.dia_reset,
      cs.id       AS cs_id,
      s.nombre    AS servicio_nombre,
      cs.cuota_por_titular,
      (SELECT COUNT(*)
         FROM public.citas ci
        WHERE ci.contrato_servicio_id = cs.id
          AND ci.titular_ref_id = v_titular_ref
          AND ci.estado_sync NOT IN ('cancelado','rechazado')
          AND ci.fecha_hora_cita >= public.current_period_start(c.id)::TIMESTAMPTZ
      )::INT AS used
    FROM public.contratos c
    JOIN public.contrato_servicios cs ON cs.contrato_id = c.id
    JOIN public.servicios s           ON s.id = cs.servicio_id
   WHERE c.empresa_id = v_empresa_id
     AND c.activo = true
   ORDER BY c.nombre, s.nombre
  LOOP
    v_result := v_result || jsonb_build_object(
      'contrato_id',       v_row.contrato_id,
      'contrato_nombre',   v_row.contrato_nombre,
      'cs_id',             v_row.cs_id,
      'servicio_nombre',   v_row.servicio_nombre,
      'cuota_por_titular', v_row.cuota_por_titular,
      'familiares_count',  v_familiares,
      'used',              v_row.used,
      'remaining',         v_row.cuota_por_titular - v_row.used,
      'period_start',      public.current_period_start(v_row.contrato_id),
      'tipo_reset',        v_row.tipo_reset,
      'dia_reset',         v_row.dia_reset
    );
  END LOOP;
  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users (SECURITY DEFINER handles row access)
GRANT EXECUTE ON FUNCTION public.check_cuota_disponible(UUID, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_empresa_contrato_usage(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_miembro_contrato_usage(UUID)      TO authenticated;
