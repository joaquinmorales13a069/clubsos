-- =============================================================================
-- Step 6.0 — Schema Extensions for Empresa Admin Dashboard
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add notas column to empresas (maps from old Appwrite notas field)
-- -----------------------------------------------------------------------------
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS notas TEXT;

-- -----------------------------------------------------------------------------
-- 2. FK constraints so Supabase JS can join citas → servicios and citas → doctores
--    Both ea_service_id and ea_provider_id are UNIQUE in their respective tables,
--    so they can be referenced as FK targets.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'citas_ea_service_id_fkey'
  ) THEN
    ALTER TABLE public.citas
      ADD CONSTRAINT citas_ea_service_id_fkey
        FOREIGN KEY (ea_service_id)
        REFERENCES public.servicios(ea_service_id)
        ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'citas_ea_provider_id_fkey'
  ) THEN
    ALTER TABLE public.citas
      ADD CONSTRAINT citas_ea_provider_id_fkey
        FOREIGN KEY (ea_provider_id)
        REFERENCES public.doctores(ea_provider_id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Missing RLS policies for empresa admin write operations
-- -----------------------------------------------------------------------------

-- Empresa admin can update their own empresa's info (nombre, codigo_empresa, notas)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'empresas'
      AND policyname = 'empresas_empresa_admin_update'
  ) THEN
    CREATE POLICY "empresas_empresa_admin_update"
      ON public.empresas FOR UPDATE
      USING (
        public.get_auth_rol() = 'empresa_admin'
        AND id = public.get_auth_empresa()
      );
  END IF;
END $$;

-- Empresa admin can update citas of their empresa members (approval / rejection)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'citas'
      AND policyname = 'citas_empresa_admin_update'
  ) THEN
    CREATE POLICY "citas_empresa_admin_update"
      ON public.citas FOR UPDATE
      USING (
        public.get_auth_rol() = 'empresa_admin'
        AND paciente_id IN (
          SELECT id FROM public.users
          WHERE empresa_id = public.get_auth_empresa()
        )
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. RPC: get_empresa_kpis()
--    Single function replaces 5 individual count queries.
--    SECURITY DEFINER + get_auth_empresa() self-scopes to the caller's empresa.
-- -----------------------------------------------------------------------------
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

  -- Citas pending empresa approval
  SELECT COUNT(*) INTO v_citas_pend
    FROM public.citas
    WHERE estado_sync = 'pendiente'
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
