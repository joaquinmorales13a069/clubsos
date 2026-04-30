-- Audit trigger for the users table
-- Captures UPDATE actions (activar, desactivar, actualizar) from client-side mutations
-- auth.uid() is available because the browser client passes the user JWT

CREATE OR REPLACE FUNCTION audit_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rol    text;
  v_accion text;
BEGIN
  SELECT rol INTO v_rol FROM users WHERE id = auth.uid();

  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado IS DISTINCT FROM NEW.estado AND NEW.estado = 'activo' THEN
      v_accion := 'usuario.activar';
    ELSIF OLD.estado IS DISTINCT FROM NEW.estado AND NEW.estado = 'inactivo' THEN
      v_accion := 'usuario.desactivar';
    ELSE
      v_accion := 'usuario.actualizar';
    END IF;

    INSERT INTO audit_logs (
      actor_id, actor_rol, accion, entidad, entidad_id,
      datos_antes, datos_despues
    )
    VALUES (
      auth.uid(),
      COALESCE(v_rol, 'unknown'),
      v_accion,
      'users',
      OLD.id,
      jsonb_build_object(
        'nombre_completo', OLD.nombre_completo,
        'estado',          OLD.estado::text,
        'rol',             OLD.rol,
        'empresa_id',      OLD.empresa_id
      ),
      jsonb_build_object(
        'nombre_completo', NEW.nombre_completo,
        'estado',          NEW.estado::text,
        'rol',             NEW.rol,
        'empresa_id',      NEW.empresa_id
      )
    );
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_users
  AFTER UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_users();
