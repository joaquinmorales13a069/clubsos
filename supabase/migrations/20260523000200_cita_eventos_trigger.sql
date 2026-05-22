-- Migración: trigger que escribe en cita_eventos cuando se crea o cambia el
-- estado de una cita. Opcionalmente dispara pg_net para invocar la edge
-- function en caliente (latencia baja); el cron sigue siendo el mecanismo
-- principal por idempotencia.

BEGIN;

-- Función helper para dispararle a la edge function vía pg_net. Si los secrets
-- no están configurados en Vault, simplemente no hace nada (best-effort).
CREATE OR REPLACE FUNCTION public.fn_procesar_eventos_async()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  -- Leer URL y service-role key desde Vault. Si la extensión vault no está
  -- disponible o las claves no existen, salimos silenciosamente.
  BEGIN
    SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'edge_function_procesar_eventos_url';

    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  EXCEPTION WHEN OTHERS THEN
    v_url := NULL;
    v_key := NULL;
  END;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Trigger principal: escribe en cita_eventos según el evento.
CREATE OR REPLACE FUNCTION public.tg_cita_estado_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.cita_eventos (cita_id, evento, payload)
    VALUES (NEW.id, 'creada', jsonb_build_object('estado', NEW.estado_sync));
    PERFORM public.fn_procesar_eventos_async();
    RETURN NEW;
  END IF;

  -- UPDATE: solo si cambió estado_sync
  IF NEW.estado_sync IS DISTINCT FROM OLD.estado_sync THEN
    v_evento := CASE NEW.estado_sync::TEXT
      WHEN 'confirmado' THEN 'confirmada'
      WHEN 'rechazado'  THEN 'rechazada'
      WHEN 'cancelado'  THEN 'cancelada'
      ELSE NULL
    END;

    IF v_evento IS NOT NULL THEN
      INSERT INTO public.cita_eventos (cita_id, evento, payload)
      VALUES (
        NEW.id,
        v_evento,
        jsonb_build_object(
          'estado_anterior', OLD.estado_sync,
          'estado_nuevo',    NEW.estado_sync,
          'motivo',          CASE v_evento
            WHEN 'rechazada' THEN NEW.motivo_rechazo
            WHEN 'cancelada' THEN NEW.motivo_cancelacion
            ELSE NULL
          END
        )
      );
      PERFORM public.fn_procesar_eventos_async();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_cita_estado_change ON public.citas;
CREATE TRIGGER tr_cita_estado_change
  AFTER INSERT OR UPDATE OF estado_sync ON public.citas
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_cita_estado_change();

COMMIT;
