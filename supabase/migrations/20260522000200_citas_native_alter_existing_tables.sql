-- Migración: alter de tablas existentes para el módulo nativo de citas.
-- - doctores: agrega ubicacion_id, drop ea_provider_id, ea_servicios
-- - servicios: agrega slot_duracion, drop ea_service_id, ea_category_id
-- - citas: agrega doctor_id/servicio_id/ubicacion_id/fecha_hora_fin + columnas
--   de auditoría, drop ea_*
-- - users: drop ea_customer_id
-- - configuracion_sistema: agrega ventana_cancelacion_horas

BEGIN;

-- Drop FKs en citas que dependen de columnas ea_* en doctores/servicios antes
-- de poder eliminar esas columnas.
ALTER TABLE public.citas
  DROP CONSTRAINT IF EXISTS citas_ea_service_id_fkey,
  DROP CONSTRAINT IF EXISTS citas_ea_provider_id_fkey;

-- ── doctores ───────────────────────────────────────────────────────────────
ALTER TABLE public.doctores
  ADD COLUMN ubicacion_id UUID REFERENCES public.ubicaciones(id);

-- Poblar doctor_servicios desde el array ea_servicios (mientras todavía existe)
INSERT INTO public.doctor_servicios (doctor_id, servicio_id)
SELECT d.id, s.id
FROM public.doctores d
CROSS JOIN LATERAL unnest(d.ea_servicios) AS ea_id
JOIN public.servicios s ON s.ea_service_id = ea_id
ON CONFLICT DO NOTHING;

ALTER TABLE public.doctores
  DROP COLUMN IF EXISTS ea_provider_id,
  DROP COLUMN IF EXISTS ea_servicios;

-- ── servicios ──────────────────────────────────────────────────────────────
ALTER TABLE public.servicios
  ADD COLUMN slot_duracion SMALLINT NOT NULL DEFAULT 1 CHECK (slot_duracion > 0);

ALTER TABLE public.servicios
  DROP COLUMN IF EXISTS ea_service_id,
  DROP COLUMN IF EXISTS ea_category_id;

-- ── citas ──────────────────────────────────────────────────────────────────
ALTER TABLE public.citas
  ADD COLUMN doctor_id        UUID REFERENCES public.doctores(id) ON DELETE RESTRICT,
  ADD COLUMN servicio_id      UUID REFERENCES public.servicios(id) ON DELETE RESTRICT,
  ADD COLUMN ubicacion_id     UUID REFERENCES public.ubicaciones(id) ON DELETE RESTRICT,
  ADD COLUMN fecha_hora_fin   TIMESTAMPTZ,
  ADD COLUMN confirmado_por   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN confirmado_at    TIMESTAMPTZ,
  ADD COLUMN rechazado_por    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN rechazado_at     TIMESTAMPTZ,
  ADD COLUMN motivo_rechazo   TEXT,
  ADD COLUMN cancelado_por    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN cancelado_at     TIMESTAMPTZ,
  ADD COLUMN motivo_cancelacion TEXT;

ALTER TABLE public.citas
  DROP COLUMN IF EXISTS ea_service_id,
  DROP COLUMN IF EXISTS ea_provider_id,
  DROP COLUMN IF EXISTS ea_appointment_id,
  DROP COLUMN IF EXISTS ea_customer_id;

ALTER TABLE public.citas
  ALTER COLUMN doctor_id    SET NOT NULL,
  ALTER COLUMN servicio_id  SET NOT NULL,
  ALTER COLUMN ubicacion_id SET NOT NULL,
  ALTER COLUMN fecha_hora_fin SET NOT NULL;

-- ── users ──────────────────────────────────────────────────────────────────
ALTER TABLE public.users
  DROP COLUMN IF EXISTS ea_customer_id;

-- ── configuracion_sistema ─────────────────────────────────────────────────
-- Nota: la tabla solo tiene columnas (clave, valor, updated_at); no hay descripcion.
INSERT INTO public.configuracion_sistema (clave, valor)
VALUES (
  'ventana_cancelacion_horas',
  '24'::jsonb
)
ON CONFLICT (clave) DO NOTHING;

COMMIT;
