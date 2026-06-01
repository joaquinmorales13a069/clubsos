-- Extend tg_cita_estado_change to emit:
--   'completado'       on manual transition to completado
--   'auto_completado'  when the session GUC clubsos.auto_complete_run = 'true'
--                      (set by the auto_complete_past_citas() background job)
-- Detection uses a session-local config flag (cleared at transaction end), so
-- the trigger needs no actor-based heuristic.

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_cita_estado_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento    TEXT;
  v_auto_flag TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.cita_eventos (cita_id, evento, payload)
    VALUES (NEW.id, 'creada', jsonb_build_object('estado', NEW.estado_sync));
    PERFORM public.fn_procesar_eventos_async();
    RETURN NEW;
  END IF;

  -- UPDATE: only if estado_sync actually changed
  IF NEW.estado_sync IS DISTINCT FROM OLD.estado_sync THEN
    -- Distinguish auto-completion (background job) from manual completion
    v_auto_flag := current_setting('clubsos.auto_complete_run', true);

    v_evento := CASE NEW.estado_sync::TEXT
      WHEN 'confirmado' THEN 'confirmada'
      WHEN 'rechazado'  THEN 'rechazada'
      WHEN 'cancelado'  THEN 'cancelada'
      WHEN 'completado' THEN
        CASE WHEN v_auto_flag = 'true' THEN 'auto_completado' ELSE 'completado' END
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

COMMIT;
