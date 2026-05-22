-- Migración: políticas RLS para las tablas nuevas del módulo de citas.

BEGIN;

CREATE POLICY "ubicaciones_authenticated_read"
  ON public.ubicaciones FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "ubicaciones_admin_all"
  ON public.ubicaciones FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

CREATE POLICY "horarios_authenticated_read"
  ON public.horarios_doctores FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "horarios_admin_all"
  ON public.horarios_doctores FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

CREATE POLICY "excepciones_authenticated_read"
  ON public.excepciones_horario FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "excepciones_admin_all"
  ON public.excepciones_horario FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

CREATE POLICY "doctor_servicios_authenticated_read"
  ON public.doctor_servicios FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "doctor_servicios_admin_all"
  ON public.doctor_servicios FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

COMMIT;
