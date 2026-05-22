-- Migración: RPCs para confirmar, rechazar y cancelar citas.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirmar_cita(p_cita_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_user_rol TEXT;
  v_estado_actual public.estado_sync;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol INTO v_user_rol FROM public.users WHERE id = v_user_id;
  IF v_user_rol <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT estado_sync INTO v_estado_actual FROM public.citas WHERE id = p_cita_id;
  IF v_estado_actual IS NULL THEN
    RAISE EXCEPTION 'CITA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_estado_actual NOT IN ('pendiente', 'pendiente_admin', 'pendiente_empresa', 'pendiente_pago') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.citas
  SET estado_sync   = 'confirmado',
      confirmado_por = v_user_id,
      confirmado_at  = NOW(),
      updated_at     = NOW()
  WHERE id = p_cita_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_cita(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rechazar_cita(p_cita_id UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_user_rol TEXT;
  v_estado_actual public.estado_sync;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol INTO v_user_rol FROM public.users WHERE id = v_user_id;
  IF v_user_rol <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT estado_sync INTO v_estado_actual FROM public.citas WHERE id = p_cita_id;
  IF v_estado_actual IS NULL THEN
    RAISE EXCEPTION 'CITA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_estado_actual NOT IN ('pendiente', 'pendiente_admin', 'pendiente_empresa', 'pendiente_pago') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.citas
  SET estado_sync    = 'rechazado',
      rechazado_por  = v_user_id,
      rechazado_at   = NOW(),
      motivo_rechazo = p_motivo,
      updated_at     = NOW()
  WHERE id = p_cita_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rechazar_cita(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_cita(p_cita_id UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_user_rol     TEXT;
  v_cita         RECORD;
  v_ventana_horas INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol INTO v_user_rol FROM public.users WHERE id = v_user_id;

  SELECT paciente_id, fecha_hora_cita, estado_sync INTO v_cita
  FROM public.citas WHERE id = p_cita_id;
  IF v_cita IS NULL THEN
    RAISE EXCEPTION 'CITA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_user_rol <> 'admin' AND v_cita.paciente_id <> v_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF v_cita.estado_sync IN ('cancelado', 'rechazado', 'completado') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  IF v_user_rol <> 'admin' THEN
    SELECT COALESCE((valor::TEXT)::INT, 24) INTO v_ventana_horas
    FROM public.configuracion_sistema WHERE clave = 'ventana_cancelacion_horas';

    IF v_cita.fecha_hora_cita - NOW() < (v_ventana_horas || ' hours')::INTERVAL THEN
      RAISE EXCEPTION 'CANCEL_TOO_LATE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.citas
  SET estado_sync        = 'cancelado',
      cancelado_por      = v_user_id,
      cancelado_at       = NOW(),
      motivo_cancelacion = p_motivo,
      updated_at         = NOW()
  WHERE id = p_cita_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_cita(UUID, TEXT) TO authenticated;

COMMIT;
