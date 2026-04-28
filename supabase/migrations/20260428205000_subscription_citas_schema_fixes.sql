-- Migration: subscription_citas_schema_fixes
-- Follow-up patch to harden RLS policies, add missing triggers/indexes,
-- and tighten constraints on tables introduced in 20260428200000.

-- =============================================================================
-- Fix 1: Add explicit WITH CHECK to admin policies (Critical)
-- FOR ALL policies need WITH CHECK so INSERT/UPDATE are also guarded.
-- =============================================================================

DROP POLICY IF EXISTS contratos_admin_all ON public.contratos;
CREATE POLICY contratos_admin_all ON public.contratos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin'));

DROP POLICY IF EXISTS cs_admin_all ON public.contrato_servicios;
CREATE POLICY cs_admin_all ON public.contrato_servicios
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin'));

DROP POLICY IF EXISTS pagos_admin_all ON public.pagos;
CREATE POLICY pagos_admin_all ON public.pagos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin'));

-- =============================================================================
-- Fix 2: pagos_miembro_insert must enforce pendiente_pago state (Critical)
-- Miembros should only be able to create a pago when the cita is actually
-- waiting for payment, preventing premature or duplicate payment records.
-- =============================================================================

DROP POLICY IF EXISTS pagos_miembro_insert ON public.pagos;
CREATE POLICY pagos_miembro_insert ON public.pagos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.citas c
      WHERE c.id = cita_id
        AND c.paciente_id = auth.uid()
        AND c.estado_sync = 'pendiente_pago'
    )
  );

-- =============================================================================
-- Fix 3: Add missing index on contrato_servicios(servicio_id) (Important)
-- The FK column servicio_id was not indexed; this fixes slow JOINs/cascades.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_cs_servicio ON public.contrato_servicios(servicio_id);

-- =============================================================================
-- Fix 4: Add updated_at triggers (Important)
-- public.set_updated_at() was defined in 20260423032241_step5_schema_extensions.sql.
-- =============================================================================

CREATE TRIGGER contratos_updated_at
  BEFORE UPDATE ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER contrato_servicios_updated_at
  BEFORE UPDATE ON public.contrato_servicios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pagos_updated_at
  BEFORE UPDATE ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Fix 5: Restrict miembro and ea read policies to activo=true contracts (Important)
-- Prevents inactive contracts from appearing in the scheduling UI or EA views.
-- =============================================================================

DROP POLICY IF EXISTS contratos_ea_read ON public.contratos;
CREATE POLICY contratos_ea_read ON public.contratos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.rol = 'empresa_admin'
        AND u.empresa_id = empresa_id
        AND activo = true
    )
  );

DROP POLICY IF EXISTS contratos_miembro_read ON public.contratos;
CREATE POLICY contratos_miembro_read ON public.contratos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.rol = 'miembro'
        AND u.empresa_id = empresa_id
        AND activo = true
    )
  );

DROP POLICY IF EXISTS cs_ea_read ON public.contrato_servicios;
CREATE POLICY cs_ea_read ON public.contrato_servicios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.contratos c ON c.empresa_id = u.empresa_id AND c.activo = true
      WHERE u.id = auth.uid() AND u.rol = 'empresa_admin'
        AND c.id = contrato_id
    )
  );

DROP POLICY IF EXISTS cs_miembro_read ON public.contrato_servicios;
CREATE POLICY cs_miembro_read ON public.contrato_servicios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.contratos c ON c.empresa_id = u.empresa_id AND c.activo = true
      WHERE u.id = auth.uid() AND u.rol = 'miembro'
        AND c.id = contrato_id
    )
  );

-- =============================================================================
-- Fix 6: Add dia_reset range CHECK (Important)
-- PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS, so guard with a
-- DO block to skip silently if the constraint already exists.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contratos_dia_reset_positive'
      AND conrelid = 'public.contratos'::regclass
  ) THEN
    ALTER TABLE public.contratos
      ADD CONSTRAINT contratos_dia_reset_positive CHECK (dia_reset >= 1);
  END IF;
END $$;
