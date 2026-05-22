-- Migración: permitir a empresa_admin confirmar/rechazar citas en estado
-- pendiente_empresa que pertenezcan a su empresa. admin mantiene plenos poderes.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirmar_cita(p_cita_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id          UUID := auth.uid();
  v_user_rol         TEXT;
  v_user_empresa_id  UUID;
  v_cita             RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol, empresa_id INTO v_user_rol, v_user_empresa_id
  FROM public.users WHERE id = v_user_id;

  IF v_user_rol NOT IN ('admin', 'empresa_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, estado_sync, empresa_id INTO v_cita
  FROM public.citas WHERE id = p_cita_id;
  IF v_cita IS NULL THEN
    RAISE EXCEPTION 'CITA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- admin: cualquier estado de pendiente
  -- empresa_admin: solo pendiente_empresa de su propia empresa
  IF v_user_rol = 'admin' THEN
    IF v_cita.estado_sync NOT IN ('pendiente', 'pendiente_admin', 'pendiente_empresa', 'pendiente_pago') THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- empresa_admin
    IF v_cita.estado_sync <> 'pendiente_empresa' THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
    END IF;
    IF v_cita.empresa_id IS NULL OR v_cita.empresa_id <> v_user_empresa_id THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.citas
  SET estado_sync    = 'confirmado',
      confirmado_por = v_user_id,
      confirmado_at  = NOW(),
      updated_at     = NOW()
  WHERE id = p_cita_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rechazar_cita(p_cita_id UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id          UUID := auth.uid();
  v_user_rol         TEXT;
  v_user_empresa_id  UUID;
  v_cita             RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol, empresa_id INTO v_user_rol, v_user_empresa_id
  FROM public.users WHERE id = v_user_id;

  IF v_user_rol NOT IN ('admin', 'empresa_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, estado_sync, empresa_id INTO v_cita
  FROM public.citas WHERE id = p_cita_id;
  IF v_cita IS NULL THEN
    RAISE EXCEPTION 'CITA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_user_rol = 'admin' THEN
    IF v_cita.estado_sync NOT IN ('pendiente', 'pendiente_admin', 'pendiente_empresa', 'pendiente_pago') THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_cita.estado_sync <> 'pendiente_empresa' THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
    END IF;
    IF v_cita.empresa_id IS NULL OR v_cita.empresa_id <> v_user_empresa_id THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
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

COMMIT;
