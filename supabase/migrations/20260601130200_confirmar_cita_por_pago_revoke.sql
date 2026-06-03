-- Lock down confirmar_cita_por_pago to service_role only.
--
-- Supabase auto-grants EXECUTE on new public functions to anon and authenticated
-- regardless of REVOKE FROM PUBLIC (the prior migration's REVOKE only affected
-- the PUBLIC pseudo-role). Without this fix, any authenticated user could call
-- the RPC with an arbitrary p_pago_id and mark pagos as verificado — there is
-- no caller-side ownership check inside the function body.
--
-- This migration adds the missing explicit revokes. Other SECURITY DEFINER RPCs
-- in this project (crear_cita_atomic, confirmar_cita, rechazar_cita,
-- cancelar_cita) are safe under the default grants because they check the
-- caller's role/identity internally. confirmar_cita_por_pago does not, so it
-- must be inaccessible from anon and authenticated.

REVOKE EXECUTE ON FUNCTION public.confirmar_cita_por_pago(UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;

-- Re-state the service_role grant for clarity (idempotent if already present).
GRANT EXECUTE ON FUNCTION public.confirmar_cita_por_pago(UUID, JSONB, TEXT)
  TO service_role;
