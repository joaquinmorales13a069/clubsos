-- Migración: tabla notificaciones para la campana in-app del Topbar.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notificaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,         -- 'cita_confirmada' | 'cita_rechazada' | 'cita_cancelada' | 'cita_recordatorio' | 'cita_creada'
  titulo      TEXT NOT NULL,
  mensaje     TEXT NOT NULL,
  link        TEXT,                  -- relative path, ej. '/dashboard/citas'
  leida       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON public.notificaciones (user_id, leida, created_at DESC);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_own_read"
  ON public.notificaciones FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notif_own_update"
  ON public.notificaciones FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Realtime para la campana
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

COMMIT;
