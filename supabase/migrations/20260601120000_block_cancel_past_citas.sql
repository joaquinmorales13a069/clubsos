-- Reject cancellation attempts on citas whose fecha_hora_cita is already in the past.
-- Defense in depth: the UI also hides the cancel button, but the RPC must enforce it.
--
-- Changes from previous version (20260522000700_citas_native_rpc_admin_actions.sql):
--   1. p_motivo now has DEFAULT NULL (backwards-compatible).
--   2. New CITA_YA_PASO guard: rejects any cita whose fecha_hora_cita < now().
--   3. empresa_admin role check added (mirrors confirmar/rechazar_cita_empresa scope).
--   4. FOR UPDATE locking on the SELECT to prevent concurrent state races.

BEGIN;

CREATE OR REPLACE FUNCTION public.cancelar_cita(
  p_cita_id uuid,
  p_motivo  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id         uuid;
  v_actor_rol        text;
  v_actor_empresa_id uuid;
  v_cita             RECORD;
  v_ventana_horas    int;
  v_horas_hasta_cita numeric;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol, empresa_id
    INTO v_actor_rol, v_actor_empresa_id
    FROM public.users
   WHERE id = v_actor_id;

  SELECT id, paciente_id, empresa_id, fecha_hora_cita, estado_sync
    INTO v_cita
    FROM public.citas
   WHERE id = p_cita_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CITA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- New guard: past citas cannot be cancelled
  IF v_cita.fecha_hora_cita < now() THEN
    RAISE EXCEPTION 'CITA_YA_PASO' USING ERRCODE = 'P0001';
  END IF;

  -- Already-terminal states cannot be cancelled
  IF v_cita.estado_sync IN ('cancelado', 'rechazado', 'completado') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  -- Role-based access control
  IF v_actor_rol = 'admin' THEN
    NULL; -- admin can always cancel

  ELSIF v_actor_rol = 'empresa_admin' THEN
    -- empresa_admin may only cancel citas belonging to their empresa
    IF v_cita.empresa_id IS NULL OR v_cita.empresa_id <> v_actor_empresa_id THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;

  ELSE
    -- Regular member: must be the patient on the cita
    IF v_cita.paciente_id <> v_actor_id THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;

    -- Members are subject to the cancellation window
    SELECT COALESCE((valor::text)::int, 24)
      INTO v_ventana_horas
      FROM public.configuracion_sistema
     WHERE clave = 'ventana_cancelacion_horas';

    v_ventana_horas := COALESCE(v_ventana_horas, 24);

    v_horas_hasta_cita := EXTRACT(EPOCH FROM (v_cita.fecha_hora_cita - now())) / 3600.0;
    IF v_horas_hasta_cita < v_ventana_horas THEN
      RAISE EXCEPTION 'CANCEL_TOO_LATE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.citas
     SET estado_sync        = 'cancelado',
         motivo_cancelacion = p_motivo,
         cancelado_por      = v_actor_id,
         cancelado_at       = now(),
         updated_at         = now()
   WHERE id = p_cita_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_cita(uuid, text) TO authenticated;

COMMIT;
