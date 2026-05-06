-- Expand protection: prevent ANY field change on another admin user.
-- An admin may still edit their own record.

CREATE OR REPLACE FUNCTION prevent_admin_estado_rol_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.rol = 'admin' AND auth.uid() IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Cannot modify data of another admin user';
  END IF;
  RETURN NEW;
END;
$$;
