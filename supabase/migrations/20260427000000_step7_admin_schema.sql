-- Migration: step7_admin_schema
-- Adds empresa.estado column and get_admin_kpis() RPC for the Global Admin dashboard.

-- 1. Estado column on empresas (activate/deactivate from AdminEmpresas)
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activa'
  CHECK (estado IN ('activa', 'inactiva'));

-- 2. Global KPI RPC for Admin Inicio (7.2)
--    SECURITY DEFINER reads all rows bypassing RLS for non-admin roles.
CREATE OR REPLACE FUNCTION public.get_admin_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_empresas     INT;
  v_empresas_activas   INT;
  v_total_usuarios     INT;
  v_usuarios_activos   INT;
  v_citas_pendientes   INT;
  v_citas_mes          INT;
  v_docs_total         INT;
  v_beneficios_activos INT;
BEGIN
  SELECT COUNT(*) INTO v_total_empresas   FROM public.empresas;
  SELECT COUNT(*) INTO v_empresas_activas FROM public.empresas WHERE estado = 'activa';
  SELECT COUNT(*) INTO v_total_usuarios   FROM public.users;
  SELECT COUNT(*) INTO v_usuarios_activos FROM public.users   WHERE estado = 'activo';
  SELECT COUNT(*) INTO v_citas_pendientes FROM public.citas   WHERE estado_sync = 'pendiente';
  SELECT COUNT(*) INTO v_citas_mes        FROM public.citas
    WHERE fecha_hora_cita >= date_trunc('month', now());
  SELECT COUNT(*) INTO v_docs_total       FROM public.documentos_medicos WHERE estado_archivo = 'activo';
  SELECT COUNT(*) INTO v_beneficios_activos FROM public.beneficios WHERE estado_beneficio = 'activa';

  RETURN jsonb_build_object(
    'total_empresas',      v_total_empresas,
    'empresas_activas',    v_empresas_activas,
    'total_usuarios',      v_total_usuarios,
    'usuarios_activos',    v_usuarios_activos,
    'citas_pendientes',    v_citas_pendientes,
    'citas_mes',           v_citas_mes,
    'docs_total',          v_docs_total,
    'beneficios_activos',  v_beneficios_activos
  );
END;
$$;
