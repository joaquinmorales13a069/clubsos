-- =============================================================================
-- Step 5.0 — Schema Extensions for Miembro Dashboard
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend public.citas with Easy!Appointments and patient fields
-- -----------------------------------------------------------------------------
ALTER TABLE public.citas
  ADD COLUMN IF NOT EXISTS empresa_id        UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ea_service_id     INT,
  ADD COLUMN IF NOT EXISTS ea_provider_id    INT,
  ADD COLUMN IF NOT EXISTS ea_customer_id    TEXT,
  ADD COLUMN IF NOT EXISTS ea_appointment_id TEXT,
  ADD COLUMN IF NOT EXISTS para_titular      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS paciente_nombre   TEXT,
  ADD COLUMN IF NOT EXISTS paciente_telefono TEXT,
  ADD COLUMN IF NOT EXISTS paciente_correo   TEXT,
  ADD COLUMN IF NOT EXISTS paciente_cedula   TEXT,
  ADD COLUMN IF NOT EXISTS motivo_cita       TEXT;

-- -----------------------------------------------------------------------------
-- 2. Extend tipo_documento enum with new categories
--    (Postgres does not support IF NOT EXISTS on ALTER TYPE ADD VALUE,
--     so we guard with a DO block)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'consulta_medica'
      AND enumtypid = 'public.tipo_documento'::regtype
  ) THEN
    ALTER TYPE public.tipo_documento ADD VALUE 'consulta_medica';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'especialidades'
      AND enumtypid = 'public.tipo_documento'::regtype
  ) THEN
    ALTER TYPE public.tipo_documento ADD VALUE 'especialidades';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Extend public.documentos_medicos with display and filter columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.documentos_medicos
  ADD COLUMN IF NOT EXISTS tipo_archivo    TEXT,
  ADD COLUMN IF NOT EXISTS fecha_documento DATE,
  ADD COLUMN IF NOT EXISTS subido_por      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estado_archivo  TEXT NOT NULL DEFAULT 'activo';

-- -----------------------------------------------------------------------------
-- 4. New catalog table: public.servicios
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.servicios (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  ea_service_id  INT     UNIQUE NOT NULL,
  ea_category_id INT     NOT NULL,
  nombre         TEXT    NOT NULL,
  duracion       INT,                   -- minutes
  precio         NUMERIC(10, 2),
  descripcion    TEXT,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active services
CREATE POLICY "servicios_authenticated_read" ON public.servicios
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only global admin can write
CREATE POLICY "servicios_admin_all" ON public.servicios
  FOR ALL USING (public.get_auth_rol() = 'admin');

-- -----------------------------------------------------------------------------
-- 5. New catalog table: public.doctores
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctores (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  ea_provider_id INT     UNIQUE NOT NULL,
  nombre         TEXT    NOT NULL,
  correo         TEXT,
  ea_servicios   INT[]   DEFAULT '{}',  -- array of ea_service_id values
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.doctores ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active doctors
CREATE POLICY "doctores_authenticated_read" ON public.doctores
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only global admin can write
CREATE POLICY "doctores_admin_all" ON public.doctores
  FOR ALL USING (public.get_auth_rol() = 'admin');

-- -----------------------------------------------------------------------------
-- 6. updated_at triggers for new tables
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER servicios_updated_at
  BEFORE UPDATE ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER doctores_updated_at
  BEFORE UPDATE ON public.doctores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
