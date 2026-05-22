-- Migración: cola de eventos para notificaciones desacopladas.
--
-- Una edge function (procesar_eventos_cita) consume esta cola y dispara
-- WhatsApp + email + in-app por cada evento. Con retry hasta 3 intentos.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cita_eventos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cita_id       UUID NOT NULL REFERENCES public.citas(id) ON DELETE CASCADE,
  evento        TEXT NOT NULL,             -- 'creada' | 'confirmada' | 'rechazada' | 'cancelada' | 'recordatorio_24h'
  payload       JSONB,                     -- snapshot mínimo (estado nuevo, motivo, etc.)
  procesado     BOOLEAN NOT NULL DEFAULT FALSE,
  procesado_at  TIMESTAMPTZ,
  intentos      INT NOT NULL DEFAULT 0,
  ultimo_error  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice de barrido para el cron / edge function
CREATE INDEX IF NOT EXISTS idx_cita_eventos_pendientes
  ON public.cita_eventos (created_at)
  WHERE procesado = FALSE;

-- Índice para idempotencia de recordatorios (NOT EXISTS query)
CREATE INDEX IF NOT EXISTS idx_cita_eventos_cita_evento
  ON public.cita_eventos (cita_id, evento);

ALTER TABLE public.cita_eventos ENABLE ROW LEVEL SECURITY;

-- Sin políticas para authenticated → RLS deniega por default.
-- Solo service_role (la edge function) puede leer/escribir.

COMMIT;
