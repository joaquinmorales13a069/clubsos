# Fase 1 — Schema + RPCs (Módulo nativo de citas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el schema de DB completo para el módulo nativo de citas y todas las RPCs Postgres necesarias para booking atómico, consulta de disponibilidad y administración de citas. Esto solo afecta a la DB; el bug de duplicados queda mitigado en la capa de DB aunque el wizard del miembro siga llamando a EA hasta la Fase 3.

**Architecture:** 8 migraciones Postgres aplicadas en orden, más scripts SQL ad-hoc para tests de concurrencia. Datos de prueba existentes (`citas`) se borran antes de los cambios de schema. Las RPCs son `SECURITY DEFINER` y usan `pg_advisory_xact_lock` + índice único parcial para garantizar atomicidad.

**Tech Stack:** Postgres 17.6 (Supabase), `pg_cron`, `pg_net`, `plpgsql`. CLI: `supabase db push`.

---

## File Structure

### Migraciones nuevas (`supabase/migrations/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `20260522000100_citas_native_cleanup_and_new_tables.sql` | DELETE de datos prueba + crear `ubicaciones`, `horarios_doctores`, `excepciones_horario`, `doctor_servicios` |
| `20260522000200_citas_native_alter_existing_tables.sql` | ALTER de `doctores`, `servicios`, `citas`, `users`, `configuracion_sistema`. Migrar `ea_servicios` array → `doctor_servicios` |
| `20260522000300_citas_native_indexes_and_realtime.sql` | Drop índice viejo, crear nuevo `citas_no_double_booking` por `doctor_id`. Publicación Realtime |
| `20260522000400_citas_native_seed_ubicaciones.sql` | Seed inicial de "Clínica Managua" y "Clínica León" |
| `20260522000500_citas_native_rpc_disponibilidad.sql` | RPCs `obtener_slots_disponibles`, `obtener_dias_disponibles` |
| `20260522000600_citas_native_rpc_crear_cita.sql` | RPC crítica `crear_cita_atomic` |
| `20260522000700_citas_native_rpc_admin_actions.sql` | RPCs `confirmar_cita`, `rechazar_cita`, `cancelar_cita` |
| `20260522000800_citas_native_rls.sql` | Políticas RLS de las tablas nuevas |

### Scripts de test (`supabase/tests/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `citas_concurrency.sql` | Tests de doble-booking, multi-slot, excepciones, cuota |

---

## Task 1: Preparar branch y verificar punto de partida

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Confirmar branch y estado limpio**

Run:
```bash
git status --short && git branch --show-current
```

Expected:
```
feat/citas-modulo-nativo
```
(sin cambios sin commitear; el spec ya está commiteado).

- [ ] **Step 2: Confirmar que la extensión `pg_cron` y `pg_net` están habilitadas (vía MCP o psql)**

Si usás el MCP de Supabase:
```
mcp__plugin_supabase_supabase__list_extensions  (project_id: jdhaxwklszodavhdrtsp)
```

Buscar `pg_cron` e `pg_net` — ambas deben tener `installed_version` no nulo. (Ya verificado en el spec.)

---

## Task 2: Migración — cleanup + tablas nuevas

**Files:**
- Create: `supabase/migrations/20260522000100_citas_native_cleanup_and_new_tables.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Migración: limpieza de datos de prueba + creación de tablas nuevas para el
-- módulo nativo de citas. Reemplaza la integración con Easy! Appointments.
-- Spec: docs/superpowers/specs/2026-05-22-citas-modulo-nativo-design.md

BEGIN;

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
```

**Nota:** asume que existe la función `public.tg_set_updated_at()` (chequea con `\df tg_set_updated_at` en psql). Si no existe, agregar al inicio de la migración:

```sql
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
```

- [ ] **Step 2: Aplicar la migración**

Run:
```bash
supabase db push
```

Expected: `Applying migration 20260522000100_citas_native_cleanup_and_new_tables.sql...` sin errores.

- [ ] **Step 3: Verificar tablas creadas (vía MCP o psql)**

Vía MCP:
```
mcp__plugin_supabase_supabase__list_tables (project_id: jdhaxwklszodavhdrtsp, schemas: ["public"])
```

Confirmar presencia de: `ubicaciones`, `horarios_doctores`, `excepciones_horario`, `doctor_servicios`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000100_citas_native_cleanup_and_new_tables.sql
git commit -m "feat(citas): create new tables for native module (ubicaciones, horarios_doctores, excepciones_horario, doctor_servicios)"
```

---

## Task 3: Migración — alter tablas existentes

**Files:**
- Create: `supabase/migrations/20260522000200_citas_native_alter_existing_tables.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Migración: alter de tablas existentes para el módulo nativo de citas.
-- - doctores: agrega ubicacion_id, drop ea_provider_id, ea_servicios
-- - servicios: agrega slot_duracion, drop ea_service_id, ea_category_id
-- - citas: agrega doctor_id/servicio_id/ubicacion_id/fecha_hora_fin + columnas
--   de auditoría, drop ea_*
-- - users: drop ea_customer_id
-- - configuracion_sistema: agrega ventana_cancelacion_horas

BEGIN;

-- ── doctores ───────────────────────────────────────────────────────────────
ALTER TABLE public.doctores
  ADD COLUMN ubicacion_id UUID REFERENCES public.ubicaciones(id);
-- nullable por ahora; el seed de ubicaciones (Task 5) y la asignación inicial
-- por admin lo poblan; otra migración posterior agrega NOT NULL.

-- Poblar doctor_servicios desde el array ea_servicios (mientras todavía existe)
INSERT INTO public.doctor_servicios (doctor_id, servicio_id)
SELECT d.id, s.id
FROM public.doctores d
CROSS JOIN LATERAL unnest(d.ea_servicios) AS ea_id
JOIN public.servicios s ON s.ea_service_id = ea_id
ON CONFLICT DO NOTHING;

-- Ahora sí, drop de las columnas ea_*
ALTER TABLE public.doctores
  DROP COLUMN IF EXISTS ea_provider_id,
  DROP COLUMN IF EXISTS ea_servicios;

-- ── servicios ──────────────────────────────────────────────────────────────
ALTER TABLE public.servicios
  ADD COLUMN slot_duracion SMALLINT NOT NULL DEFAULT 1 CHECK (slot_duracion > 0);
-- slot_duracion = cuántos slots del horario consume una cita de este servicio.

-- Drop columnas ea_*
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

-- Drop FKs y columnas ea_* de citas
ALTER TABLE public.citas
  DROP CONSTRAINT IF EXISTS citas_ea_service_id_fkey,
  DROP CONSTRAINT IF EXISTS citas_ea_provider_id_fkey;

ALTER TABLE public.citas
  DROP COLUMN IF EXISTS ea_service_id,
  DROP COLUMN IF EXISTS ea_provider_id,
  DROP COLUMN IF EXISTS ea_appointment_id,
  DROP COLUMN IF EXISTS ea_customer_id;

-- Como la tabla quedó vacía (Task 2 hizo DELETE), podemos hacer las columnas NOT NULL
-- directamente. Si por alguna razón hay filas, agregar UPDATE acá antes de SET NOT NULL.
ALTER TABLE public.citas
  ALTER COLUMN doctor_id    SET NOT NULL,
  ALTER COLUMN servicio_id  SET NOT NULL,
  ALTER COLUMN ubicacion_id SET NOT NULL,
  ALTER COLUMN fecha_hora_fin SET NOT NULL;

-- ── users ──────────────────────────────────────────────────────────────────
ALTER TABLE public.users
  DROP COLUMN IF EXISTS ea_customer_id;

-- ── configuracion_sistema ─────────────────────────────────────────────────
-- Asume que configuracion_sistema es una tabla key/value (clave TEXT, valor JSONB).
-- Si tiene un schema distinto, ajustar el INSERT.
INSERT INTO public.configuracion_sistema (clave, valor, descripcion)
VALUES (
  'ventana_cancelacion_horas',
  '24'::jsonb,
  'Horas mínimas de anticipación para que un paciente pueda cancelar su cita'
)
ON CONFLICT (clave) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Verificar el schema de `configuracion_sistema` antes de aplicar**

Run en MCP o psql:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'configuracion_sistema';
```

Si la tabla tiene columnas distintas a `clave/valor/descripcion`, ajustar el `INSERT` final. Las migraciones existentes son: `20260428220000_configuracion_sistema.sql` — leer ese archivo para confirmar.

- [ ] **Step 3: Aplicar la migración**

Run:
```bash
supabase db push
```

Expected: éxito sin errores.

- [ ] **Step 4: Verificar que `doctor_servicios` se pobló correctamente**

```sql
SELECT COUNT(*) FROM public.doctor_servicios;
```

Debería tener N filas según los doctores existentes y sus arrays `ea_servicios`. Si retorna 0, revisar: puede que `doctores.ea_servicios` haya estado vacío o que los IDs no matchearan con `servicios.ea_service_id`.

- [ ] **Step 5: Verificar columnas de `citas`**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'citas'
ORDER BY ordinal_position;
```

Confirmar presencia de: `doctor_id`, `servicio_id`, `ubicacion_id`, `fecha_hora_fin`, `confirmado_por`, etc. Confirmar ausencia de cualquier `ea_*`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260522000200_citas_native_alter_existing_tables.sql
git commit -m "feat(citas): alter existing tables for native module, drop ea_* columns"
```

---

## Task 4: Migración — índices + Realtime

**Files:**
- Create: `supabase/migrations/20260522000300_citas_native_indexes_and_realtime.sql`

- [ ] **Step 1: Crear el archivo**

```sql
-- Migración: índices críticos para el módulo nativo de citas + habilitar Realtime.

BEGIN;

-- 1. Drop del índice viejo de double-booking (basado en ea_provider_id/ea_service_id)
DROP INDEX IF EXISTS public.citas_no_double_booking;

-- 2. Nuevo índice único parcial: dos citas activas para el mismo doctor en el mismo
--    instante son imposibles. estado_sync NOT IN ('cancelado','rechazado') libera
--    el slot cuando una cita se cancela o se rechaza.
CREATE UNIQUE INDEX citas_no_double_booking
  ON public.citas (doctor_id, fecha_hora_cita)
  WHERE estado_sync NOT IN ('cancelado', 'rechazado');

-- 3. Índices de soporte para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_citas_doctor_fecha
  ON public.citas (doctor_id, fecha_hora_cita);

CREATE INDEX IF NOT EXISTS idx_citas_ubicacion_fecha
  ON public.citas (ubicacion_id, fecha_hora_cita);

CREATE INDEX IF NOT EXISTS idx_citas_paciente_fecha
  ON public.citas (paciente_id, fecha_hora_cita DESC);

CREATE INDEX IF NOT EXISTS idx_citas_estado
  ON public.citas (estado_sync, fecha_hora_cita)
  WHERE estado_sync IN ('pendiente', 'pendiente_admin', 'pendiente_empresa', 'pendiente_pago', 'confirmado');

-- 4. Habilitar Realtime sobre citas (para PasoHorario y calendario admin)
ALTER PUBLICATION supabase_realtime ADD TABLE public.citas;

COMMIT;
```

- [ ] **Step 2: Aplicar**

Run:
```bash
supabase db push
```

- [ ] **Step 3: Verificar índices creados**

```sql
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'citas';
```

Esperar ver `citas_no_double_booking`, `idx_citas_doctor_fecha`, etc.

- [ ] **Step 4: Verificar publicación Realtime**

```sql
SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```

Esperar ver `public.citas` en la lista.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260522000300_citas_native_indexes_and_realtime.sql
git commit -m "feat(citas): replace double-booking index by doctor_id + enable Realtime"
```

---

## Task 5: Migración — seed de ubicaciones

**Files:**
- Create: `supabase/migrations/20260522000400_citas_native_seed_ubicaciones.sql`

- [ ] **Step 1: Crear el archivo**

```sql
-- Migración: seed inicial de ubicaciones (Clínica Managua, Clínica León).
-- Los ea_category_id históricos eran 1 (Managua) y 2 (León), conservamos el orden.

BEGIN;

INSERT INTO public.ubicaciones (nombre, direccion, zona_horaria, activo)
VALUES
  ('Clínica Managua', NULL, 'America/Managua', TRUE),
  ('Clínica León',    NULL, 'America/Managua', TRUE)
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Aplicar**

Run:
```bash
supabase db push
```

- [ ] **Step 3: Verificar**

```sql
SELECT id, nombre FROM public.ubicaciones ORDER BY nombre;
```

Esperar 2 filas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000400_citas_native_seed_ubicaciones.sql
git commit -m "feat(citas): seed Clínica Managua y Clínica León"
```

---

## Task 6: Migración — RPC de disponibilidad

**Files:**
- Create: `supabase/migrations/20260522000500_citas_native_rpc_disponibilidad.sql`

Esta es una migración grande pero conceptualmente simple: dos funciones de solo lectura.

- [ ] **Step 1: Crear el archivo**

```sql
-- Migración: RPCs de consulta de disponibilidad.
-- - obtener_slots_disponibles(doctor, servicio, fecha) → grid del día con bool
-- - obtener_dias_disponibles(doctor, mes_inicio, mes_fin) → días con al menos 1 slot

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- obtener_slots_disponibles
-- Devuelve la grilla completa del día (libres y ocupados). El cliente decide
-- qué pintar como deshabilitado. La duración de la cita se calcula desde
-- servicios.slot_duracion (cuántos slots consume) × horarios_doctores.slot_duracion.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.obtener_slots_disponibles(
  p_doctor_id   UUID,
  p_servicio_id UUID,
  p_fecha       DATE
)
RETURNS TABLE (
  hora_inicio TIMESTAMPTZ,
  hora_fin    TIMESTAMPTZ,
  disponible  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_servicio_slots SMALLINT;
  v_doctor_tz      TEXT;
  v_dia_semana     SMALLINT;
BEGIN
  -- Validación: doctor ofrece el servicio
  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_servicios
    WHERE doctor_id = p_doctor_id AND servicio_id = p_servicio_id
  ) THEN
    RAISE EXCEPTION 'INVALID_DOCTOR_SERVICE' USING ERRCODE = 'P0001';
  END IF;

  SELECT slot_duracion INTO v_servicio_slots
  FROM public.servicios WHERE id = p_servicio_id;

  SELECT u.zona_horaria INTO v_doctor_tz
  FROM public.doctores d
  JOIN public.ubicaciones u ON u.id = d.ubicacion_id
  WHERE d.id = p_doctor_id;

  IF v_doctor_tz IS NULL THEN
    v_doctor_tz := 'America/Managua';
  END IF;

  v_dia_semana := EXTRACT(DOW FROM p_fecha)::SMALLINT;

  RETURN QUERY
  WITH bloques AS (
    SELECT
      h.hora_inicio,
      h.hora_fin,
      h.slot_duracion AS slot_minutos
    FROM public.horarios_doctores h
    WHERE h.doctor_id = p_doctor_id
      AND h.dia_semana = v_dia_semana
      AND h.activo
  ),
  slots AS (
    SELECT
      (timestamp_at_tz)::TIMESTAMPTZ AS slot_start,
      (timestamp_at_tz + ((b.slot_minutos * v_servicio_slots) || ' minutes')::INTERVAL)::TIMESTAMPTZ AS slot_end,
      b.slot_minutos
    FROM bloques b,
    LATERAL (
      SELECT generate_series(
        (p_fecha || ' ' || b.hora_inicio)::TIMESTAMP AT TIME ZONE v_doctor_tz,
        ((p_fecha || ' ' || b.hora_fin)::TIMESTAMP AT TIME ZONE v_doctor_tz)
          - ((b.slot_minutos * v_servicio_slots) || ' minutes')::INTERVAL,
        (b.slot_minutos || ' minutes')::INTERVAL
      ) AS timestamp_at_tz
    ) gs
  ),
  ocupados AS (
    SELECT s.slot_start
    FROM slots s
    WHERE EXISTS (
      SELECT 1 FROM public.citas c
      WHERE c.doctor_id = p_doctor_id
        AND c.estado_sync NOT IN ('cancelado', 'rechazado')
        AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
            && tstzrange(s.slot_start, s.slot_end, '[)')
    )
  ),
  bloqueados AS (
    SELECT s.slot_start
    FROM slots s
    WHERE EXISTS (
      SELECT 1 FROM public.excepciones_horario e
      WHERE (e.doctor_id IS NULL OR e.doctor_id = p_doctor_id)
        AND tstzrange(e.fecha_inicio, e.fecha_fin, '[)')
            && tstzrange(s.slot_start, s.slot_end, '[)')
    )
  )
  SELECT
    s.slot_start,
    s.slot_end,
    (s.slot_start NOT IN (SELECT slot_start FROM ocupados))
    AND (s.slot_start NOT IN (SELECT slot_start FROM bloqueados))
    AS disponible
  FROM slots s
  ORDER BY s.slot_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_slots_disponibles(UUID, UUID, DATE)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- obtener_dias_disponibles
-- Para pintar el calendario en PasoFecha. Devuelve una fila por día del rango,
-- con tiene_slots TRUE si hay al menos un slot disponible (no requiere servicio
-- porque solo nos interesa que el doctor atienda ese día).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.obtener_dias_disponibles(
  p_doctor_id   UUID,
  p_fecha_inicio DATE,
  p_fecha_fin    DATE
)
RETURNS TABLE (
  fecha       DATE,
  tiene_slots BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_tz TEXT;
BEGIN
  SELECT u.zona_horaria INTO v_doctor_tz
  FROM public.doctores d
  JOIN public.ubicaciones u ON u.id = d.ubicacion_id
  WHERE d.id = p_doctor_id;

  IF v_doctor_tz IS NULL THEN
    v_doctor_tz := 'America/Managua';
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT d::DATE AS f
    FROM generate_series(p_fecha_inicio, p_fecha_fin, '1 day'::INTERVAL) d
  ),
  con_horario AS (
    SELECT
      d.f,
      EXISTS (
        SELECT 1 FROM public.horarios_doctores h
        WHERE h.doctor_id = p_doctor_id
          AND h.dia_semana = EXTRACT(DOW FROM d.f)::SMALLINT
          AND h.activo
      ) AS atiende
    FROM dias d
  ),
  con_excepciones AS (
    SELECT
      ch.f,
      ch.atiende AND NOT EXISTS (
        -- Excepción que cubre todo el día
        SELECT 1 FROM public.excepciones_horario e
        WHERE (e.doctor_id IS NULL OR e.doctor_id = p_doctor_id)
          AND tstzrange(e.fecha_inicio, e.fecha_fin, '[)')
              @> tstzrange(
                (ch.f || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_doctor_tz,
                ((ch.f + 1) || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_doctor_tz,
                '[)'
              )
      ) AS atiende_efectivo
    FROM con_horario ch
  )
  SELECT ce.f, ce.atiende_efectivo
  FROM con_excepciones ce
  ORDER BY ce.f;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_dias_disponibles(UUID, DATE, DATE)
  TO authenticated;

COMMIT;
```

- [ ] **Step 2: Aplicar**

```bash
supabase db push
```

- [ ] **Step 3: Smoke test con datos sintéticos (vía MCP o psql)**

Crear un horario temporal para uno de los doctores existentes:

```sql
-- Reemplaza <doctor_id> con el id real de un doctor de prueba
INSERT INTO public.horarios_doctores (doctor_id, dia_semana, hora_inicio, hora_fin, slot_duracion)
VALUES ('<doctor_id>', EXTRACT(DOW FROM CURRENT_DATE)::SMALLINT, '08:00', '12:00', 30);

-- Asociar ese doctor con un servicio existente (si no lo está)
INSERT INTO public.doctor_servicios (doctor_id, servicio_id)
SELECT '<doctor_id>', id FROM public.servicios LIMIT 1
ON CONFLICT DO NOTHING;

-- Asignarle ubicación
UPDATE public.doctores SET ubicacion_id = (SELECT id FROM public.ubicaciones WHERE nombre = 'Clínica Managua')
WHERE id = '<doctor_id>';

-- Probar la RPC
SELECT * FROM public.obtener_slots_disponibles(
  '<doctor_id>',
  (SELECT servicio_id FROM public.doctor_servicios WHERE doctor_id = '<doctor_id>' LIMIT 1),
  CURRENT_DATE
);
```

Esperar 8 filas (4 horas × 2 slots/hora con `slot_duracion=30`), todas con `disponible = TRUE`.

- [ ] **Step 4: Limpiar el horario de prueba (opcional)**

```sql
DELETE FROM public.horarios_doctores WHERE doctor_id = '<doctor_id>' AND hora_inicio = '08:00';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260522000500_citas_native_rpc_disponibilidad.sql
git commit -m "feat(citas): add RPCs obtener_slots_disponibles and obtener_dias_disponibles"
```

---

## Task 7: Migración — RPC `crear_cita_atomic`

**Files:**
- Create: `supabase/migrations/20260522000600_citas_native_rpc_crear_cita.sql`

Esta es la RPC más importante de toda la fase. Garantiza atomicidad del booking.

- [ ] **Step 1: Crear el archivo**

```sql
-- Migración: RPC crítica crear_cita_atomic.
-- Crea una cita validando disponibilidad y cuota dentro de una transacción
-- con pg_advisory_xact_lock + índice único parcial para garantizar atomicidad
-- bajo concurrencia.

BEGIN;

CREATE OR REPLACE FUNCTION public.crear_cita_atomic(
  p_doctor_id            UUID,
  p_servicio_id          UUID,
  p_fecha_hora_cita      TIMESTAMPTZ,
  p_para_titular         BOOLEAN,
  p_motivo_cita          TEXT DEFAULT NULL,
  p_paciente_nombre      TEXT DEFAULT NULL,
  p_paciente_telefono    TEXT DEFAULT NULL,
  p_paciente_correo      TEXT DEFAULT NULL,
  p_paciente_cedula      TEXT DEFAULT NULL,
  p_contrato_servicio_id UUID DEFAULT NULL,
  p_metodo_pago          TEXT DEFAULT NULL,  -- 'link_pago' | 'transferencia' | 'pago_clinica'
  p_monto                NUMERIC DEFAULT NULL,
  p_servicio_asociado    TEXT DEFAULT NULL,
  p_notas                TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           UUID := auth.uid();
  v_user_rol          TEXT;
  v_user_empresa_id   UUID;
  v_user_titular_id   UUID;
  v_titular_ref_id    UUID;
  v_servicio          RECORD;
  v_doctor            RECORD;
  v_ubicacion_id      UUID;
  v_doctor_tz         TEXT;
  v_dia_semana        SMALLINT;
  v_fecha_hora_fin    TIMESTAMPTZ;
  v_horario_ok        BOOLEAN;
  v_excepcion_ok      BOOLEAN;
  v_cuota_disponible  INT;
  v_estado_inicial    public.estado_sync;
  v_auto_confirmar    BOOLEAN := FALSE;
  v_cita_id           UUID;
BEGIN
  -- ── 1. Auth ─────────────────────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol, empresa_id, titular_id
    INTO v_user_rol, v_user_empresa_id, v_user_titular_id
  FROM public.users WHERE id = v_user_id;

  IF v_user_rol NOT IN ('miembro', 'admin', 'empresa_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  v_titular_ref_id := COALESCE(v_user_titular_id, v_user_id);

  -- ── 2. Validaciones de servicio / doctor ────────────────────────────────
  SELECT * INTO v_servicio FROM public.servicios WHERE id = p_servicio_id AND activo;
  IF v_servicio IS NULL THEN
    RAISE EXCEPTION 'SERVICIO_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT d.*, u.zona_horaria AS tz
    INTO v_doctor
  FROM public.doctores d
  JOIN public.ubicaciones u ON u.id = d.ubicacion_id
  WHERE d.id = p_doctor_id AND d.activo;

  IF v_doctor IS NULL THEN
    RAISE EXCEPTION 'DOCTOR_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_ubicacion_id := v_doctor.ubicacion_id;
  v_doctor_tz    := v_doctor.tz;

  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_servicios
    WHERE doctor_id = p_doctor_id AND servicio_id = p_servicio_id
  ) THEN
    RAISE EXCEPTION 'INVALID_DOCTOR_SERVICE' USING ERRCODE = 'P0001';
  END IF;

  -- ── 3. Lock por (doctor, día) para serializar inserts del mismo doctor
  --      en la misma fecha. Cubre el caso de servicios multi-slot. ─────────
  PERFORM pg_advisory_xact_lock(
    hashtext('cita_slot:' || p_doctor_id::TEXT || ':' || (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::DATE::TEXT)
  );

  -- ── 4. fecha_hora_fin = inicio + (slots × duración del horario) ─────────
  v_dia_semana := EXTRACT(DOW FROM (p_fecha_hora_cita AT TIME ZONE v_doctor_tz))::SMALLINT;

  SELECT (p_fecha_hora_cita + (h.slot_duracion * v_servicio.slot_duracion || ' minutes')::INTERVAL)
    INTO v_fecha_hora_fin
  FROM public.horarios_doctores h
  WHERE h.doctor_id = p_doctor_id
    AND h.dia_semana = v_dia_semana
    AND h.activo
    AND (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::TIME >= h.hora_inicio
    AND (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::TIME +
        (h.slot_duracion * v_servicio.slot_duracion || ' minutes')::INTERVAL
        <= h.hora_fin::INTERVAL
  ORDER BY h.hora_inicio
  LIMIT 1;

  IF v_fecha_hora_fin IS NULL THEN
    RAISE EXCEPTION 'SLOT_OUT_OF_HOURS' USING ERRCODE = 'P0001';
  END IF;

  -- ── 5. Validar que el rango no cae en excepción ────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.excepciones_horario e
    WHERE (e.doctor_id IS NULL OR e.doctor_id = p_doctor_id)
      AND tstzrange(e.fecha_inicio, e.fecha_fin, '[)')
          && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
  ) THEN
    RAISE EXCEPTION 'SLOT_IN_EXCEPTION' USING ERRCODE = 'P0001';
  END IF;

  -- ── 6. Validar que el rango no se superpone con otra cita activa ───────
  --      (defensa adicional al índice único, cubre servicios multi-slot)
  IF EXISTS (
    SELECT 1 FROM public.citas c
    WHERE c.doctor_id = p_doctor_id
      AND c.estado_sync NOT IN ('cancelado', 'rechazado')
      AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
          && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = 'P0001';
  END IF;

  -- ── 7. Determinar estado inicial + manejo de cuota/pago ────────────────
  IF p_contrato_servicio_id IS NOT NULL THEN
    SELECT public.check_cuota_disponible(p_contrato_servicio_id, v_titular_ref_id)
      INTO v_cuota_disponible;

    IF v_cuota_disponible IS NULL OR v_cuota_disponible <= 0 THEN
      IF p_metodo_pago IS NULL THEN
        RAISE EXCEPTION 'QUOTA_EXCEEDED' USING ERRCODE = 'P0001';
      END IF;
      v_estado_inicial := CASE
        WHEN p_metodo_pago = 'pago_clinica' THEN 'pendiente_admin'::public.estado_sync
        ELSE 'pendiente_pago'::public.estado_sync
      END;
    ELSE
      v_estado_inicial := 'pendiente_empresa'::public.estado_sync;
    END IF;
  ELSIF p_metodo_pago IS NOT NULL THEN
    v_estado_inicial := CASE
      WHEN p_metodo_pago = 'pago_clinica' THEN 'pendiente_admin'::public.estado_sync
      ELSE 'pendiente_pago'::public.estado_sync
    END;
  ELSE
    RAISE EXCEPTION 'CONTRATO_OR_METODO_PAGO_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Auto-confirmación condicional: empresa.auto_confirmar_citas + sin pago pendiente
  IF v_user_empresa_id IS NOT NULL THEN
    SELECT COALESCE(auto_confirmar_citas, FALSE) INTO v_auto_confirmar
    FROM public.empresas WHERE id = v_user_empresa_id;
  END IF;

  IF v_auto_confirmar AND v_estado_inicial = 'pendiente_empresa' THEN
    v_estado_inicial := 'confirmado'::public.estado_sync;
  END IF;

  -- ── 8. INSERT — el índice único parcial es la última línea de defensa ──
  INSERT INTO public.citas (
    paciente_id, empresa_id,
    doctor_id, servicio_id, ubicacion_id,
    fecha_hora_cita, fecha_hora_fin,
    servicio_asociado, estado_sync,
    para_titular,
    paciente_nombre, paciente_telefono, paciente_correo, paciente_cedula,
    motivo_cita, notas,
    contrato_servicio_id,
    titular_ref_id,
    confirmado_por, confirmado_at
  ) VALUES (
    v_user_id, v_user_empresa_id,
    p_doctor_id, p_servicio_id, v_ubicacion_id,
    p_fecha_hora_cita, v_fecha_hora_fin,
    p_servicio_asociado, v_estado_inicial,
    p_para_titular,
    p_paciente_nombre, p_paciente_telefono, p_paciente_correo,
    REPLACE(COALESCE(p_paciente_cedula, ''), '-', ''),
    p_motivo_cita, p_notas,
    CASE WHEN v_estado_inicial = 'pendiente_empresa' OR v_cuota_disponible > 0
         THEN p_contrato_servicio_id ELSE NULL END,
    CASE WHEN v_estado_inicial = 'pendiente_empresa' OR v_cuota_disponible > 0
         THEN v_titular_ref_id ELSE NULL END,
    CASE WHEN v_estado_inicial = 'confirmado' THEN v_user_id ELSE NULL END,
    CASE WHEN v_estado_inicial = 'confirmado' THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_cita_id;

  -- ── 9. Pago asociado si aplica ─────────────────────────────────────────
  IF p_metodo_pago IS NOT NULL AND p_contrato_servicio_id IS NULL THEN
    INSERT INTO public.pagos (cita_id, metodo, monto)
    VALUES (v_cita_id, p_metodo_pago::public.metodo_pago, p_monto);
  END IF;

  RETURN v_cita_id;

EXCEPTION
  WHEN unique_violation THEN
    -- Otro insert ganó el índice único: traducir a SLOT_TAKEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = 'P0001';
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_cita_atomic(
  UUID, UUID, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT, TEXT
) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Aplicar**

```bash
supabase db push
```

Si falla por algo (probable causa: enum `metodo_pago` con valores distintos a `'link_pago'/'transferencia'/'pago_clinica'`, o función `check_cuota_disponible` con firma distinta), revisar:

```sql
SELECT enum_range(NULL::public.metodo_pago);
\df+ public.check_cuota_disponible
```

Ajustar la migración y volver a aplicar.

- [ ] **Step 3: Smoke test manual de la RPC (vía MCP/psql, usando un usuario test)**

```sql
-- Como service_role para saltarse el auth.uid() check, usar:
SET LOCAL "request.jwt.claims" TO '{"sub":"<uuid-de-usuario-miembro>"}';
SELECT public.crear_cita_atomic(
  '<doctor_id>',
  '<servicio_id>',
  (CURRENT_DATE + TIME '09:00') AT TIME ZONE 'America/Managua',
  TRUE,
  NULL, NULL, NULL, NULL, NULL, NULL,
  'pago_clinica', NULL, NULL, NULL
);
```

(Si esto está siendo aplicado via MCP con service_role el `auth.uid()` no estará seteado — sería más práctico testearlo desde un endpoint o desde el frontend en la Fase 2/3. Para fase 1 basta con que la RPC se cree sin errores y los tests SQL de Task 9 cubran la concurrencia.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000600_citas_native_rpc_crear_cita.sql
git commit -m "feat(citas): add atomic crear_cita_atomic RPC with slot validation and quota handling"
```

---

## Task 8: Migración — RPCs de acciones admin

**Files:**
- Create: `supabase/migrations/20260522000700_citas_native_rpc_admin_actions.sql`

- [ ] **Step 1: Crear el archivo**

```sql
-- Migración: RPCs para confirmar, rechazar y cancelar citas.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- confirmar_cita — admin global
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirmar_cita(p_cita_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_user_rol TEXT;
  v_estado_actual public.estado_sync;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol INTO v_user_rol FROM public.users WHERE id = v_user_id;
  IF v_user_rol <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT estado_sync INTO v_estado_actual FROM public.citas WHERE id = p_cita_id;
  IF v_estado_actual IS NULL THEN
    RAISE EXCEPTION 'CITA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_estado_actual NOT IN ('pendiente', 'pendiente_admin', 'pendiente_empresa', 'pendiente_pago') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.citas
  SET estado_sync   = 'confirmado',
      confirmado_por = v_user_id,
      confirmado_at  = NOW(),
      updated_at     = NOW()
  WHERE id = p_cita_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_cita(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- rechazar_cita — admin global
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rechazar_cita(p_cita_id UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_user_rol TEXT;
  v_estado_actual public.estado_sync;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol INTO v_user_rol FROM public.users WHERE id = v_user_id;
  IF v_user_rol <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT estado_sync INTO v_estado_actual FROM public.citas WHERE id = p_cita_id;
  IF v_estado_actual IS NULL THEN
    RAISE EXCEPTION 'CITA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_estado_actual NOT IN ('pendiente', 'pendiente_admin', 'pendiente_empresa', 'pendiente_pago') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.citas
  SET estado_sync    = 'rechazado',
      rechazado_por  = v_user_id,
      rechazado_at   = NOW(),
      motivo_rechazo = p_motivo,
      updated_at     = NOW()
  WHERE id = p_cita_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rechazar_cita(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- cancelar_cita — paciente o admin. Valida ventana de cancelación.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancelar_cita(p_cita_id UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_user_rol     TEXT;
  v_cita         RECORD;
  v_ventana_horas INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol INTO v_user_rol FROM public.users WHERE id = v_user_id;

  SELECT paciente_id, fecha_hora_cita, estado_sync INTO v_cita
  FROM public.citas WHERE id = p_cita_id;
  IF v_cita IS NULL THEN
    RAISE EXCEPTION 'CITA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Solo admin o el propio paciente
  IF v_user_rol <> 'admin' AND v_cita.paciente_id <> v_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF v_cita.estado_sync IN ('cancelado', 'rechazado', 'completado') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  -- Ventana de cancelación (configurable globalmente). Admin puede saltar.
  IF v_user_rol <> 'admin' THEN
    SELECT COALESCE((valor::TEXT)::INT, 24) INTO v_ventana_horas
    FROM public.configuracion_sistema WHERE clave = 'ventana_cancelacion_horas';

    IF v_cita.fecha_hora_cita - NOW() < (v_ventana_horas || ' hours')::INTERVAL THEN
      RAISE EXCEPTION 'CANCEL_TOO_LATE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.citas
  SET estado_sync        = 'cancelado',
      cancelado_por      = v_user_id,
      cancelado_at       = NOW(),
      motivo_cancelacion = p_motivo,
      updated_at         = NOW()
  WHERE id = p_cita_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_cita(UUID, TEXT) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Aplicar**

```bash
supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260522000700_citas_native_rpc_admin_actions.sql
git commit -m "feat(citas): add RPCs confirmar_cita, rechazar_cita, cancelar_cita"
```

---

## Task 9: Migración — políticas RLS

**Files:**
- Create: `supabase/migrations/20260522000800_citas_native_rls.sql`

- [ ] **Step 1: Crear el archivo**

```sql
-- Migración: políticas RLS para las tablas nuevas del módulo de citas.

BEGIN;

-- ─────────── ubicaciones ──────────────────────────────────────────────────
CREATE POLICY "ubicaciones_authenticated_read"
  ON public.ubicaciones FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "ubicaciones_admin_all"
  ON public.ubicaciones FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

-- ─────────── horarios_doctores ────────────────────────────────────────────
CREATE POLICY "horarios_authenticated_read"
  ON public.horarios_doctores FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "horarios_admin_all"
  ON public.horarios_doctores FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

-- ─────────── excepciones_horario ──────────────────────────────────────────
CREATE POLICY "excepciones_authenticated_read"
  ON public.excepciones_horario FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "excepciones_admin_all"
  ON public.excepciones_horario FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

-- ─────────── doctor_servicios ─────────────────────────────────────────────
CREATE POLICY "doctor_servicios_authenticated_read"
  ON public.doctor_servicios FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "doctor_servicios_admin_all"
  ON public.doctor_servicios FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

COMMIT;
```

- [ ] **Step 2: Aplicar**

```bash
supabase db push
```

- [ ] **Step 3: Verificar políticas creadas**

```sql
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ubicaciones', 'horarios_doctores', 'excepciones_horario', 'doctor_servicios')
ORDER BY tablename, policyname;
```

Esperar 2 políticas por tabla (read + admin_all).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000800_citas_native_rls.sql
git commit -m "feat(citas): add RLS policies for ubicaciones, horarios, excepciones, doctor_servicios"
```

---

## Task 10: Tests SQL de concurrencia

**Files:**
- Create: `supabase/tests/citas_concurrency.sql`

Estos tests no se ejecutan en CI (no hay setup todavía); son scripts ejecutables manualmente vía `psql` para validar el comportamiento crítico antes de cerrar la fase.

- [ ] **Step 1: Crear el archivo**

```sql
-- Tests manuales para el módulo nativo de citas.
-- Uso: psql contra la base remota o local — todos los tests deberían
-- terminar con "PASS" en su NOTICE. Cualquier "FAIL" requiere investigación.
--
-- Ejecutar:
--   psql "$DATABASE_URL" -f supabase/tests/citas_concurrency.sql

\set ON_ERROR_STOP on

BEGIN;

-- ─── Setup: datos de fixture ──────────────────────────────────────────────
-- Asume al menos: 1 doctor activo con ubicación, 1 servicio activo asociado,
-- y un horario válido para el día de prueba.

DO $$
DECLARE
  v_doctor_id   UUID;
  v_servicio_id UUID;
  v_user_id     UUID;
  v_fecha       TIMESTAMPTZ;
  v_cita_id     UUID;
  v_dummy       UUID;
BEGIN
  -- Tomar primer doctor activo con ubicación y al menos un servicio
  SELECT d.id INTO v_doctor_id
  FROM public.doctores d
  JOIN public.doctor_servicios ds ON ds.doctor_id = d.id
  WHERE d.activo AND d.ubicacion_id IS NOT NULL
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    RAISE NOTICE 'SKIP: no hay doctor activo con ubicación + servicio';
    RETURN;
  END IF;

  SELECT ds.servicio_id INTO v_servicio_id
  FROM public.doctor_servicios ds
  WHERE ds.doctor_id = v_doctor_id LIMIT 1;

  SELECT id INTO v_user_id FROM public.users WHERE rol = 'miembro' LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'SKIP: no hay usuario miembro';
    RETURN;
  END IF;

  -- Asegurar un horario para mañana
  INSERT INTO public.horarios_doctores (doctor_id, dia_semana, hora_inicio, hora_fin, slot_duracion)
  VALUES (v_doctor_id, EXTRACT(DOW FROM (CURRENT_DATE + 1))::SMALLINT, '08:00', '12:00', 30)
  ON CONFLICT DO NOTHING;

  v_fecha := ((CURRENT_DATE + 1) || ' 09:00')::TIMESTAMP AT TIME ZONE 'America/Managua';

  -- Limpiar tests anteriores en ese slot
  DELETE FROM public.citas
  WHERE doctor_id = v_doctor_id AND fecha_hora_cita = v_fecha;

  -- ─── Test 1: insert básico funciona ─────────────────────────────────────
  SET LOCAL "request.jwt.claims" TO '{"sub":"' || v_user_id::TEXT || '"}';
  v_cita_id := public.crear_cita_atomic(
    v_doctor_id, v_servicio_id, v_fecha, TRUE,
    NULL, NULL, NULL, NULL, NULL, NULL,
    'pago_clinica', NULL, NULL, NULL
  );
  IF v_cita_id IS NULL THEN
    RAISE NOTICE 'FAIL Test 1: crear_cita_atomic devolvió NULL';
  ELSE
    RAISE NOTICE 'PASS Test 1: insert básico (id=%)', v_cita_id;
  END IF;

  -- ─── Test 2: segundo insert al mismo slot debe lanzar SLOT_TAKEN ────────
  BEGIN
    v_dummy := public.crear_cita_atomic(
      v_doctor_id, v_servicio_id, v_fecha, TRUE,
      NULL, NULL, NULL, NULL, NULL, NULL,
      'pago_clinica', NULL, NULL, NULL
    );
    RAISE NOTICE 'FAIL Test 2: segundo insert no lanzó SLOT_TAKEN (id=%)', v_dummy;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'SLOT_TAKEN' THEN
        RAISE NOTICE 'PASS Test 2: segundo insert rechazado con SLOT_TAKEN';
      ELSE
        RAISE NOTICE 'FAIL Test 2: error inesperado: %', SQLERRM;
      END IF;
  END;

  -- ─── Test 3: rechazo libera el slot ────────────────────────────────────
  -- Reset rol como admin
  UPDATE public.users SET rol = 'admin' WHERE id = v_user_id;
  PERFORM public.rechazar_cita(v_cita_id, 'test cleanup');
  UPDATE public.users SET rol = 'miembro' WHERE id = v_user_id;

  v_dummy := public.crear_cita_atomic(
    v_doctor_id, v_servicio_id, v_fecha, TRUE,
    NULL, NULL, NULL, NULL, NULL, NULL,
    'pago_clinica', NULL, NULL, NULL
  );
  IF v_dummy IS NOT NULL THEN
    RAISE NOTICE 'PASS Test 3: tras rechazo se pudo reservar el slot (id=%)', v_dummy;
  ELSE
    RAISE NOTICE 'FAIL Test 3: tras rechazo no se pudo reservar';
  END IF;

  -- ─── Test 4: excepción bloquea ──────────────────────────────────────────
  DELETE FROM public.citas WHERE doctor_id = v_doctor_id AND fecha_hora_cita = v_fecha;
  INSERT INTO public.excepciones_horario (doctor_id, fecha_inicio, fecha_fin, motivo)
  VALUES (v_doctor_id, v_fecha - INTERVAL '1 hour', v_fecha + INTERVAL '1 hour', 'test');

  BEGIN
    v_dummy := public.crear_cita_atomic(
      v_doctor_id, v_servicio_id, v_fecha, TRUE,
      NULL, NULL, NULL, NULL, NULL, NULL,
      'pago_clinica', NULL, NULL, NULL
    );
    RAISE NOTICE 'FAIL Test 4: insert en excepción no lanzó SLOT_IN_EXCEPTION (id=%)', v_dummy;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'SLOT_IN_EXCEPTION' THEN
        RAISE NOTICE 'PASS Test 4: insert bloqueado por excepción';
      ELSE
        RAISE NOTICE 'FAIL Test 4: error inesperado: %', SQLERRM;
      END IF;
  END;

  -- Cleanup
  DELETE FROM public.excepciones_horario
  WHERE doctor_id = v_doctor_id AND motivo = 'test';
  DELETE FROM public.citas WHERE doctor_id = v_doctor_id AND fecha_hora_cita = v_fecha;
END;
$$;

ROLLBACK;  -- los tests se hacen dentro de una transacción que se descarta

-- Nota: el test de concurrencia real (múltiples sesiones simultáneas) requiere
-- ejecución desde un script externo (Node, bash con xargs -P, etc.) que invoque
-- el endpoint POST /api/citas en paralelo una vez que la Fase 2 esté lista.
-- Ver fase 2 plan para el script de concurrencia end-to-end.
```

- [ ] **Step 2: Ejecutar el script localmente (opcional, si tenés conexión a la DB)**

Run:
```bash
psql "$DATABASE_URL" -f supabase/tests/citas_concurrency.sql 2>&1 | grep -E "PASS|FAIL|SKIP"
```

Expected: 4 líneas con `PASS Test N`. Si aparecen `FAIL` o `SKIP`, investigar.

Si no hay conexión directa, ejecutar vía MCP:
```
mcp__plugin_supabase_supabase__execute_sql (project_id, query: <pegar el DO block del archivo>)
```

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/citas_concurrency.sql
git commit -m "test(citas): add manual SQL tests for booking concurrency and exception blocking"
```

---

## Task 11: Verificación final de la Fase 1

- [ ] **Step 1: Type-check y lint**

Run:
```bash
pnpm build
```

Expected: build OK (los cambios fueron solo en DB, así que ningún tipo de TS cambió todavía — pero el build incluye un check completo y debería seguir pasando).

```bash
pnpm lint
```

Expected: sin errores nuevos.

- [ ] **Step 2: Listar todas las migraciones aplicadas**

```bash
ls supabase/migrations/202605220*.sql
```

Esperar 8 archivos: `001…cleanup_and_new_tables`, `002…alter_existing_tables`, `003…indexes_and_realtime`, `004…seed_ubicaciones`, `005…rpc_disponibilidad`, `006…rpc_crear_cita`, `007…rpc_admin_actions`, `008…rls`.

- [ ] **Step 3: Verificar que la base remota refleja todo**

```
mcp__plugin_supabase_supabase__list_migrations (project_id: jdhaxwklszodavhdrtsp)
```

Las 8 migraciones nuevas deben aparecer.

- [ ] **Step 4: Verificar que `get_advisors` no reporta nuevos issues críticos**

```
mcp__plugin_supabase_supabase__get_advisors (project_id, type: "security")
mcp__plugin_supabase_supabase__get_advisors (project_id, type: "performance")
```

Cualquier nuevo advisor crítico (RLS sin políticas, índices faltantes en FKs) debe corregirse antes de cerrar la fase.

- [ ] **Step 5: Push del branch**

```bash
git push -u origin feat/citas-modulo-nativo
```

- [ ] **Step 6: Marcar fase 1 como completada**

Crear un commit de cierre simbólico:

```bash
git commit --allow-empty -m "chore(citas): close phase 1 — schema + RPCs ready for fase 2"
```

---

## Self-Review de la Fase 1

Antes de pasar a Fase 2, verificar:

- [ ] Todas las tablas del spec existen en la DB (`ubicaciones`, `horarios_doctores`, `excepciones_horario`, `doctor_servicios`, columnas nuevas en `citas/doctores/servicios/users/configuracion_sistema`).
- [ ] Columnas `ea_*` ya no existen en `citas`, `doctores`, `servicios`, `users`.
- [ ] El índice único `citas_no_double_booking` existe y filtra por `doctor_id`, no por `ea_provider_id`.
- [ ] Las 5 RPCs existen: `obtener_slots_disponibles`, `obtener_dias_disponibles`, `crear_cita_atomic`, `confirmar_cita`, `rechazar_cita`, `cancelar_cita`. Todas son `SECURITY DEFINER` y tienen GRANT a `authenticated`.
- [ ] `supabase_realtime` incluye la tabla `citas`.
- [ ] RLS habilitada en las 4 tablas nuevas.
- [ ] Tests SQL pasan (al menos Test 1, 2, 3, 4).
- [ ] La configuración `ventana_cancelacion_horas` existe con valor `24`.

## Limitaciones conocidas tras Fase 1

- `doctores.ubicacion_id` es **nullable**. El admin debe poblarlo manualmente
  (o vía script) antes de que esos doctores puedan recibir citas. En la Fase 4
  el dashboard admin permitirá hacerlo. Una migración posterior (post-Fase 4)
  agregará `NOT NULL`.
- Los wizard y endpoints todavía usan EA hasta Fase 2/3.
- `obtener_slots_disponibles` no valida si el doctor está activo o si está
  asociado a la ubicación esperada — esa validación queda a cargo del wizard
  (que solo lista doctores activos en la ubicación elegida) y de la
  `crear_cita_atomic` (que valida en el momento del insert).
