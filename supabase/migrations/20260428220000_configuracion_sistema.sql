CREATE TABLE IF NOT EXISTS public.configuracion_sistema (
  clave      TEXT PRIMARY KEY,
  valor      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.configuracion_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY config_admin_all ON public.configuracion_sistema
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

CREATE POLICY config_read_authenticated ON public.configuracion_sistema
  FOR SELECT TO authenticated
  USING (true);
