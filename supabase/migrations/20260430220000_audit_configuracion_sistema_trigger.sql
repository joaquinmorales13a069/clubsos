-- Audit trigger for the configuracion_sistema table
-- Captures INSERT and UPDATE actions on system configuration keys
-- auth.uid() is available because the browser client passes the user JWT
-- Note: configuracion_sistema uses a TEXT primary key (clave), so entidad_id stays NULL;
--       the key is stored in metadata instead.

CREATE OR REPLACE FUNCTION audit_configuracion_sistema()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rol text;
BEGIN
  SELECT rol INTO v_rol FROM users WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (
      actor_id, actor_rol, accion, entidad,
      datos_despues, metadata
    )
    VALUES (
      auth.uid(),
      COALESCE(v_rol, 'unknown'),
      'configuracion.' || NEW.clave,
      'configuracion_sistema',
      NEW.valor,
      jsonb_build_object('clave', NEW.clave)
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (
      actor_id, actor_rol, accion, entidad,
      datos_antes, datos_despues, metadata
    )
    VALUES (
      auth.uid(),
      COALESCE(v_rol, 'unknown'),
      'configuracion.' || NEW.clave,
      'configuracion_sistema',
      OLD.valor,
      NEW.valor,
      jsonb_build_object('clave', NEW.clave)
    );
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_configuracion_sistema
  AFTER INSERT OR UPDATE ON configuracion_sistema
  FOR EACH ROW EXECUTE FUNCTION audit_configuracion_sistema();
