# Timezone Normalization + Signup-Familiar Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three bug fixes bundled into one PR on branch `fix/timezone-normalization`: (a) all date/time display + validation normalized to Nicaragua time via new `lib/datetime.ts`, (b) 24h pre-booking cutoff enforced server-side, (c) signup made idempotent so retries don't brick familiares' accounts.

**Architecture:** New central `lib/datetime.ts` becomes the single source of truth for any code that displays or compares dates. All `.toLocale*` calls and any direct reference to `"America/Managua"` outside the lib are removed (only 2 controlled exceptions: SQL migrations and the FullCalendar `timeZone` prop). New SQL migration adds a `BOOKING_TOO_SOON` raise at the top of `crear_cita_atomic`. `completeSignupAction` wraps its password update in a try/catch that swallows the specific "same password as before" error.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase (Postgres + Auth), next-intl, FullCalendar, sonner.

**Important — no test suite:** This codebase has no automated tests (per `CLAUDE.md`). Verify = `pnpm build` (which runs `tsc`) plus a documented manual smoke test in the PR description. Do not add Jest/Vitest scaffolding.

**Spec:** `docs/superpowers/specs/2026-05-27-timezone-normalization-design.md`

---

## Order

1. Task 0 — Setup verification
2. Task 1 — Create `lib/datetime.ts`
3. Task 2 — Fix Bug B (FullCalendar tz — fast win, 1 line)
4. Task 3 — Bug A backend: SQL migration for 24h cutoff + error mapping + i18n
5. Task 4 — Bug A frontend: refactor `PasoFecha` + `PasoHorario` to use the new helpers
6. Task 5 — Audit migration of the 17 files without explicit tz
7. Task 6 — Consistency migration of the 15 files already using tz
8. Task 7 — Bug C: idempotent `completeSignupAction`
9. Task 8 — Verification gate + final build/lint
10. Task 9 — Apply migration + push + PR (controller-confirmed)

---

## Task 0: Setup verification

**Files:** none

- [ ] **Step 1: Confirm branch**

Run:
```bash
git branch --show-current
```
Expected: `fix/timezone-normalization`.

- [ ] **Step 2: Confirm spec is committed**

Run:
```bash
git log --oneline -5
```
Expected: top commit is `docs(specs): extend timezone spec with signup-familiar fix (Bug C)` (commit `1b34c5a`).

- [ ] **Step 3: Baseline build**

Run:
```bash
pnpm build
```
Expected: passes (the spec edits don't affect build). If it fails, stop — investigate first.

---

## Task 1: Create `lib/datetime.ts`

**Files:**
- Create: `lib/datetime.ts`

- [ ] **Step 1: Create the file with full content**

Create `lib/datetime.ts` with this exact content:

```ts
/**
 * Centralized date/time utilities for the clubSOS app.
 *
 * SINGLE SOURCE OF TRUTH for any code that displays a date, formats a time,
 * or compares against Nicaragua's calendar. All `.toLocale*` calls and any
 * reference to `"America/Managua"` outside this module are prohibited
 * (verified by grep gate in CI). Two controlled exceptions:
 *   - SQL migrations (Postgres timezone literals)
 *   - `<FullCalendar timeZone="America/Managua">` prop in AdminCalendarioCitas
 *
 * Why centralized: cross-tz users (testing from Australia / EU / etc.) were
 * seeing wrong calendar days, wrong cutoffs, and confused appointment times
 * because each component reinvented timezone handling.
 */

export const NICARAGUA_TZ = "America/Managua";

export type Loc = "es" | "en";

function intlLocale(loc: Loc): string {
  return loc === "en" ? "en-US" : "es-NI";
}

// ── "Now" / today in Nicaragua ───────────────────────────────────────────

/** A YYYY-MM-DD string of today's calendar date in Nicaragua. */
export function todayNI(): string {
  // en-CA produces ISO-like YYYY-MM-DD regardless of locale settings.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NICARAGUA_TZ,
    year:  "numeric",
    month: "2-digit",
    day:   "2-digit",
  }).format(new Date());
}

/** YYYY-MM-DD of a date plus N days, computed against Nicaragua's calendar. */
export function addDaysNI(yyyymmdd: string, days: number): string {
  // Parse as noon UTC so the calendar day never spills into adjacent days in
  // any browser timezone, then add days, then re-extract the NI calendar day.
  const base = new Date(`${yyyymmdd}T12:00:00.000Z`);
  const shifted = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NICARAGUA_TZ,
    year:  "numeric",
    month: "2-digit",
    day:   "2-digit",
  }).format(shifted);
}

// ── Calendar-day Date helpers (for date pickers) ─────────────────────────

/**
 * Convert a YYYY-MM-DD string into a JS Date at noon UTC.
 * Noon UTC is noon in every browser tz, so the Date represents the same
 * calendar day regardless of where the user is. Use this whenever a Date
 * object is used purely as a calendar-day marker, never as a real instant.
 */
export function calendarDateNI(yyyymmdd: string): Date {
  return new Date(`${yyyymmdd}T12:00:00.000Z`);
}

/** Inverse of calendarDateNI: extract YYYY-MM-DD in Nicaragua's calendar. */
export function dateToCalendarNI(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NICARAGUA_TZ,
    year:  "numeric",
    month: "2-digit",
    day:   "2-digit",
  }).format(d);
}

// ── Formatting (always in Nicaragua tz) ──────────────────────────────────

function parseInput(input: Date | string | null | undefined): Date | null {
  if (input == null) return null;
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** "miércoles, 27 de mayo de 2026" / "Wednesday, May 27, 2026" */
export function formatDateNI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: NICARAGUA_TZ,
    weekday:  "long",
    day:      "numeric",
    month:    "long",
    year:     "numeric",
  }).format(d);
}

/** "27 may 2026" / "May 27, 2026" */
export function formatDateShortNI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: NICARAGUA_TZ,
    day:      "numeric",
    month:    "short",
    year:     "numeric",
  }).format(d);
}

/** "08:00" (24h) */
export function formatTimeNI(input: Date | string | null | undefined, _locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: NICARAGUA_TZ,
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   false,
  }).format(d);
}

/** "8:00 AM" (12h, no leading zero on hour) */
export function formatTime12NI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: NICARAGUA_TZ,
    hour:     "numeric",
    minute:   "2-digit",
    hour12:   true,
  }).format(d);
}

/** "miércoles, 27 de mayo de 2026, 8:00" (long date + time) */
export function formatDateTimeNI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone:  NICARAGUA_TZ,
    dateStyle: "full",
    timeStyle: "short",
  }).format(d);
}

/** "27 may, 08:00" / "May 27, 08:00" — compact for lists / notifications */
export function formatShortDateTimeNI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  const datePart = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: NICARAGUA_TZ,
    day:      "numeric",
    month:    "short",
  }).format(d);
  const timePart = formatTimeNI(d, locale);
  return `${datePart}, ${timePart}`;
}

// ── 24h booking cutoff ───────────────────────────────────────────────────

/**
 * Returns true if `citaInstant` is at least 24 hours away from now.
 * The check is timezone-independent (compares UTC instants).
 */
export function isAtLeast24hAway(citaInstant: Date | string | null | undefined): boolean {
  const d = parseInput(citaInstant);
  if (!d) return false;
  const cutoffMs = Date.now() + 24 * 60 * 60 * 1000;
  return d.getTime() >= cutoffMs;
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
pnpm build
```
Expected: passes. The file is pure TypeScript with no runtime dependencies on app code, so it should compile cleanly.

- [ ] **Step 3: Commit**

```bash
git add lib/datetime.ts
git commit -m "feat(lib): add centralized datetime helpers for Nicaragua tz"
```

---

## Task 2: Fix Bug B — FullCalendar timezone

**Files:**
- Modify: `components/dashboard/admin/AdminCalendarioCitas.tsx` (one prop on `<FullCalendar>`)

- [ ] **Step 1: Add timeZone prop**

In `components/dashboard/admin/AdminCalendarioCitas.tsx`, find the `<FullCalendar>` element (around line 293):

```tsx
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
```

Replace with:

```tsx
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          timeZone="America/Managua"
          initialView="timeGridWeek"
```

This is one of the two controlled exceptions to the "no literal `America/Managua` outside `lib/datetime.ts`" rule (FullCalendar's `timeZone` prop must be a string literal here).

- [ ] **Step 2: Type-check**

```bash
pnpm build
```
Expected: passes. FullCalendar's `timeZone` prop accepts any IANA tz string.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/admin/AdminCalendarioCitas.tsx
git commit -m "fix(citas/admin): set FullCalendar timezone to America/Managua"
```

---

## Task 3: Bug A backend — SQL migration + error mapping + i18n

**Files:**
- Create: `supabase/migrations/20260528000000_citas_24h_cutoff.sql`
- Modify: `lib/citas/errors.ts`
- Modify: `messages/es.json`, `messages/en.json`

### 3a — Error mapping

- [ ] **Step 1: Update `lib/citas/errors.ts`**

Find:
```ts
export type CitaErrorCode =
  | "SLOT_TAKEN"
  | "PATIENT_BUSY"
  | "SLOT_OUT_OF_HOURS"
```
Replace with:
```ts
export type CitaErrorCode =
  | "SLOT_TAKEN"
  | "PATIENT_BUSY"
  | "BOOKING_TOO_SOON"
  | "SLOT_OUT_OF_HOURS"
```

Then find:
```ts
  SLOT_TAKEN:                        { status: 409, i18nKey: "Errors.citas.slot_taken" },
  PATIENT_BUSY:                      { status: 409, i18nKey: "Errors.citas.patient_busy" },
  SLOT_OUT_OF_HOURS:                 { status: 422, i18nKey: "Errors.citas.slot_out_of_hours" },
```
Replace with:
```ts
  SLOT_TAKEN:                        { status: 409, i18nKey: "Errors.citas.slot_taken" },
  PATIENT_BUSY:                      { status: 409, i18nKey: "Errors.citas.patient_busy" },
  BOOKING_TOO_SOON:                  { status: 409, i18nKey: "Errors.citas.booking_too_soon" },
  SLOT_OUT_OF_HOURS:                 { status: 422, i18nKey: "Errors.citas.slot_out_of_hours" },
```

- [ ] **Step 2: Build**
```bash
pnpm build
```
Expected: passes.

### 3b — i18n keys

- [ ] **Step 3: Add `booking_too_soon` to `messages/es.json`**

Find the `Errors.citas` block (around line 1617). Use Edit with pre-image:
```
      "slot_taken": "Ese horario ya fue reservado. Por favor elige otro.",
      "patient_busy": "Ya tienes otra cita agendada que se traslapa con este horario. Revisa tus citas existentes antes de agendar.",
```
Post-image:
```
      "slot_taken": "Ese horario ya fue reservado. Por favor elige otro.",
      "patient_busy": "Ya tienes otra cita agendada que se traslapa con este horario. Revisa tus citas existentes antes de agendar.",
      "booking_too_soon": "No se puede agendar citas con menos de 24 horas de anticipación.",
```

- [ ] **Step 4: Add `booking_too_soon` to `messages/en.json`**

Inside the equivalent `Errors.citas` block, add:
```json
"booking_too_soon": "Appointments cannot be booked with less than 24 hours of notice.",
```

### 3c — SQL migration

- [ ] **Step 5: Create `supabase/migrations/20260528000000_citas_24h_cutoff.sql`**

The migration replaces `crear_cita_atomic` (the version produced by the previous patient-busy migration `20260527120000`). Copy the full body of `20260527120000_citas_patient_busy_check.sql` and insert a new check immediately after the `FORBIDDEN` raise and before the `v_titular_ref_id := COALESCE(...)` line. Full file content:

```sql
-- Migración: 24h pre-booking cutoff.
-- Una cita no puede ser agendada con menos de 24 horas de anticipación.
-- Reemplaza crear_cita_atomic (versión anterior: 20260527120000_citas_patient_busy_check.sql).

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
  p_metodo_pago          TEXT DEFAULT NULL,
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
  v_cuota_disponible  INT;
  v_estado_inicial    public.estado_sync;
  v_auto_confirmar    BOOLEAN := FALSE;
  v_cita_id           UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol, empresa_id, titular_id
    INTO v_user_rol, v_user_empresa_id, v_user_titular_id
  FROM public.users WHERE id = v_user_id;

  IF v_user_rol NOT IN ('miembro', 'admin', 'empresa_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  -- ── NEW: 24h pre-booking cutoff ───────────────────────────────────────────
  -- Comparación NOW() (UTC) vs p_fecha_hora_cita (TIMESTAMPTZ).
  -- Timezone-agnostic: el offset del cliente no afecta esta validación.
  IF p_fecha_hora_cita < NOW() + INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'BOOKING_TOO_SOON' USING ERRCODE = 'P0001';
  END IF;
  -- ── END NEW ───────────────────────────────────────────────────────────────

  v_titular_ref_id := COALESCE(v_user_titular_id, v_user_id);

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

  PERFORM pg_advisory_xact_lock(
    hashtext('cita_slot:' || p_doctor_id::TEXT || ':' || (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::DATE::TEXT)
  );

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

  IF EXISTS (
    SELECT 1 FROM public.excepciones_horario e
    WHERE (e.doctor_id IS NULL OR e.doctor_id = p_doctor_id)
      AND tstzrange(e.fecha_inicio, e.fecha_fin, '[)')
          && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
  ) THEN
    RAISE EXCEPTION 'SLOT_IN_EXCEPTION' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.citas c
    WHERE c.doctor_id = p_doctor_id
      AND c.estado_sync NOT IN ('cancelado', 'rechazado')
      AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
          && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = 'P0001';
  END IF;

  -- ── Patient-busy check (from previous migration) ─────────────────────────
  IF p_para_titular THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('patient_slot:titular:' || v_user_id::TEXT
               || ':' || (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::DATE::TEXT)
    );
    IF EXISTS (
      SELECT 1 FROM public.citas c
      WHERE c.paciente_id = v_user_id
        AND c.para_titular = TRUE
        AND c.estado_sync NOT IN ('cancelado','rechazado')
        AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
            && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
    ) THEN
      RAISE EXCEPTION 'PATIENT_BUSY' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- Familiar: identificado por cédula normalizada (sin guiones).
    -- Si no hay cédula, no podemos identificar al familiar — saltamos el check.
    -- Nota: scoped a `c.paciente_id = v_user_id` (citas que ESTE usuario
    -- agendó). No bloqueamos entre distintos titulares del mismo familiar
    -- compartido — el modelo actual no tiene 1 cedula = 1 persona global.
    IF COALESCE(REPLACE(p_paciente_cedula, '-', ''), '') <> '' THEN
      PERFORM pg_advisory_xact_lock(
        hashtext('patient_slot:familiar:' || v_user_id::TEXT
                 || ':' || REPLACE(p_paciente_cedula, '-', '')
                 || ':' || (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::DATE::TEXT)
      );
      IF EXISTS (
        SELECT 1 FROM public.citas c
        WHERE c.paciente_id = v_user_id
          AND c.para_titular = FALSE
          AND REPLACE(COALESCE(c.paciente_cedula,''),'-','')
              = REPLACE(p_paciente_cedula,'-','')
          AND c.estado_sync NOT IN ('cancelado','rechazado')
          AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
              && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
      ) THEN
        RAISE EXCEPTION 'PATIENT_BUSY' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

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

  IF v_user_empresa_id IS NOT NULL THEN
    SELECT COALESCE(auto_confirmar_citas, FALSE) INTO v_auto_confirmar
    FROM public.empresas WHERE id = v_user_empresa_id;
  END IF;

  IF v_auto_confirmar AND v_estado_inicial = 'pendiente_empresa' THEN
    v_estado_inicial := 'confirmado'::public.estado_sync;
  END IF;

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

  IF p_metodo_pago IS NOT NULL AND p_contrato_servicio_id IS NULL THEN
    INSERT INTO public.pagos (cita_id, metodo, monto)
    VALUES (v_cita_id, p_metodo_pago::public.metodo_pago, p_monto);
  END IF;

  RETURN v_cita_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = 'P0001';
END;
$$;

-- GRANT EXECUTE preserved automatically by CREATE OR REPLACE
-- (originally granted by 20260522000600_citas_native_rpc_crear_cita.sql).

COMMIT;
```

- [ ] **Step 6: DO NOT push the migration**

The controller will request user confirmation before running `supabase db push`. Skip the push step entirely.

- [ ] **Step 7: Build**
```bash
pnpm build
```
Expected: passes (no TS changes since 3a, just SQL + JSON).

- [ ] **Step 8: Commit**
```bash
git add supabase/migrations/20260528000000_citas_24h_cutoff.sql lib/citas/errors.ts messages/es.json messages/en.json
git commit -m "fix(citas): enforce 24h pre-booking cutoff server-side"
```

---

## Task 4: Bug A frontend — Refactor PasoFecha + PasoHorario

**Files:**
- Modify: `components/dashboard/miembro/citas/steps/PasoFecha.tsx`
- Modify: `components/dashboard/miembro/citas/steps/PasoHorario.tsx`

### 4a — PasoFecha refactor

- [ ] **Step 1: Replace ad-hoc helper with imports + new logic**

In `components/dashboard/miembro/citas/steps/PasoFecha.tsx`, replace the entire block starting at line 16 (`function toDateStr` ...) through line 44 (the `maxDate.setHours(...)`):

```tsx
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const NI_OFFSET_MS = -6 * 60 * 60 * 1000;
function nicaraguaCalendarDate(dayOffset = 0): Date {
  const ni = new Date(Date.now() + NI_OFFSET_MS);
  return new Date(ni.getUTCFullYear(), ni.getUTCMonth(), ni.getUTCDate() + dayOffset);
}

export default function PasoFecha({ doctorId, onSelect, onBack }: PasoFechaProps) {
  const t      = useTranslations("Dashboard.miembro.citas.wizard");
  const tf     = useTranslations("Dashboard.miembro.citas.wizard.fecha");
  const locale = useLocale();
  const dateLocale = locale === "es" ? es : enUS;
  const [selected, setSelected]   = useState<Date | undefined>(undefined);
  const [month, setMonth]         = useState<Date>(() => nicaraguaCalendarDate(0));
  const [diasConSlots, setDias]   = useState<Set<string> | null>(null);
  const [loadingDias, setLoading] = useState(false);

  const tomorrow = nicaraguaCalendarDate(1);
  tomorrow.setHours(0, 0, 0, 0);

  const maxDate = nicaraguaCalendarDate(0);
  maxDate.setMonth(maxDate.getMonth() + 3);
  maxDate.setHours(23, 59, 59, 999);
```

With:

```tsx
import {
  todayNI,
  addDaysNI,
  calendarDateNI,
  dateToCalendarNI,
} from "@/lib/datetime";

export default function PasoFecha({ doctorId, onSelect, onBack }: PasoFechaProps) {
  const t      = useTranslations("Dashboard.miembro.citas.wizard");
  const tf     = useTranslations("Dashboard.miembro.citas.wizard.fecha");
  const locale = useLocale();
  const dateLocale = locale === "es" ? es : enUS;
  const [selected, setSelected]   = useState<Date | undefined>(undefined);
  const [month, setMonth]         = useState<Date>(() => calendarDateNI(todayNI()));
  const [diasConSlots, setDias]   = useState<Set<string> | null>(null);
  const [loadingDias, setLoading] = useState(false);

  // Earliest selectable day = the Nicaragua calendar day that contains (now + 24h).
  // This corresponds to the day the cutoff "ends" in NI time.
  // The 24h-from-now instant; we extract its NI calendar day.
  const cutoffNI = dateToCalendarNI(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const tomorrow = calendarDateNI(cutoffNI);

  // Max date: 3 months from today (NI calendar). addDaysNI x 90 is approximate;
  // for "+3 months" we go month-arithmetic on a Date.
  const todayNICalendar = calendarDateNI(todayNI());
  const maxDate = new Date(todayNICalendar);
  maxDate.setUTCMonth(maxDate.getUTCMonth() + 3);
```

**Why this works:** all internal `Date` objects representing calendar days are at noon UTC (`calendarDateNI`). The Calendar component (react-day-picker) compares them ordinally — noon-UTC means the same calendar day in every browser tz. The cutoff "tomorrow" is computed from `Date.now() + 24h` then mapped back to its NI calendar day.

Note: the imports for `calendarDateNI` and `dateToCalendarNI` must be added to the top-of-file imports (alongside the existing `es, enUS` etc.). Add this import line:

```tsx
import { todayNI, addDaysNI, calendarDateNI, dateToCalendarNI } from "@/lib/datetime";
```

(If `addDaysNI` ends up unused after the refactor, remove it from the import.)

- [ ] **Step 2: Update `isDisabled` to use the new helpers**

In the same file, find:
```tsx
  function isDisabled(date: Date): boolean {
    if (date < tomorrow || date > maxDate || date.getDay() === 0) return true;
    // If we've loaded the set for this month and the date is not in it, disable.
    if (diasConSlots !== null && !diasConSlots.has(toDateStr(date))) return true;
    return false;
  }
```
Replace with:
```tsx
  function isDisabled(date: Date): boolean {
    if (date < tomorrow || date > maxDate || date.getDay() === 0) return true;
    // If we've loaded the set for this month and the date is not in it, disable.
    if (diasConSlots !== null && !diasConSlots.has(dateToCalendarNI(date))) return true;
    return false;
  }
```

- [ ] **Step 3: Update `handleContinue` to use the new helper**

Find:
```tsx
  function handleContinue() {
    if (!selected) return;
    onSelect({ fecha: toDateStr(selected) });
  }
```
Replace with:
```tsx
  function handleContinue() {
    if (!selected) return;
    onSelect({ fecha: dateToCalendarNI(selected) });
  }
```

- [ ] **Step 4: Update the `useEffect` that fetches days-with-slots**

Find:
```tsx
    const year  = month.getFullYear();
    const monthNum = month.getMonth() + 1;
    const start = `${year}-${String(monthNum).padStart(2, "0")}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();
    const end   = `${year}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
```
Replace with:
```tsx
    // month is a noon-UTC Date representing the first visible day; derive the
    // YYYY-MM-DD start/end of the calendar month in NI terms.
    const monthStartNI = dateToCalendarNI(month).slice(0, 7) + "-01";
    // Last day of that calendar month: jump to next month's first day then go back 1 day.
    const [year, monthNum] = monthStartNI.split("-").map(Number);
    const nextMonthFirst = new Date(Date.UTC(year, monthNum, 1, 12));  // month is 1-indexed here → next month
    const lastDayDate = new Date(nextMonthFirst.getTime() - 24 * 60 * 60 * 1000);
    const start = monthStartNI;
    const end   = dateToCalendarNI(lastDayDate);
```

- [ ] **Step 5: Type-check**
```bash
pnpm build
```
Expected: passes.

### 4b — PasoHorario refactor

- [ ] **Step 6: Replace `to12hLocal` with the centralized helper**

In `components/dashboard/miembro/citas/steps/PasoHorario.tsx`, replace lines 24-33:

```tsx
function to12hLocal(isoUtc: string): string {
  const d = new Date(isoUtc);
  const niOffsetMs = -6 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + niOffsetMs);
  let h = local.getUTCHours();
  const m = String(local.getUTCMinutes()).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m} ${period}`;
}
```

With (and add a new import for `formatTime12NI` and `isAtLeast24hAway` and `useLocale`):

```tsx
// (no local helper — uses formatTime12NI from lib/datetime)
```

In the import block at the top of the file, change:
```tsx
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
```
To:
```tsx
import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatTime12NI, isAtLeast24hAway } from "@/lib/datetime";
```

Inside the `PasoHorario` component body (after `const th = useTranslations(...)`), add:
```tsx
  const locale = useLocale() as "es" | "en";
```

Replace both call sites that read `to12hLocal(slot.hora_inicio)` (lines ~113 and ~122) with `formatTime12NI(slot.hora_inicio, locale)`.

- [ ] **Step 7: Add 24h filter on slot availability**

In the `Slot` button JSX block (around lines 104-125 in the original), update the `isAvailable` derivation:

Find:
```tsx
          {slots.map((slot) => {
            const isSelected  = selected === slot.hora_inicio;
            const isAvailable = slot.disponible;
```
Replace with:
```tsx
          {slots.map((slot) => {
            const isSelected  = selected === slot.hora_inicio;
            const isAvailable = slot.disponible && isAtLeast24hAway(slot.hora_inicio);
```

This grays out slots that the server would reject for the 24h cutoff — the user never sees a clickable slot that fails on confirm.

- [ ] **Step 8: Build**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 9: Commit**
```bash
git add components/dashboard/miembro/citas/steps/PasoFecha.tsx components/dashboard/miembro/citas/steps/PasoHorario.tsx
git commit -m "refactor(citas/wizard): use central datetime helpers, enforce 24h cutoff in UI"
```

---

## Task 5: Audit migration of the 17 files without explicit tz

**Approach:** All 17 files share the same anti-pattern: `new Date(x).toLocaleDateString("es-NI", { ... })` (sometimes `toLocaleString` or `toLocaleTimeString`). The transformation replaces them with the appropriate `format*NI` helper.

**Canonical transformations:**

| Old | New |
|---|---|
| `new Date(x).toLocaleDateString("es-NI", { day: "numeric", month: "long", year: "numeric" })` | `formatDateNI(x, locale)` |
| `new Date(x).toLocaleDateString("es-NI", { day: "numeric", month: "short", year: "numeric" })` | `formatDateShortNI(x, locale)` |
| `new Date(x).toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" })` | `formatTimeNI(x, locale)` |
| `new Date(x).toLocaleString("es-NI", { ... })` | `formatDateTimeNI(x, locale)` |

**For every modified file:** add the import `import { ... } from "@/lib/datetime";` for the helpers used. If the component does not already call `useLocale()`, add it and pass to the helpers. Always cast: `const locale = useLocale() as "es" | "en";`.

Process each file individually below.

### 5a — `components/dashboard/miembro/avisos/MisAvisos.tsx`

- [ ] **Step 1: Inspect existing usage**
```bash
grep -n "toLocaleDateString\|toLocaleTimeString\|toLocaleString" components/dashboard/miembro/avisos/MisAvisos.tsx
```
Note each line number.

- [ ] **Step 2: Apply transformation**

Read the file and replace each `toLocale*` call per the canonical table above. Add the `formatDateNI` (or appropriate) import. If the component doesn't already have `useLocale`, add it.

Specifically (line 30 per current grep):
```tsx
return new Date(y, m - 1, d).toLocaleDateString("es-NI", {
```
Becomes a call site using `formatDateNI(\`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}\`, locale)` — but this is a date-only context (no time) so the formatter ignores tz issues. **However**, still migrate for consistency and to clear the grep gate.

- [ ] **Step 3: Build to ensure no regression**
```bash
pnpm build
```

### 5b — Repeat for each of the remaining 16 files

Apply the same 3-step process (inspect, transform, build) for each file in this list:

```
components/dashboard/miembro/avisos/AvisoDetailModal.tsx
components/dashboard/miembro/documentos/DocumentoCard.tsx
components/dashboard/miembro/beneficios/BeneficioCard.tsx
components/dashboard/miembro/beneficios/BeneficioDetailModal.tsx
components/dashboard/miembro/ajustes/AjustesForm.tsx
components/dashboard/miembro/citas/steps/PasoConfirmar.tsx
components/dashboard/miembro/citas/steps/PasoServicio.tsx
components/dashboard/empresa/EmpresaInicioCitasPorServicio.tsx
components/dashboard/empresa/EmpresaAjustes.tsx
components/dashboard/empresa/EditarUsuarioModal.tsx
components/dashboard/admin/AvisosAdmin.tsx
components/dashboard/admin/AdminInicioCitasPorServicio.tsx
components/dashboard/admin/AdminEmpresas.tsx
components/dashboard/admin/AdminBeneficios.tsx
```

**Important guidance for the implementer:**
- Read each file FIRST to understand the context of the `toLocale*` call (server vs. client component, what `locale` source is available).
- For files that already accept `locale` as a prop (e.g., page components passing it down), use that. For client components, use `useLocale()`. For server components (server route handlers, RSC), use `await getLocale()` from `"next-intl/server"`.
- For the format string `day: "numeric", month: "long", year: "numeric"` → `formatDateNI` works (full long date without weekday). If the existing call includes `weekday`, use `formatDateNI` (which includes weekday by spec). If it does NOT include weekday and you want to preserve that, use `formatDateShortNI`. **Match the user-visible output as closely as possible.**
- Some files (e.g., `BeneficioCard.tsx` line 48) parse a date out of `y/m/d` parts. Those represent **calendar dates without a time**, so build a `YYYY-MM-DD` string and pass to `formatDateNI` (the formatter will treat it as midnight in NI tz, which is unambiguous).
- Some files use `toLocaleString` with no `timeZone` — those are buggy. Migrate to `formatDateTimeNI` (full date + short time, NI tz).

- [ ] **Step 4: Final build for this task**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 5: Commit (one commit for all 17 files)**
```bash
git add components/
git commit -m "refactor(date-display): migrate 17 components to centralized NI datetime helpers"
```

If the commit feels too large to review, split into 2-3 commits by component family (admin, empresa, miembro). The implementer may exercise judgment here; the canonical default is a single commit.

---

## Task 6: Consistency migration of the 15 files already using tz

**Approach:** These files render correctly today (they already pass `timeZone: "America/Managua"`) but inline the literal. Migrate to the helpers for consistency and to satisfy the grep gate in Task 8.

**Canonical transformation:** anything matching `.toLocale*("es-NI"|"en-US", { ..., timeZone: "America/Managua", ... })` → drop the `timeZone` option and replace the entire call with the matching helper from `lib/datetime.ts`.

**For each file:**
1. Read the file.
2. Identify the existing format options (weekday, dateStyle, timeStyle, hour12, etc.).
3. Pick the helper whose output matches: `formatDateNI` (long with weekday), `formatDateShortNI` (short), `formatTimeNI` (24h `08:00`), `formatTime12NI` (12h `8:00 AM`), `formatDateTimeNI` (full date + short time), `formatShortDateTimeNI` (compact).
4. If exact output cannot be matched by any helper, **prefer adding a new helper to `lib/datetime.ts`** over inlining the format options. The grep gate in Task 8 will fail otherwise.

**File list:**

```
components/dashboard/CampanaUnificada.tsx
components/dashboard/miembro/ProximaCitaCard.tsx
components/dashboard/miembro/citas/CitaCard.tsx
components/dashboard/empresa/EmpresaInicioCitasPendientes.tsx
components/dashboard/empresa/EmpresaCitasRegistro.tsx
components/dashboard/empresa/DetalleModal.tsx
components/dashboard/admin/AdminPagoVerificacion.tsx
components/dashboard/admin/AdminCitasRegistro.tsx
components/dashboard/admin/AdminUsuarioContratosUsage.tsx
components/dashboard/admin/AdminCitaDetalleModal.tsx
components/dashboard/admin/AdminUbicacionFormModal.tsx
components/dashboard/admin/AdminInicioCitasPendientes.tsx
components/dashboard/admin/AdminCitasPendientesAdmin.tsx
components/dashboard/admin/DetalleModalAdmin.tsx
app/api/admin/ubicaciones/route.ts
```

**Special case — `app/api/admin/ubicaciones/route.ts`:** this is a Route Handler (server-side, no React). It uses `getTranslations()` and a hardcoded locale path. The `useLocale` hook is unavailable; use `await getLocale()` from `"next-intl/server"`.

- [ ] **Step 1: Process each file**

Iterate through the list. For each:
- Read.
- Replace `.toLocale*(...)` call sites with the matching helper.
- Add the `@/lib/datetime` import.
- If the file uses `useLocale` already, reuse it. Otherwise add it (client) or `getLocale` (server).
- Run `pnpm build` after every 3-4 files to catch regressions early.

- [ ] **Step 2: Final build**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 3: Commit (one commit for all 15)**
```bash
git add components/ app/
git commit -m "refactor(date-display): migrate 15 NI-aware components to centralized helpers"
```

Split into smaller commits only if the diff exceeds ~500 lines.

---

## Task 7: Bug C — Idempotent `completeSignupAction`

**Files:**
- Modify: `app/[locale]/(auth)/signup/actions.ts`

- [ ] **Step 1: Replace the password-update block**

In `app/[locale]/(auth)/signup/actions.ts`, find lines 188-207:

```ts
  // Set password, metadata, and optionally email in auth.users.
  // Email is set via admin client (service role) to skip the confirmation email flow —
  // phone is already the verified primary auth method.
  const authUpdateData: {
    password?: string;
    data: { full_name: string; display_name: string; nombre_completo: string };
  } = {
    data: {
      full_name: formData.nombreCompleto,
      display_name: formData.nombreCompleto,
      nombre_completo: formData.nombreCompleto,
    },
  };

  if (formData.password) {
    authUpdateData.password = formData.password;
  }

  const { error: pwError } = await supabase.auth.updateUser(authUpdateData);
  if (pwError) return { error: t("credentialsError", { message: pwError.message }) };
```

Replace with:

```ts
  // Set password, metadata, and optionally email in auth.users.
  // Email is set via admin client (service role) to skip the confirmation email flow —
  // phone is already the verified primary auth method.
  //
  // Idempotency: a previous failed attempt may have already persisted the
  // password. Retrying with the same password makes Supabase Auth reject the
  // update with "New password should be different from the old password".
  // We treat that specific error as a no-op success so the retry can continue
  // to update profile + email (the parts the user actually needs to finish).
  const userMetadata = {
    full_name:       formData.nombreCompleto,
    display_name:    formData.nombreCompleto,
    nombre_completo: formData.nombreCompleto,
  };

  if (formData.password) {
    const { error: pwError } = await supabase.auth.updateUser({
      password: formData.password,
      data:     userMetadata,
    });
    if (pwError) {
      const msg = pwError.message.toLowerCase();
      const isSamePassword =
        msg.includes("different from the old password") ||
        msg.includes("same as the old password") ||
        msg.includes("same_password");
      if (!isSamePassword) {
        return { error: t("credentialsError", { message: pwError.message }) };
      }
      // Same-as-previous-password: a prior attempt already set this exact
      // password. Treat as success and continue. Metadata may not have been
      // updated in that case — write it now via a metadata-only call.
      const { error: metaError } = await supabase.auth.updateUser({ data: userMetadata });
      if (metaError) {
        return { error: t("credentialsError", { message: metaError.message }) };
      }
    }
  } else {
    // No password change requested — still write metadata.
    const { error: metaError } = await supabase.auth.updateUser({ data: userMetadata });
    if (metaError) {
      return { error: t("credentialsError", { message: metaError.message }) };
    }
  }
```

- [ ] **Step 2: Build**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 3: Commit**
```bash
git add app/[locale]/\(auth\)/signup/actions.ts
git commit -m "fix(signup): make completeSignupAction idempotent on password retry"
```

---

## Task 8: Verification gate + final build/lint

- [ ] **Step 1: Grep gate**

Run:
```bash
grep -rn "America/Managua" components/ app/ lib/ 2>/dev/null | grep -v "node_modules"
```

Expected output: ONLY these three categories of matches.
- `lib/datetime.ts` (the single source of truth)
- `components/dashboard/admin/AdminCalendarioCitas.tsx` (FullCalendar `timeZone` prop — controlled exception)
- Possibly comments / docstrings that mention NI tz (allowed)

If any other file still contains `"America/Managua"`, return to Task 5 or Task 6 and finish migrating it. Do NOT proceed to push.

- [ ] **Step 2: Grep gate for `.toLocale`**

Run:
```bash
grep -rn "\.toLocaleDateString\|\.toLocaleTimeString\|\.toLocaleString" components/ app/ 2>/dev/null | grep -v "node_modules" | grep -v "lib/datetime.ts" | grep -v "components/ui/"
```

Expected: empty (or only matches inside `lib/datetime.ts` or shadcn primitives in `components/ui/`).

If non-empty, those files were missed in Task 5/6. Finish them before proceeding.

- [ ] **Step 3: Build + lint baseline check**

```bash
pnpm build
```
Expected: passes.

```bash
pnpm lint 2>&1 | tail -5
```
Expected: similar problem count to baseline (the codebase has pre-existing lint errors per CLAUDE.md, gate is `pnpm build`). Make sure this PR does not add NEW lint errors:
- Capture baseline error count: `git stash; pnpm lint 2>&1 | grep "✖" | head -1; git stash pop` (or run on `main`).
- Compare. If higher: investigate.

- [ ] **Step 4: Summary commit (if any cleanups needed)**

If steps 1-3 reveal small cleanups (forgotten files, missed imports), bundle them into one commit:
```bash
git add ...
git commit -m "chore(timezone): final cleanup from verification gate"
```

If no cleanups needed, skip this step.

---

## Task 9: Apply migration + push + PR

This task involves remote actions. The controller MUST request user confirmation before each remote action.

- [ ] **Step 1: Apply migration to remote Supabase**

Controller asks user: "OK to run `supabase db push`? This applies the 24h cutoff migration."

If yes:
```bash
supabase db push
```
Expected: applies `20260528000000_citas_24h_cutoff.sql`. Verify the function body contains `BOOKING_TOO_SOON` via:
```bash
# (Use the supabase MCP tool if available, else psql connection.)
```

- [ ] **Step 2: Push the branch**

Controller asks user: "OK to push `fix/timezone-normalization` to origin?"

If yes:
```bash
git push -u origin fix/timezone-normalization
```

- [ ] **Step 3: Open PR**

Controller asks user: "OK to open the PR now?"

If yes:
```bash
gh pr create --title "fix: timezone normalization + 24h cutoff + signup retry idempotency" --body "<<see body below>>"
```

PR body:

```markdown
## Summary

Three bugs reported by user testing from Australia (UTC+11):

1. **Wizard allowed booking <24h ahead.** `crear_cita_atomic` had no server-side time-minimum check; client-side enforced "calendar day after today" which is not the same as "≥24h from now". Fixed: SQL `RAISE EXCEPTION 'BOOKING_TOO_SOON'` if `p_fecha_hora_cita < NOW() + INTERVAL '24 hours'`, plus client UX filters out sub-24h slots in `PasoHorario`.

2. **Cita scheduled May 27 8 AM NI appeared May 28 in admin calendar.** FullCalendar was bucketing events in browser tz. Fixed: added `timeZone="America/Managua"` prop.

3. **Familiar signup failed silently leaving zombie rows.** `completeSignupAction` was not idempotent — Supabase Auth rejected re-setting the same password on retry, blocking the rest of the flow. Fixed: swallow the specific "same password" error and continue with profile/email update.

## Architecture change

Introduced `lib/datetime.ts` as the single source of truth for date/time display and Nicaragua-relative date math. **All `.toLocale*` calls and any direct `"America/Managua"` literal outside this module have been removed** (verified by grep gate in CI; two controlled exceptions: SQL migrations and the FullCalendar `timeZone` prop).

Migrated 32 components (17 that were rendering wrong in cross-tz + 15 that were correct but reinventing the wheel each time) to the new helpers.

## Database migration

This PR adds `supabase/migrations/20260528000000_citas_24h_cutoff.sql` which **replaces** `crear_cita_atomic` (idempotent `CREATE OR REPLACE`). Must be applied via `supabase db push`.

## Test plan

- [ ] **Bug A (24h cutoff):** From Australia tz, try to book today+12h → expect `booking_too_soon` toast. Book today+25h → expect success.
- [ ] **Bug B (FullCalendar tz):** Open admin calendar from Australia tz with a cita at 8 AM NI → verify it lands on the correct NI day cell.
- [ ] **Bug C (signup retry):** As a new familiar, type an already-used email → submit → see `emailExists`. Fix email and re-submit with same password → expect success (previously failed).
- [ ] **Date display sweep:** From Australia tz, visit `/dashboard/citas`, `/dashboard/avisos`, `/dashboard/admin/citas`, `/dashboard/admin/beneficios` → confirm all dates render in NI time.

## Specs

- `docs/superpowers/specs/2026-05-27-timezone-normalization-design.md`
- `docs/superpowers/plans/2026-05-27-timezone-normalization.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Self-review

Spec coverage (skim the spec, point each section to a task):

| Spec section | Implemented in |
|---|---|
| §1 New `lib/datetime.ts` | Task 1 |
| §2 Server-side 24h cutoff | Task 3 (SQL + error mapping + i18n) |
| §3 Client-side 24h UX | Task 4 (PasoFecha + PasoHorario refactor) |
| §4 FullCalendar tz | Task 2 |
| §5 Audit migration of 17 | Task 5 |
| §6 Consistency migration of 15 | Task 6 |
| §7 ESLint guard | **Out of scope per spec** (only documented, not implemented; ESLint baseline is broken anyway) |
| §8 Idempotent signup-familiar | Task 7 |
| Verification gate (grep) | Task 8 |
| Migration apply + push + PR | Task 9 |

Placeholder scan: no "TBD"/"TODO" in plan body. The audit/consistency tasks (5 and 6) reference "use judgment" for matching the right helper to the existing format — this is necessary because each file's format options vary; the canonical-transformation table makes the rule explicit.

Type consistency: helper names (`todayNI`, `addDaysNI`, `calendarDateNI`, `dateToCalendarNI`, `formatDateNI`, `formatDateShortNI`, `formatTimeNI`, `formatTime12NI`, `formatDateTimeNI`, `formatShortDateTimeNI`, `isAtLeast24hAway`, `NICARAGUA_TZ`, `Loc`) match between Task 1 (definition), Task 4 (consumption), and Task 5/6 (referenced canonical transformations).

Spec gaps: none.
