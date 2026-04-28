-- Migration: subscription_citas_schema
-- Adds contratos, contrato_servicios, pagos tables and alters citas + estado_sync.

-- 1. New enum values on estado_sync
ALTER TYPE public.estado_sync ADD VALUE IF NOT EXISTS 'pendiente_empresa';
ALTER TYPE public.estado_sync ADD VALUE IF NOT EXISTS 'pendiente_pago';
ALTER TYPE public.estado_sync ADD VALUE IF NOT EXISTS 'pendiente_admin';

-- 2. Payment enums
DO $$ BEGIN
  CREATE TYPE public.metodo_pago AS ENUM ('link_pago', 'transferencia', 'pago_clinica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.estado_pago AS ENUM ('pendiente', 'verificado', 'rechazado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. contratos
CREATE TABLE IF NOT EXISTS public.contratos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE,
  tipo_reset   TEXT NOT NULL CHECK (tipo_reset IN ('mensual','semanal','personalizado')),
  dia_reset    INT  NOT NULL,
  activo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. contrato_servicios
CREATE TABLE IF NOT EXISTS public.contrato_servicios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id       UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  servicio_id       UUID NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  cuota_por_titular INT  NOT NULL CHECK (cuota_por_titular > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contrato_id, servicio_id)
);

-- 5. pagos
CREATE TABLE IF NOT EXISTS public.pagos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cita_id        UUID NOT NULL UNIQUE REFERENCES public.citas(id) ON DELETE CASCADE,
  metodo         public.metodo_pago NOT NULL,
  estado         public.estado_pago NOT NULL DEFAULT 'pendiente',
  monto          NUMERIC(10,2),
  link_url       TEXT,
  referencia     TEXT,
  verificado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
  verificado_at  TIMESTAMPTZ,
  notas          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Alter citas
ALTER TABLE public.citas
  ADD COLUMN IF NOT EXISTS contrato_servicio_id UUID REFERENCES public.contrato_servicios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS titular_ref_id       UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_contratos_empresa   ON public.contratos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cs_contrato         ON public.contrato_servicios(contrato_id);
CREATE INDEX IF NOT EXISTS idx_citas_cs_id         ON public.citas(contrato_servicio_id);
CREATE INDEX IF NOT EXISTS idx_citas_titular_ref   ON public.citas(titular_ref_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cita          ON public.pagos(cita_id);

-- 8. RLS
ALTER TABLE public.contratos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos             ENABLE ROW LEVEL SECURITY;

-- admin: full access
CREATE POLICY contratos_admin_all ON public.contratos
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

CREATE POLICY cs_admin_all ON public.contrato_servicios
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

-- empresa_admin: read own empresa contratos
CREATE POLICY contratos_ea_read ON public.contratos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.rol = 'empresa_admin' AND u.empresa_id = empresa_id
    )
  );

CREATE POLICY cs_ea_read ON public.contrato_servicios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.contratos c ON c.empresa_id = u.empresa_id
      WHERE u.id = auth.uid() AND u.rol = 'empresa_admin'
        AND c.id = contrato_id
    )
  );

-- miembro: read own empresa contratos (for scheduling UI)
CREATE POLICY contratos_miembro_read ON public.contratos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.rol = 'miembro' AND u.empresa_id = empresa_id
    )
  );

CREATE POLICY cs_miembro_read ON public.contrato_servicios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.contratos c ON c.empresa_id = u.empresa_id
      WHERE u.id = auth.uid() AND u.rol = 'miembro' AND c.id = contrato_id
    )
  );

-- pagos: admin full access
CREATE POLICY pagos_admin_all ON public.pagos
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

-- miembro: read + insert own cita's pago
-- NOTE: citas uses paciente_id (not user_id) per initial_schema
CREATE POLICY pagos_miembro_read ON public.pagos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.citas c WHERE c.id = cita_id AND c.paciente_id = auth.uid()
    )
  );

CREATE POLICY pagos_miembro_insert ON public.pagos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.citas c WHERE c.id = cita_id AND c.paciente_id = auth.uid()
    )
  );
