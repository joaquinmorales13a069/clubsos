-- Audit log table for CRUD actions across the system
CREATE TABLE audit_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  actor_id      uuid        REFERENCES users(id) ON DELETE SET NULL,
  actor_rol     text        NOT NULL,
  accion        text        NOT NULL,
  entidad       text        NOT NULL,
  entidad_id    uuid,
  datos_antes   jsonb,
  datos_despues jsonb,
  ip_address    inet,
  metadata      jsonb       NOT NULL DEFAULT '{}'
);

-- Indexes
CREATE INDEX idx_audit_logs_actor     ON audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_entidad   ON audit_logs (entidad, entidad_id, created_at DESC);
CREATE INDEX idx_audit_logs_accion    ON audit_logs (accion, created_at DESC);
CREATE INDEX idx_audit_logs_created   ON audit_logs (created_at DESC);

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin reads everything
CREATE POLICY "audit_admin_select" ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND rol = 'admin'
    )
  );

-- empresa_admin reads only logs scoped to their empresa
CREATE POLICY "audit_empresa_admin_select" ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.rol = 'empresa_admin'
        AND (metadata->>'empresa_id')::uuid = u.empresa_id
    )
  );

-- No client-side inserts — only service role / server client
CREATE POLICY "audit_no_client_insert" ON audit_logs
  FOR INSERT
  WITH CHECK (false);

-- ── Trigger: documentos_medicos ───────────────────────────────────────────────
-- Captures UPDATE and DELETE from client-side mutations in AdminDocumentos.tsx
-- auth.uid() is available because browser client passes the user JWT

CREATE OR REPLACE FUNCTION audit_documentos_medicos()
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
      'documento.subir',
      'documentos_medicos',
      NEW.id,
      jsonb_build_object(
        'nombre_documento', NEW.nombre_documento,
        'tipo_documento',   NEW.tipo_documento,
        'usuario_id',       NEW.usuario_id,
        'subido_por',       NEW.subido_por,
        'file_path',        NEW.file_path,
        'tipo_archivo',     NEW.tipo_archivo
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (actor_id, actor_rol, accion, entidad, entidad_id, datos_antes, datos_despues)
    VALUES (
      auth.uid(),
      COALESCE(v_rol, 'unknown'),
      'documento.actualizar',
      'documentos_medicos',
      OLD.id,
      jsonb_build_object(
        'nombre_documento', OLD.nombre_documento,
        'tipo_documento',   OLD.tipo_documento,
        'fecha_documento',  OLD.fecha_documento,
        'estado_archivo',   OLD.estado_archivo
      ),
      jsonb_build_object(
        'nombre_documento', NEW.nombre_documento,
        'tipo_documento',   NEW.tipo_documento,
        'fecha_documento',  NEW.fecha_documento,
        'estado_archivo',   NEW.estado_archivo
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (actor_id, actor_rol, accion, entidad, entidad_id, datos_antes)
    VALUES (
      auth.uid(),
      COALESCE(v_rol, 'unknown'),
      'documento.eliminar',
      'documentos_medicos',
      OLD.id,
      jsonb_build_object(
        'nombre_documento', OLD.nombre_documento,
        'tipo_documento',   OLD.tipo_documento,
        'usuario_id',       OLD.usuario_id,
        'file_path',        OLD.file_path
      )
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_documentos_medicos
  AFTER INSERT OR UPDATE OR DELETE ON documentos_medicos
  FOR EACH ROW EXECUTE FUNCTION audit_documentos_medicos();
