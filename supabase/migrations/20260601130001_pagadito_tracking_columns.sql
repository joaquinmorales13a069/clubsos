-- Pagadito integration (2/2): add tracking columns + indexes on pagos.
-- Spec: docs/superpowers/specs/2026-06-01-pagadito-integration-design.md
--
-- Depends on 20260601130000 having committed the 'iniciado' enum value first;
-- the partial index below filters on `estado = 'iniciado'`.

BEGIN;

-- 1. Pagadito tracking columns on pagos.
ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS pagadito_token   TEXT,
  ADD COLUMN IF NOT EXISTS pagadito_ern     TEXT,
  ADD COLUMN IF NOT EXISTS pagadito_estado  TEXT,
  ADD COLUMN IF NOT EXISTS pagadito_payload JSONB,
  ADD COLUMN IF NOT EXISTS iniciado_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.pagos.pagadito_token   IS 'Token returned by Pagadito exec-trans (opaque, used by return URL).';
COMMENT ON COLUMN public.pagos.pagadito_ern     IS 'External Reference Number we send to Pagadito. Unique per transaction.';
COMMENT ON COLUMN public.pagos.pagadito_estado  IS 'Raw last-known Pagadito transaction status (COMPLETED, EXPIRED, VERIFYING, FAILED, ...).';
COMMENT ON COLUMN public.pagos.pagadito_payload IS 'Snapshot of the last get-status response for audit.';
COMMENT ON COLUMN public.pagos.iniciado_at      IS 'When exec-trans was called. Used by the reconcile cron.';

-- 2. Indexes.
--    Unique partial index prevents ERN collisions from concurrent init calls.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_pagadito_ern
  ON public.pagos (pagadito_ern) WHERE pagadito_ern IS NOT NULL;

--    Partial index over only 'iniciado' rows keeps the reconcile cron query fast.
CREATE INDEX IF NOT EXISTS idx_pagos_estado_iniciado_at
  ON public.pagos (iniciado_at)
  WHERE estado = 'iniciado';

COMMIT;
