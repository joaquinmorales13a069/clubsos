-- Atomic RPC: mark pago verificado, advance cita to confirmado, enqueue cita_eventos.
-- Called by:
--   * GET /api/pagadito/return  (when get-status reports completed)
--   * POST /api/internal/pagadito/reconcile  (cron, same condition)
-- Idempotent: if pago is already 'verificado', no-op.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirmar_cita_por_pago(
  p_pago_id          UUID,
  p_pagadito_payload JSONB DEFAULT NULL,
  p_reference        TEXT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago        RECORD;
  v_cita        RECORD;
  v_new_estado  public.estado_sync;
BEGIN
  -- Lock the pago row to serialize concurrent return URL + cron calls.
  SELECT id, cita_id, estado, metodo
    INTO v_pago
    FROM public.pagos
   WHERE id = p_pago_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAGO_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: already verified → no-op.
  IF v_pago.estado = 'verificado' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  -- Mark pago verificado.
  UPDATE public.pagos
     SET estado           = 'verificado',
         pagadito_estado  = COALESCE(p_pagadito_payload->>'code', pagadito_estado),
         pagadito_payload = COALESCE(p_pagadito_payload, pagadito_payload),
         referencia       = COALESCE(p_reference, referencia),
         verificado_at    = NOW()
   WHERE id = p_pago_id;

  -- Advance cita to confirmado ONLY if it's in a transitionable state.
  -- If the member cancelled while paying, leave the cita cancelado and flag for refund.
  SELECT id, estado_sync INTO v_cita
    FROM public.citas
   WHERE id = v_pago.cita_id
   FOR UPDATE;

  IF v_cita.estado_sync IN ('pendiente_pago', 'pendiente_admin', 'pendiente') THEN
    UPDATE public.citas
       SET estado_sync = 'confirmado'
     WHERE id = v_cita.id;
    v_new_estado := 'confirmado';

    -- Enqueue notification event so procesar_eventos_cita dispatches WhatsApp/email.
    INSERT INTO public.cita_eventos (cita_id, evento, payload)
    VALUES (v_cita.id, 'confirmada', jsonb_build_object('source', 'pagadito'));
  ELSE
    -- Cita is in a terminal/non-transitionable state (cancelado, rechazado, completado).
    -- Money was charged anyway — admin must process refund manually.
    v_new_estado := v_cita.estado_sync;
    INSERT INTO public.cita_eventos (cita_id, evento, payload)
    VALUES (
      v_cita.id,
      'pago_sin_cita_activa',
      jsonb_build_object('pago_id', p_pago_id, 'cita_estado', v_cita.estado_sync)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'cita_estado', v_new_estado);
END;
$$;

-- All callers (return URL, reconcile cron) use service_role. The grant is to
-- service_role only; REVOKE from PUBLIC blocks anon and authenticated roles.
REVOKE ALL ON FUNCTION public.confirmar_cita_por_pago(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_cita_por_pago(UUID, JSONB, TEXT) TO service_role;

COMMIT;
