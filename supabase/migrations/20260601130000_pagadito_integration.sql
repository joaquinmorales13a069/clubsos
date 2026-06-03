-- Pagadito integration: extend estado_pago enum and add tracking columns to pagos.
-- Spec: docs/superpowers/specs/2026-06-01-pagadito-integration-design.md

BEGIN;

-- 1. Extend estado_pago enum with 'iniciado' (link issued, awaiting completion).
--    ADD VALUE cannot run in the same tx as DDL on tables that USE the type in some
--    PG versions; if `supabase db push` complains, split this into its own migration.
ALTER TYPE public.estado_pago ADD VALUE IF NOT EXISTS 'iniciado' BEFORE 'verificado';

-- 2. Pagadito tracking columns on pagos.
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

-- 3. Indexes.
--    Unique partial index prevents ERN collisions from concurrent init calls.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_pagadito_ern
  ON public.pagos (pagadito_ern) WHERE pagadito_ern IS NOT NULL;

--    Partial index over only 'iniciado' rows keeps the reconcile cron query fast.
CREATE INDEX IF NOT EXISTS idx_pagos_estado_iniciado_at
  ON public.pagos (iniciado_at)
  WHERE estado = 'iniciado';

COMMIT;
