-- ── Enable pg_cron ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Expiration function ───────────────────────────────────────────────────────
-- Sets estado_beneficio / estado_aviso to 'expirada' for every active record
-- whose fecha_fin is in the past. Runs as a privileged function (SECURITY
-- DEFINER) so the cron job does not need row-level permissions.

CREATE OR REPLACE FUNCTION public.expire_beneficios_avisos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.beneficios
  SET
    estado_beneficio = 'expirada',
    updated_at       = NOW()
  WHERE fecha_fin IS NOT NULL
    AND fecha_fin  < NOW()
    AND estado_beneficio = 'activa';

  UPDATE public.avisos
  SET
    estado_aviso = 'expirada',
    updated_at   = NOW()
  WHERE fecha_fin IS NOT NULL
    AND fecha_fin  < NOW()
    AND estado_aviso = 'activa';
END;
$$;

-- ── Schedule (idempotent) ─────────────────────────────────────────────────────
-- Run at 06:00 UTC every day (= midnight Nicaragua time, UTC-6).
-- Unschedule first so re-applying the migration is safe.

SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'expire-beneficios-avisos';

SELECT cron.schedule(
  'expire-beneficios-avisos',
  '0 6 * * *',
  'SELECT public.expire_beneficios_avisos()'
);
