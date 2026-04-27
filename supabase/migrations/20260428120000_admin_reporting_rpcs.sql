-- Step 7.9.0 — Admin Reporting RPCs
-- Five SECURITY DEFINER functions that bypass RLS for global analytics.

-- ================================================================
-- RPC 1: Analítica de Citas
-- Filtros opcionales: empresa, rango de fechas (fecha_hora_cita)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_admin_report_citas(
  p_empresa_id UUID        DEFAULT NULL,
  p_desde      TIMESTAMPTZ DEFAULT NULL,
  p_hasta      TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'total', (
      SELECT COUNT(*) FROM public.citas c
      WHERE (p_empresa_id IS NULL OR c.empresa_id = p_empresa_id)
        AND (p_desde IS NULL OR c.fecha_hora_cita >= p_desde)
        AND (p_hasta IS NULL OR c.fecha_hora_cita <= p_hasta)
    ),
    'por_estado', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM (
        SELECT estado_sync AS estado, COUNT(*) AS total
        FROM public.citas c
        WHERE (p_empresa_id IS NULL OR c.empresa_id = p_empresa_id)
          AND (p_desde IS NULL OR c.fecha_hora_cita >= p_desde)
          AND (p_hasta IS NULL OR c.fecha_hora_cita <= p_hasta)
        GROUP BY estado_sync ORDER BY total DESC
      ) s
    ),
    'por_mes', (
      SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.mes), '[]'::jsonb)
      FROM (
        SELECT date_trunc('month', fecha_hora_cita)::date AS mes, COUNT(*) AS total
        FROM public.citas c
        WHERE (p_empresa_id IS NULL OR c.empresa_id = p_empresa_id)
          AND (p_desde IS NULL OR c.fecha_hora_cita >= p_desde)
          AND (p_hasta IS NULL OR c.fecha_hora_cita <= p_hasta)
        GROUP BY mes ORDER BY mes
      ) s
    ),
    'por_servicio', (
      SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.total DESC), '[]'::jsonb)
      FROM (
        SELECT sv.nombre AS servicio, COUNT(*) AS total
        FROM public.citas c
        JOIN public.servicios sv ON sv.ea_service_id = c.ea_service_id
        WHERE (p_empresa_id IS NULL OR c.empresa_id = p_empresa_id)
          AND (p_desde IS NULL OR c.fecha_hora_cita >= p_desde)
          AND (p_hasta IS NULL OR c.fecha_hora_cita <= p_hasta)
        GROUP BY sv.nombre ORDER BY total DESC LIMIT 10
      ) s
    ),
    'por_doctor', (
      SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.total DESC), '[]'::jsonb)
      FROM (
        SELECT d.nombre AS doctor, COUNT(*) AS total
        FROM public.citas c
        JOIN public.doctores d ON d.ea_provider_id = c.ea_provider_id
        WHERE (p_empresa_id IS NULL OR c.empresa_id = p_empresa_id)
          AND (p_desde IS NULL OR c.fecha_hora_cita >= p_desde)
          AND (p_hasta IS NULL OR c.fecha_hora_cita <= p_hasta)
        GROUP BY d.nombre ORDER BY total DESC LIMIT 10
      ) s
    )
  );
END;
$$;

-- ================================================================
-- RPC 2: Analítica de Usuarios/Miembros
-- Filtro opcional: empresa (si se pasa, omite 'por_empresa')
-- Excluye rol = 'admin' de todos los conteos
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_admin_report_usuarios(
  p_empresa_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'total', (
      SELECT COUNT(*) FROM public.users u
      WHERE u.rol IN ('miembro', 'empresa_admin')
        AND (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
    ),
    'por_estado', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM (
        SELECT estado, COUNT(*) AS total
        FROM public.users u
        WHERE u.rol IN ('miembro', 'empresa_admin')
          AND (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
        GROUP BY estado ORDER BY total DESC
      ) s
    ),
    'por_tipo_cuenta', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM (
        SELECT tipo_cuenta, COUNT(*) AS total
        FROM public.users u
        WHERE u.rol IN ('miembro', 'empresa_admin')
          AND (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
        GROUP BY tipo_cuenta
      ) s
    ),
    'por_sexo', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM (
        SELECT COALESCE(sexo::text, 'no_especificado') AS sexo, COUNT(*) AS total
        FROM public.users u
        WHERE u.rol IN ('miembro', 'empresa_admin')
          AND (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
        GROUP BY sexo
      ) s
    ),
    'por_mes', (
      SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.mes), '[]'::jsonb)
      FROM (
        SELECT date_trunc('month', created_at)::date AS mes, COUNT(*) AS total
        FROM public.users u
        WHERE u.rol IN ('miembro', 'empresa_admin')
          AND (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
        GROUP BY mes ORDER BY mes
      ) s
    ),
    'por_empresa', (
      SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.total DESC), '[]'::jsonb)
      FROM (
        SELECT e.nombre AS empresa, COUNT(*) AS total
        FROM public.users u
        JOIN public.empresas e ON e.id = u.empresa_id
        WHERE u.rol IN ('miembro', 'empresa_admin')
        GROUP BY e.nombre ORDER BY total DESC LIMIT 15
      ) s
    )
  );
END;
$$;

-- ================================================================
-- RPC 3: Resumen de Empresas (admin only, sin filtros)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_admin_report_empresas()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'total', (SELECT COUNT(*) FROM public.empresas),
    'por_estado', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM (
        SELECT estado, COUNT(*) AS total FROM public.empresas GROUP BY estado
      ) s
    ),
    'resumen_por_empresa', (
      SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.total_miembros DESC), '[]'::jsonb)
      FROM (
        SELECT
          e.id,
          e.nombre,
          e.estado,
          e.auto_confirmar_citas,
          COUNT(DISTINCT u.id)                                                                AS total_miembros,
          COUNT(DISTINCT u.id) FILTER (WHERE u.estado = 'activo')                            AS miembros_activos,
          COUNT(DISTINCT c.id)                                                                AS total_citas,
          COUNT(DISTINCT c.id) FILTER (WHERE c.fecha_hora_cita >= date_trunc('month', now())) AS citas_mes,
          COUNT(DISTINCT dm.id)                                                               AS total_documentos
        FROM public.empresas e
        LEFT JOIN public.users u              ON u.empresa_id = e.id AND u.rol IN ('miembro', 'empresa_admin')
        LEFT JOIN public.citas c              ON c.empresa_id = e.id
        LEFT JOIN public.documentos_medicos dm ON dm.usuario_id = u.id AND dm.estado_archivo = 'activo'
        GROUP BY e.id, e.nombre, e.estado, e.auto_confirmar_citas
        ORDER BY total_miembros DESC
      ) s
    )
  );
END;
$$;

-- ================================================================
-- RPC 4: Analítica de Documentos Médicos
-- Filtros opcionales: empresa, rango de fechas (created_at)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_admin_report_documentos(
  p_empresa_id UUID DEFAULT NULL,
  p_desde      DATE DEFAULT NULL,
  p_hasta      DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'total', (
      SELECT COUNT(*) FROM public.documentos_medicos dm
      JOIN public.users u ON u.id = dm.usuario_id
      WHERE dm.estado_archivo = 'activo'
        AND (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
        AND (p_desde IS NULL OR dm.created_at::date >= p_desde)
        AND (p_hasta IS NULL OR dm.created_at::date <= p_hasta)
    ),
    'por_tipo', (
      SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.total DESC), '[]'::jsonb)
      FROM (
        SELECT dm.tipo_documento AS tipo, COUNT(*) AS total
        FROM public.documentos_medicos dm
        JOIN public.users u ON u.id = dm.usuario_id
        WHERE dm.estado_archivo = 'activo'
          AND (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
          AND (p_desde IS NULL OR dm.created_at::date >= p_desde)
          AND (p_hasta IS NULL OR dm.created_at::date <= p_hasta)
        GROUP BY dm.tipo_documento ORDER BY total DESC
      ) s
    ),
    'por_mes', (
      SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.mes), '[]'::jsonb)
      FROM (
        SELECT date_trunc('month', dm.created_at)::date AS mes, COUNT(*) AS total
        FROM public.documentos_medicos dm
        JOIN public.users u ON u.id = dm.usuario_id
        WHERE dm.estado_archivo = 'activo'
          AND (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
          AND (p_desde IS NULL OR dm.created_at::date >= p_desde)
          AND (p_hasta IS NULL OR dm.created_at::date <= p_hasta)
        GROUP BY mes ORDER BY mes
      ) s
    )
  );
END;
$$;

-- ================================================================
-- RPC 5: Analítica de Beneficios (sin filtros — volumen bajo)
-- Nota: beneficios.empresa_id es uuid[] (array), no FK scalar.
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_admin_report_beneficios()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'total', (SELECT COUNT(*) FROM public.beneficios),
    'por_estado', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM (
        SELECT estado_beneficio AS estado, COUNT(*) AS total
        FROM public.beneficios GROUP BY estado_beneficio
      ) s
    ),
    'por_tipo', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM (
        SELECT tipo_beneficio AS tipo, COUNT(*) AS total
        FROM public.beneficios GROUP BY tipo_beneficio
      ) s
    ),
    'alcance', (
      SELECT jsonb_build_object(
        'globales',    COUNT(*) FILTER (WHERE empresa_id IS NULL OR cardinality(empresa_id) = 0),
        'por_empresa', COUNT(*) FILTER (WHERE empresa_id IS NOT NULL AND cardinality(empresa_id) > 0)
      ) FROM public.beneficios
    )
  );
END;
$$;
