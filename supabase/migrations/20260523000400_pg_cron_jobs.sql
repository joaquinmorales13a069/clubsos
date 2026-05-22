-- Migración: cron jobs para procesar la cola de eventos y disparar
-- recordatorios 24h antes de la cita.

BEGIN;

-- Job 1: procesar la cola cada minuto (defensa por si el trigger async via
-- pg_net falla o el secret no está configurado).
SELECT cron.schedule(
  'procesar_eventos_cita_1m',
  '* * * * *',
  $$ SELECT public.fn_procesar_eventos_async(); $$
);

-- Job 2: recordatorio 24h, corre cada 15 minutos.
-- Inserta evento 'recordatorio_24h' por cada cita confirmada cuyo
-- fecha_hora_cita caiga dentro de la ventana (24h ± 15min), si todavía
-- no se insertó un recordatorio para esa cita.
SELECT cron.schedule(
  'recordatorios_citas_24h',
  '*/15 * * * *',
  $$
    INSERT INTO public.cita_eventos (cita_id, evento)
    SELECT c.id, 'recordatorio_24h'
    FROM public.citas c
    WHERE c.estado_sync = 'confirmado'
      AND c.fecha_hora_cita BETWEEN NOW() + INTERVAL '23 hours 45 minutes'
                                AND NOW() + INTERVAL '24 hours 15 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM public.cita_eventos e
        WHERE e.cita_id = c.id AND e.evento = 'recordatorio_24h'
      );
  $$
);

COMMIT;
