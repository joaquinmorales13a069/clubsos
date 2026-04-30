-- ── Trigger: beneficios ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_beneficios()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rol text;
BEGIN
  SELECT rol INTO v_rol FROM users WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (actor_id, actor_rol, accion, entidad, entidad_id, datos_despues)
    VALUES (
      auth.uid(),
      COALESCE(v_rol, 'unknown'),
      'beneficio.crear',
      'beneficios',
      NEW.id,
      jsonb_build_object(
        'titulo',           NEW.titulo,
        'tipo_beneficio',   NEW.tipo_beneficio::text,
        'estado_beneficio', NEW.estado_beneficio::text,
        'fecha_inicio',     NEW.fecha_inicio,
        'fecha_fin',        NEW.fecha_fin
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (actor_id, actor_rol, accion, entidad, entidad_id, datos_antes, datos_despues)
    VALUES (
      auth.uid(),
      COALESCE(v_rol, 'unknown'),
      'beneficio.actualizar',
      'beneficios',
      OLD.id,
      jsonb_build_object(
        'titulo',           OLD.titulo,
        'tipo_beneficio',   OLD.tipo_beneficio::text,
        'estado_beneficio', OLD.estado_beneficio::text,
        'fecha_inicio',     OLD.fecha_inicio,
        'fecha_fin',        OLD.fecha_fin
      ),
      jsonb_build_object(
        'titulo',           NEW.titulo,
        'tipo_beneficio',   NEW.tipo_beneficio::text,
        'estado_beneficio', NEW.estado_beneficio::text,
        'fecha_inicio',     NEW.fecha_inicio,
        'fecha_fin',        NEW.fecha_fin
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (actor_id, actor_rol, accion, entidad, entidad_id, datos_antes)
    VALUES (
      auth.uid(),
      COALESCE(v_rol, 'unknown'),
      'beneficio.eliminar',
      'beneficios',
      OLD.id,
      jsonb_build_object(
        'titulo',           OLD.titulo,
        'tipo_beneficio',   OLD.tipo_beneficio::text,
        'estado_beneficio', OLD.estado_beneficio::text,
        'fecha_inicio',     OLD.fecha_inicio,
        'fecha_fin',        OLD.fecha_fin
      )
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_beneficios
  AFTER INSERT OR UPDATE OR DELETE ON beneficios
  FOR EACH ROW EXECUTE FUNCTION audit_beneficios();

-- ── Trigger: avisos ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_avisos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rol text;
BEGIN
  SELECT rol INTO v_rol FROM users WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (actor_id, actor_rol, accion, entidad, entidad_id, datos_despues)
    VALUES (
      auth.uid(),
      COALESCE(v_rol, 'unknown'),
      'aviso.crear',
      'avisos',
      NEW.id,
      jsonb_build_object(
        'titulo',       NEW.titulo,
        'estado_aviso', NEW.estado_aviso::text,
        'fecha_inicio', NEW.fecha_inicio,
        'fecha_fin',    NEW.fecha_fin
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (actor_id, actor_rol, accion, entidad, entidad_id, datos_antes, datos_despues)
    VALUES (
      auth.uid(),
      COALESCE(v_rol, 'unknown'),
      'aviso.actualizar',
      'avisos',
      OLD.id,
      jsonb_build_object(
        'titulo',       OLD.titulo,
        'estado_aviso', OLD.estado_aviso::text,
        'fecha_inicio', OLD.fecha_inicio,
        'fecha_fin',    OLD.fecha_fin
      ),
      jsonb_build_object(
        'titulo',       NEW.titulo,
        'estado_aviso', NEW.estado_aviso::text,
        'fecha_inicio', NEW.fecha_inicio,
        'fecha_fin',    NEW.fecha_fin
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (actor_id, actor_rol, accion, entidad, entidad_id, datos_antes)
    VALUES (
      auth.uid(),
      COALESCE(v_rol, 'unknown'),
      'aviso.eliminar',
      'avisos',
      OLD.id,
      jsonb_build_object(
        'titulo',       OLD.titulo,
        'estado_aviso', OLD.estado_aviso::text,
        'fecha_inicio', OLD.fecha_inicio,
        'fecha_fin',    OLD.fecha_fin
      )
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_avisos
  AFTER INSERT OR UPDATE OR DELETE ON avisos
  FOR EACH ROW EXECUTE FUNCTION audit_avisos();
