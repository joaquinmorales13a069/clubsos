-- Migración: limpieza de datos de prueba + creación de tablas nuevas para el
-- módulo nativo de citas. Reemplaza la integración con Easy! Appointments.
-- Spec: docs/superpowers/specs/2026-05-22-citas-modulo-nativo-design.md

BEGIN;

-- 0. Función helper para mantener updated_at (usada por triggers más abajo)
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1. Datos de prueba: se eliminan las citas existentes antes de cualquier
--    cambio de schema. doctores y servicios se conservan; los campos ea_*
--    se droppean en la siguiente migración.
DELETE FROM public.pagos;       -- FK a citas con ON DELETE CASCADE, redundante pero explícito
DELETE FROM public.citas;

-- 2. Tabla ubicaciones (clínicas)
CREATE TABLE IF NOT EXISTS public.ubicaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL UNIQUE,
  direccion     TEXT,
  telefono      TEXT,
  zona_horaria  TEXT NOT NULL DEFAULT 'America/Managua',
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_ubicaciones_updated_at
  BEFORE UPDATE ON public.ubicaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.ubicaciones ENABLE ROW LEVEL SECURITY;

-- 3. Tabla horarios_doctores (horario semanal recurrente por doctor)
CREATE TABLE IF NOT EXISTS public.horarios_doctores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id      UUID NOT NULL REFERENCES public.doctores(id) ON DELETE CASCADE,
  dia_semana     SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio    TIME NOT NULL,
  hora_fin       TIME NOT NULL,
  slot_duracion  SMALLINT NOT NULL DEFAULT 30 CHECK (slot_duracion > 0),
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT horarios_hora_valida CHECK (hora_fin > hora_inicio),
  CONSTRAINT horarios_unicos UNIQUE (doctor_id, dia_semana, hora_inicio)
);

CREATE TRIGGER trg_horarios_doctores_updated_at
  BEFORE UPDATE ON public.horarios_doctores
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_horarios_doctor_dia
  ON public.horarios_doctores (doctor_id, dia_semana)
  WHERE activo;

ALTER TABLE public.horarios_doctores ENABLE ROW LEVEL SECURITY;

-- 4. Tabla excepciones_horario (vacaciones, feriados, bloqueos puntuales)
--    doctor_id NULL = aplica a todos. ubicacion_id NULL = todas las ubicaciones.
CREATE TABLE IF NOT EXISTS public.excepciones_horario (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     UUID REFERENCES public.doctores(id) ON DELETE CASCADE,
  ubicacion_id  UUID REFERENCES public.ubicaciones(id) ON DELETE CASCADE,
  fecha_inicio  TIMESTAMPTZ NOT NULL,
  fecha_fin     TIMESTAMPTZ NOT NULL,
  motivo        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT excepciones_fechas_validas CHECK (fecha_fin > fecha_inicio)
);

CREATE INDEX idx_excepciones_doctor_fechas
  ON public.excepciones_horario (doctor_id, fecha_inicio, fecha_fin);

CREATE INDEX idx_excepciones_ubicacion_fechas
  ON public.excepciones_horario (ubicacion_id, fecha_inicio, fecha_fin)
  WHERE ubicacion_id IS NOT NULL;

ALTER TABLE public.excepciones_horario ENABLE ROW LEVEL SECURITY;

-- 5. Tabla pivote doctor_servicios (reemplaza array ea_servicios en doctores)
CREATE TABLE IF NOT EXISTS public.doctor_servicios (
  doctor_id    UUID NOT NULL REFERENCES public.doctores(id) ON DELETE CASCADE,
  servicio_id  UUID NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (doctor_id, servicio_id)
);

CREATE INDEX idx_doctor_servicios_servicio
  ON public.doctor_servicios (servicio_id);

ALTER TABLE public.doctor_servicios ENABLE ROW LEVEL SECURITY;

COMMIT;
