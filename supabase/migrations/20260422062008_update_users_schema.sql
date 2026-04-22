-- Nuevos Enums
CREATE TYPE public.tipo_cuenta_type AS ENUM ('titular', 'familiar');
CREATE TYPE public.sexo_type AS ENUM ('masculino', 'femenino');

-- Alterar tabla empresas
ALTER TABLE public.empresas
ADD COLUMN codigo_empresa TEXT UNIQUE;

-- Alterar tabla users
ALTER TABLE public.users
ADD COLUMN tipo_cuenta public.tipo_cuenta_type NOT NULL DEFAULT 'titular',
ADD COLUMN fecha_nacimiento DATE,
ADD COLUMN sexo public.sexo_type,
ADD COLUMN documento_identidad TEXT,
ADD COLUMN titular_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Actualizar la función del Trigger para leer los nuevos metadatos
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    id, 
    nombre_completo, 
    telefono, 
    tipo_cuenta, 
    fecha_nacimiento, 
    sexo, 
    documento_identidad, 
    empresa_id, 
    titular_id
  )
  VALUES (
    new.id,
    new.raw_user_meta_data->>'nombre_completo',
    new.phone,
    COALESCE((new.raw_user_meta_data->>'tipo_cuenta')::public.tipo_cuenta_type, 'titular'::public.tipo_cuenta_type),
    (new.raw_user_meta_data->>'fecha_nacimiento')::DATE,
    (new.raw_user_meta_data->>'sexo')::public.sexo_type,
    new.raw_user_meta_data->>'documento_identidad',
    NULLIF(new.raw_user_meta_data->>'empresa_id', '')::UUID,
    NULLIF(new.raw_user_meta_data->>'titular_id', '')::UUID
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nuevas Políticas RLS para Users (Jerarquía Familiar)
-- Titular puede leer a sus familiares
CREATE POLICY "users_titular_read_familiares" ON public.users
  FOR SELECT USING (public.get_auth_rol() = 'miembro' AND titular_id = auth.uid());

-- Titular puede actualizar a sus familiares (ej. aprobarlos)
CREATE POLICY "users_titular_update_familiares" ON public.users
  FOR UPDATE USING (public.get_auth_rol() = 'miembro' AND titular_id = auth.uid());
