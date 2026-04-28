-- Allow members to update their own pagos row (needed for submitting referencia).
-- Without this, UPDATE is silently blocked by RLS and referencia stays null.
CREATE POLICY pagos_miembro_update ON public.pagos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.citas c WHERE c.id = cita_id AND c.paciente_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.citas c WHERE c.id = cita_id AND c.paciente_id = auth.uid())
  );
