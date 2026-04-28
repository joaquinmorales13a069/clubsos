-- Fix get_empresa_kpis to count citas in both 'pendiente' and 'pendiente_empresa' states.
-- The new subscription flow creates citas with estado_sync = 'pendiente_empresa' (EA-queue),
-- which were previously invisible in the KPI because the filter only matched 'pendiente'.

CREATE OR REPLACE FUNCTION public.get_empresa_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa     UUID := public.get_auth_empresa();
  v_total       INT;
  v_activos     INT;
  v_pendientes  INT;
  v_citas_pend  INT;
  v_citas_mes   INT;
BEGIN
  -- Total members in empresa
  SELECT COUNT(*) INTO v_total
    FROM public.users
    WHERE empresa_id = v_empresa;

  -- Active members
  SELECT COUNT(*) INTO v_activos
    FROM public.users
    WHERE empresa_id = v_empresa
      AND estado = 'activo';

  -- Members awaiting activation
  SELECT COUNT(*) INTO v_pendientes
    FROM public.users
    WHERE empresa_id = v_empresa
      AND estado = 'pendiente';

  -- Citas pending empresa approval (includes both legacy 'pendiente' and new 'pendiente_empresa')
  SELECT COUNT(*) INTO v_citas_pend
    FROM public.citas
    WHERE estado_sync IN ('pendiente', 'pendiente_empresa')
      AND paciente_id IN (
        SELECT id FROM public.users
        WHERE empresa_id = v_empresa
      );

  -- Citas scheduled this calendar month
  SELECT COUNT(*) INTO v_citas_mes
    FROM public.citas
    WHERE fecha_hora_cita >= date_trunc('month', now())
      AND paciente_id IN (
        SELECT id FROM public.users
        WHERE empresa_id = v_empresa
      );

  RETURN jsonb_build_object(
    'total_miembros',      v_total,
    'miembros_activos',    v_activos,
    'miembros_pendientes', v_pendientes,
    'citas_pendientes',    v_citas_pend,
    'citas_mes',           v_citas_mes
  );
END;
$$;
