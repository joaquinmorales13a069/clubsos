-- Prevent any admin from changing the estado or rol of another admin user.
-- An admin may still edit their own record freely.

CREATE OR REPLACE FUNCTION prevent_admin_estado_rol_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.rol = 'admin'
     AND auth.uid() IS DISTINCT FROM OLD.id
     AND (OLD.estado IS DISTINCT FROM NEW.estado OR OLD.rol IS DISTINCT FROM NEW.rol)
  THEN
    RAISE EXCEPTION 'Cannot modify estado or rol of another admin user';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_admin_estado_rol
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION prevent_admin_estado_rol_change();
