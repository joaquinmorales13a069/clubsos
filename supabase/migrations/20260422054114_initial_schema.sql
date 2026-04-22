-- Enums
CREATE TYPE public.rol_type AS ENUM ('admin', 'empresa_admin', 'miembro');
CREATE TYPE public.estado_usuario AS ENUM ('activo', 'inactivo', 'pendiente');
CREATE TYPE public.estado_sync AS ENUM ('pendiente', 'confirmado', 'completado', 'cancelado');
CREATE TYPE public.tipo_beneficio AS ENUM ('descuento', 'promocion');
CREATE TYPE public.estado_general AS ENUM ('activa', 'expirada');
CREATE TYPE public.tipo_documento AS ENUM ('laboratorio', 'radiologia', 'receta', 'otro');

-- Tabla: empresas
CREATE TABLE public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    detalles JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla: users (Extiende auth.users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo TEXT,
    rol public.rol_type NOT NULL DEFAULT 'miembro',
    estado public.estado_usuario NOT NULL DEFAULT 'pendiente',
    telefono TEXT,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla: citas
CREATE TABLE public.citas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha_hora_cita TIMESTAMPTZ NOT NULL,
    paciente_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    estado_sync public.estado_sync NOT NULL DEFAULT 'pendiente',
    servicio_asociado TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla: beneficios (Descuentos y Promociones)
CREATE TABLE public.beneficios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descripcion TEXT,
    fecha_inicio TIMESTAMPTZ,
    fecha_fin TIMESTAMPTZ,
    estado_beneficio public.estado_general NOT NULL DEFAULT 'activa',
    creado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    tipo_beneficio public.tipo_beneficio NOT NULL,
    empresa_id UUID[],
    beneficio_image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla: avisos (Anuncios)
CREATE TABLE public.avisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descripcion TEXT,
    fecha_inicio TIMESTAMPTZ,
    fecha_fin TIMESTAMPTZ,
    estado_aviso public.estado_general NOT NULL DEFAULT 'activa',
    creado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    empresa_id UUID[],
    aviso_image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla: documentos_medicos
CREATE TABLE public.documentos_medicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    nombre_documento TEXT NOT NULL,
    tipo_documento public.tipo_documento NOT NULL,
    file_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Configurar RLS (Row Level Security)
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_medicos ENABLE ROW LEVEL SECURITY;

-- Helper Function para obtener rol actual
CREATE OR REPLACE FUNCTION public.get_auth_rol()
RETURNS public.rol_type AS $$
  SELECT rol FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper Function para obtener empresa_id actual
CREATE OR REPLACE FUNCTION public.get_auth_empresa()
RETURNS UUID AS $$
  SELECT empresa_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Politicas para "empresas"
CREATE POLICY "empresas_admin_all" ON public.empresas
  FOR ALL USING (public.get_auth_rol() = 'admin');

CREATE POLICY "empresas_empresa_admin_read" ON public.empresas
  FOR SELECT USING (public.get_auth_rol() = 'empresa_admin' AND id = public.get_auth_empresa());

CREATE POLICY "empresas_miembro_read" ON public.empresas
  FOR SELECT USING (public.get_auth_rol() = 'miembro' AND id = public.get_auth_empresa());

-- Politicas para "users"
CREATE POLICY "users_admin_all" ON public.users
  FOR ALL USING (public.get_auth_rol() = 'admin');

CREATE POLICY "users_empresa_admin_read" ON public.users
  FOR SELECT USING (public.get_auth_rol() = 'empresa_admin' AND empresa_id = public.get_auth_empresa());

CREATE POLICY "users_empresa_admin_update" ON public.users
  FOR UPDATE USING (public.get_auth_rol() = 'empresa_admin' AND empresa_id = public.get_auth_empresa());

CREATE POLICY "users_self_read" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Politicas para "citas"
CREATE POLICY "citas_admin_all" ON public.citas
  FOR ALL USING (public.get_auth_rol() = 'admin');

CREATE POLICY "citas_empresa_admin_read" ON public.citas
  FOR SELECT USING (
    public.get_auth_rol() = 'empresa_admin' AND 
    paciente_id IN (SELECT id FROM public.users WHERE empresa_id = public.get_auth_empresa())
  );

CREATE POLICY "citas_miembro_crud" ON public.citas
  FOR ALL USING (auth.uid() = paciente_id);

-- Politicas para "beneficios" y "avisos"
CREATE POLICY "beneficios_admin_all" ON public.beneficios
  FOR ALL USING (public.get_auth_rol() = 'admin');

CREATE POLICY "beneficios_read" ON public.beneficios
  FOR SELECT USING (
    empresa_id IS NULL OR public.get_auth_empresa() = ANY(empresa_id)
  );

CREATE POLICY "avisos_admin_all" ON public.avisos
  FOR ALL USING (public.get_auth_rol() = 'admin');

CREATE POLICY "avisos_read" ON public.avisos
  FOR SELECT USING (
    empresa_id IS NULL OR public.get_auth_empresa() = ANY(empresa_id)
  );

-- Politicas para "documentos_medicos"
CREATE POLICY "documentos_admin_all" ON public.documentos_medicos
  FOR ALL USING (public.get_auth_rol() = 'admin');

CREATE POLICY "documentos_self_crud" ON public.documentos_medicos
  FOR ALL USING (auth.uid() = usuario_id);

-- Trigger Function: Auto-create user profile
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, nombre_completo, telefono)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'nombre_completo',
    new.phone
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: After auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
