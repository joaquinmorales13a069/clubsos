-- Background job: every 15 minutes, mark `confirmado` citas whose
-- fecha_hora_cita is older than 2 hours as `completado`. The 2h buffer
-- prevents closing citas still in progress. Sets a session-local GUC so the
-- trigger tg_cita_estado_change emits the `auto_completado` event type
-- (handled separately by the edge function).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.auto_complete_past_citas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  PERFORM set_config('clubsos.auto_complete_run', 'true', true);

  UPDATE public.citas
     SET estado_sync = 'completado',
         updated_at  = now()
   WHERE estado_sync     = 'confirmado'
     AND fecha_hora_cita < now() - interval '2 hours';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- Idempotent schedule registration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-complete-past-citas') THEN
    PERFORM cron.unschedule('auto-complete-past-citas');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-complete-past-citas',
  '*/15 * * * *',
  $$SELECT public.auto_complete_past_citas();$$
);

COMMIT;
