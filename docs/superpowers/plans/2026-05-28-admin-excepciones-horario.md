# Admin Excepciones de Horario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the `excepciones_horario` admin feature: support all four scope levels (global, by-doctor, by-ubicación, by-doctor+ubicación), expose a unified `/admin/excepciones` page with calendar↔list toggle, and fix the SQL backend that currently ignores `ubicacion_id`.

**Architecture:** One SQL migration replaces `crear_cita_atomic` + `obtener_slots_disponibles` to honor `ubicacion_id` and adds the table to `supabase_realtime`. Three new endpoints under `/api/admin/excepciones/` provide unified CRUD (legacy per-doctor endpoints remain). A new admin page composed of a toggle wrapper + Calendar + Table views shares a common form modal. The existing per-doctor UI gets a UX polish link to the new global view.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui (Dialog), Supabase, next-intl, FullCalendar, sonner, `lib/datetime.ts`.

**No test suite:** verify with `pnpm build`. Manual QA matrix documented in spec.

**Spec:** `docs/superpowers/specs/2026-05-28-admin-excepciones-horario-design.md`

---

## File structure (created/modified by this plan)

```
supabase/migrations/20260528120000_excepciones_ubicacion_scope.sql   (new)
app/api/admin/excepciones/route.ts                                    (new — GET, POST)
app/api/admin/excepciones/[id]/route.ts                               (new — DELETE)
app/[locale]/(dashboard)/dashboard/admin/excepciones/page.tsx         (new)
components/dashboard/admin/AdminExcepcionesView.tsx                   (new — toggle)
components/dashboard/admin/AdminExcepcionesCalendario.tsx             (new)
components/dashboard/admin/AdminExcepcionesTabla.tsx                  (new)
components/dashboard/admin/AdminExcepcionFormModal.tsx                (new — create/edit)
components/dashboard/admin/AdminDoctorTabHorarios.tsx                 (modify — link to global)
components/dashboard/Sidebar.tsx                                       (modify — nav item)
messages/es.json, messages/en.json                                     (modify — new keys)
```

---

## Order

1. Task 0 — Setup verification
2. Task 1 — SQL migration (scope fix + realtime publication)
3. Task 2 — API endpoints (GET, POST, DELETE)
4. Task 3 — i18n keys
5. Task 4 — `AdminExcepcionFormModal` (create/edit modal)
6. Task 5 — `AdminExcepcionesCalendario`
7. Task 6 — `AdminExcepcionesTabla`
8. Task 7 — `AdminExcepcionesView` + page + sidebar nav
9. Task 8 — UX polish in `AdminDoctorTabHorarios`
10. Task 9 — Verification + db push + push + PR

---

## Task 0: Setup verification

**Files:** none

- [ ] **Step 1: Confirm branch**
```bash
git branch --show-current
```
Expected: `feat/admin-excepciones-horario`.

- [ ] **Step 2: Confirm spec is committed**
```bash
git log --oneline -3
```
Expected: top commit `docs(specs): admin excepciones de horario design` (`2842b89`).

- [ ] **Step 3: Baseline build**
```bash
pnpm build
```
Expected: passes.

---

## Task 1: SQL migration

**Files:**
- Create: `supabase/migrations/20260528120000_excepciones_ubicacion_scope.sql`

The migration replaces two RPCs in a single transaction and adds `excepciones_horario` to `supabase_realtime`. **DO NOT run `supabase db push`** — Task 9 handles the deploy after user confirmation.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260528120000_excepciones_ubicacion_scope.sql` with this EXACT content:

```sql
-- Migración: extiende excepciones_horario para honrar ubicacion_id.
-- - crear_cita_atomic: agrega clause (e.ubicacion_id IS NULL OR e.ubicacion_id = v_ubicacion_id).
-- - obtener_slots_disponibles: mismo cambio en el CTE bloqueados.
-- - Publica la tabla en supabase_realtime para que el admin calendar suscriba cambios.
-- Reemplaza versiones anteriores (20260528000000 / 20260527120000).

BEGIN;

-- ── 1) crear_cita_atomic ──────────────────────────────────────────────────
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

  -- 24h pre-booking cutoff
  IF p_fecha_hora_cita < NOW() + INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'BOOKING_TOO_SOON' USING ERRCODE = 'P0001';
  END IF;

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

  -- ── NEW: exception check now honors ubicacion_id ────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.excepciones_horario e
    WHERE (e.doctor_id    IS NULL OR e.doctor_id    = p_doctor_id)
      AND (e.ubicacion_id IS NULL OR e.ubicacion_id = v_ubicacion_id)
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

  -- Patient-busy check (from prior migration)
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

-- ── 2) obtener_slots_disponibles ──────────────────────────────────────────
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
  v_doctor_ubi     UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_servicios
    WHERE doctor_id = p_doctor_id AND servicio_id = p_servicio_id
  ) THEN
    RAISE EXCEPTION 'INVALID_DOCTOR_SERVICE' USING ERRCODE = 'P0001';
  END IF;

  SELECT slot_duracion INTO v_servicio_slots
  FROM public.servicios WHERE id = p_servicio_id;

  SELECT u.zona_horaria, d.ubicacion_id
    INTO v_doctor_tz, v_doctor_ubi
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
    -- NEW: honor ubicacion_id in addition to doctor_id
    SELECT s.slot_start
    FROM slots s
    WHERE EXISTS (
      SELECT 1 FROM public.excepciones_horario e
      WHERE (e.doctor_id    IS NULL OR e.doctor_id    = p_doctor_id)
        AND (e.ubicacion_id IS NULL OR e.ubicacion_id = v_doctor_ubi)
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
  FROM slots s;
END;
$$;

-- ── 3) Realtime publication ───────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.excepciones_horario;

-- GRANT EXECUTE preserved automatically by CREATE OR REPLACE.

COMMIT;
```

- [ ] **Step 2: Build (TypeScript only — SQL is not part of pnpm build but verify nothing else regressed)**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260528120000_excepciones_ubicacion_scope.sql
git commit -m "feat(citas): excepciones_horario honors ubicacion_id + adds realtime"
```

---

## Task 2: API endpoints

**Files:**
- Create: `app/api/admin/excepciones/route.ts` (GET + POST)
- Create: `app/api/admin/excepciones/[id]/route.ts` (DELETE)

Both files use the existing `assertAdmin` inline pattern (see `app/api/admin/doctores/[id]/excepciones/route.ts` for reference).

- [ ] **Step 1: Create `app/api/admin/excepciones/route.ts`**

```ts
/**
 * Admin · Excepciones (unified) — list + create across all scopes.
 *
 * Scopes by null-ness of doctor_id and ubicacion_id:
 *   - both null      → global (every doctor at every clinic)
 *   - doctor only    → that doctor at any clinic
 *   - ubicacion only → every doctor at that clinic
 *   - both set       → that doctor at that specific clinic
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

type Supa = Awaited<ReturnType<typeof createClient>>;

async function assertAdmin(supabase: Supa) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (profile?.rol !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

type Scope = "all" | "global" | "doctor" | "ubicacion" | "both";

function readScope(v: string | null): Scope {
  if (v === "global" || v === "doctor" || v === "ubicacion" || v === "both") return v;
  return "all";
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const scope        = readScope(sp.get("scope"));
  const doctorId     = sp.get("doctor_id");
  const ubicacionId  = sp.get("ubicacion_id");
  const fechaDesde   = sp.get("fecha_desde");
  const fechaHasta   = sp.get("fecha_hasta");

  let q = supabase
    .from("excepciones_horario")
    .select(`
      id, doctor_id, ubicacion_id, fecha_inicio, fecha_fin, motivo, created_at,
      doctor:doctores(id, nombre),
      ubicacion:ubicaciones(id, nombre)
    `)
    .order("fecha_inicio", { ascending: false });

  if (scope === "global")    q = q.is("doctor_id", null).is("ubicacion_id", null);
  if (scope === "doctor")    q = q.not("doctor_id", "is", null).is("ubicacion_id", null);
  if (scope === "ubicacion") q = q.is("doctor_id", null).not("ubicacion_id", "is", null);
  if (scope === "both")      q = q.not("doctor_id", "is", null).not("ubicacion_id", "is", null);

  if (doctorId)    q = q.eq("doctor_id", doctorId);
  if (ubicacionId) q = q.eq("ubicacion_id", ubicacionId);

  if (fechaDesde) q = q.gte("fecha_fin",    fechaDesde);
  if (fechaHasta) q = q.lte("fecha_inicio", fechaHasta);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ excepciones: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as {
    fecha_inicio?: string;
    fecha_fin?:    string;
    motivo?:       string;
    doctor_id?:    string | null;
    ubicacion_id?: string | null;
  };

  if (!body.fecha_inicio || !body.fecha_fin) {
    return NextResponse.json(
      { error: "fecha_inicio and fecha_fin are required (ISO)" },
      { status: 400 },
    );
  }
  if (new Date(body.fecha_fin) <= new Date(body.fecha_inicio)) {
    return NextResponse.json(
      { error: "fecha_fin must be after fecha_inicio" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("excepciones_horario")
    .insert({
      doctor_id:    body.doctor_id    ?? null,
      ubicacion_id: body.ubicacion_id ?? null,
      fecha_inicio: body.fecha_inicio,
      fecha_fin:    body.fecha_fin,
      motivo:       body.motivo ?? null,
    })
    .select("id, doctor_id, ubicacion_id, fecha_inicio, fecha_fin, motivo")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "excepcion.crear",
    entidad:      "excepciones_horario",
    entidadId:    data.id,
    datosDespues: data,
  });

  return NextResponse.json({ ok: true, excepcion: data }, { status: 201 });
}
```

- [ ] **Step 2: Create `app/api/admin/excepciones/[id]/route.ts`**

```ts
/**
 * Admin · Excepciones (unified) — delete by id, any scope.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

type Supa = Awaited<ReturnType<typeof createClient>>;

async function assertAdmin(supabase: Supa) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (profile?.rol !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const { error } = await supabase
    .from("excepciones_horario")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "excepcion.eliminar",
    entidad:      "excepciones_horario",
    entidadId:    id,
    datosDespues: {},
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Build**
```bash
pnpm build
```
Expected: passes. The two new routes appear in the build manifest.

- [ ] **Step 4: Commit**
```bash
git add app/api/admin/excepciones
git commit -m "feat(api): unified admin excepciones endpoints (GET/POST/DELETE)"
```

---

## Task 3: i18n keys

**Files:**
- Modify: `messages/es.json`
- Modify: `messages/en.json`

Add a new `excepciones` block under `Dashboard.admin`, and the nav key `gestionarExcepciones` under `Dashboard.sidebar.nav`. We add all keys upfront so subsequent component tasks can use them without further JSON edits.

- [ ] **Step 1: Add nav key to `messages/es.json`**

Find the `"nav"` block under `Dashboard.sidebar`. Use Edit with this exact pre-image:
```
"gestionarDoctores": "Doctores",
```
Post-image:
```
"gestionarDoctores": "Doctores",
        "gestionarExcepciones": "Excepciones",
```

- [ ] **Step 2: Add nav key to `messages/en.json`**

Same approach — find `"gestionarDoctores"` inside `Dashboard.sidebar.nav` and add `"gestionarExcepciones": "Exceptions"` immediately after.

- [ ] **Step 3: Add the `excepciones` block to `messages/es.json`**

Inside `Dashboard.admin`, find an existing admin block to anchor (e.g., the `doctores` or `citas` block). Append the new `excepciones` block right after it. Insert the following JSON exactly (adjust indentation to 6 spaces if anchoring inside `Dashboard.admin` per existing structure):

```json
"excepciones": {
  "title": "Excepciones de Horario",
  "subtitle": "Bloquea fechas en que no se puede agendar (feriados, vacaciones, cierres).",
  "newBtn": "Nueva excepción",
  "editBtn": "Editar",
  "deleteBtn": "Eliminar",
  "deleteConfirm": "¿Eliminar esta excepción? Las citas afectadas no se modifican automáticamente.",
  "view": {
    "calendario": "Calendario",
    "tabla": "Lista"
  },
  "scope": {
    "global": "Global",
    "doctor": "Por doctor",
    "ubicacion": "Por ubicación",
    "doctorYUbicacion": "Doctor + ubicación",
    "all": "Todos los scopes"
  },
  "col": {
    "scope": "Scope",
    "doctor": "Doctor",
    "ubicacion": "Ubicación",
    "inicio": "Inicio",
    "fin": "Fin",
    "motivo": "Motivo",
    "acciones": "Acciones"
  },
  "filter": {
    "scope": "Scope",
    "doctor": "Doctor",
    "ubicacion": "Ubicación",
    "desde": "Desde",
    "hasta": "Hasta",
    "todos": "Todos"
  },
  "form": {
    "title_create": "Nueva excepción",
    "title_edit": "Editar excepción",
    "scopeLabel": "Aplica a",
    "doctorLabel": "Doctor",
    "ubicacionLabel": "Ubicación",
    "selectDoctor": "Selecciona un doctor…",
    "selectUbicacion": "Selecciona una ubicación…",
    "fechaInicio": "Fecha y hora de inicio",
    "fechaFin": "Fecha y hora de fin",
    "motivo": "Motivo (opcional)",
    "motivoPlaceholder": "Ej. Feriado nacional, vacaciones, cierre de clínica",
    "submitCreate": "Crear excepción",
    "submitEdit": "Guardar cambios",
    "cancel": "Cancelar",
    "validation": {
      "endBeforeStart": "La fecha de fin debe ser posterior a la de inicio.",
      "missingFields": "Completa las fechas de inicio y fin.",
      "missingDoctor": "Selecciona un doctor para este scope.",
      "missingUbicacion": "Selecciona una ubicación para este scope."
    }
  },
  "empty": "No hay excepciones que coincidan con los filtros.",
  "loading": "Cargando excepciones…",
  "errorCargar": "No se pudieron cargar las excepciones.",
  "toast": {
    "creado": "Excepción creada.",
    "eliminado": "Excepción eliminada.",
    "actualizado": "Excepción actualizada.",
    "errorCrear": "No se pudo crear la excepción.",
    "errorEliminar": "No se pudo eliminar la excepción.",
    "errorActualizar": "No se pudo actualizar la excepción."
  },
  "seeGlobalLink": "Ver excepciones globales y por ubicación que también afectan a este doctor →",
  "multiScopeTooltip": "Las excepciones globales y por ubicación también afectan a este doctor, aunque solo veas las suyas aquí."
}
```

(Add a trailing comma after the previous block in the JSON to keep it valid.)

- [ ] **Step 4: Add equivalent EN block to `messages/en.json`**

Same structure, English values:

```json
"excepciones": {
  "title": "Schedule Exceptions",
  "subtitle": "Block dates when bookings should not be allowed (holidays, vacation, closures).",
  "newBtn": "New exception",
  "editBtn": "Edit",
  "deleteBtn": "Delete",
  "deleteConfirm": "Delete this exception? Affected appointments will not be modified automatically.",
  "view": {
    "calendario": "Calendar",
    "tabla": "List"
  },
  "scope": {
    "global": "Global",
    "doctor": "By doctor",
    "ubicacion": "By location",
    "doctorYUbicacion": "Doctor + location",
    "all": "All scopes"
  },
  "col": {
    "scope": "Scope",
    "doctor": "Doctor",
    "ubicacion": "Location",
    "inicio": "Start",
    "fin": "End",
    "motivo": "Reason",
    "acciones": "Actions"
  },
  "filter": {
    "scope": "Scope",
    "doctor": "Doctor",
    "ubicacion": "Location",
    "desde": "From",
    "hasta": "To",
    "todos": "All"
  },
  "form": {
    "title_create": "New exception",
    "title_edit": "Edit exception",
    "scopeLabel": "Applies to",
    "doctorLabel": "Doctor",
    "ubicacionLabel": "Location",
    "selectDoctor": "Select a doctor…",
    "selectUbicacion": "Select a location…",
    "fechaInicio": "Start date and time",
    "fechaFin": "End date and time",
    "motivo": "Reason (optional)",
    "motivoPlaceholder": "e.g. National holiday, vacation, clinic closed",
    "submitCreate": "Create exception",
    "submitEdit": "Save changes",
    "cancel": "Cancel",
    "validation": {
      "endBeforeStart": "End must be after start.",
      "missingFields": "Fill in the start and end dates.",
      "missingDoctor": "Select a doctor for this scope.",
      "missingUbicacion": "Select a location for this scope."
    }
  },
  "empty": "No exceptions match the current filters.",
  "loading": "Loading exceptions…",
  "errorCargar": "Could not load exceptions.",
  "toast": {
    "creado": "Exception created.",
    "eliminado": "Exception deleted.",
    "actualizado": "Exception updated.",
    "errorCrear": "Could not create exception.",
    "errorEliminar": "Could not delete exception.",
    "errorActualizar": "Could not update exception."
  },
  "seeGlobalLink": "View global and location exceptions that also affect this doctor →",
  "multiScopeTooltip": "Global and per-location exceptions also affect this doctor, even though only its own exceptions appear here."
}
```

- [ ] **Step 5: Build**
```bash
pnpm build
```
Expected: passes. The JSON files do not break TypeScript even if the keys aren't referenced yet.

- [ ] **Step 6: Commit**
```bash
git add messages/es.json messages/en.json
git commit -m "feat(i18n): admin excepciones keys (es + en)"
```

---

## Task 4: `AdminExcepcionFormModal`

**Files:**
- Create: `components/dashboard/admin/AdminExcepcionFormModal.tsx`

Shared modal used by both Calendar and Table views for create and edit. Edit-in-place is implemented as DELETE-old + POST-new (single submit handler).

- [ ] **Step 1: Create the file with this exact content**

```tsx
"use client";

/**
 * AdminExcepcionFormModal — create / edit a schedule exception.
 *
 * Edit-in-place is implemented as DELETE-then-POST (no PUT endpoint, by design).
 * This keeps the audit log clear (both actions are logged) and avoids adding a
 * new HTTP verb for an admin-only feature used at low frequency.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export type ExcepcionScope = "global" | "doctor" | "ubicacion" | "both";

export interface ExcepcionFormValue {
  id?:           string;
  scope:         ExcepcionScope;
  doctor_id:     string | null;
  ubicacion_id:  string | null;
  fecha_inicio:  string;  // YYYY-MM-DDTHH:mm (datetime-local) or ISO
  fecha_fin:     string;
  motivo:        string;
}

interface DoctorOption     { id: string; nombre: string; ubicacion_id: string | null }
interface UbicacionOption  { id: string; nombre: string }

interface Props {
  open:        boolean;
  initial:     ExcepcionFormValue | null;       // null = create new
  doctores:    DoctorOption[];
  ubicaciones: UbicacionOption[];
  onClose:     () => void;
  onSaved:     () => void;
}

const EMPTY: ExcepcionFormValue = {
  scope:        "global",
  doctor_id:    null,
  ubicacion_id: null,
  fecha_inicio: "",
  fecha_fin:    "",
  motivo:       "",
};

/** Convert ISO timestamptz to YYYY-MM-DDTHH:mm (datetime-local input format). */
function isoToLocalInput(iso: string): string {
  // Display directly via slicing — datetime-local doesn't carry tz, so we use
  // the user's local interpretation. Acceptable for admin tooling.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminExcepcionFormModal({
  open, initial, doctores, ubicaciones, onClose, onSaved,
}: Props) {
  const t = useTranslations("Dashboard.admin.excepciones");

  const [value, setValue] = useState<ExcepcionFormValue>(EMPTY);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setValue({
        ...initial,
        fecha_inicio: initial.fecha_inicio.includes("T") && initial.fecha_inicio.length > 16
          ? isoToLocalInput(initial.fecha_inicio)
          : initial.fecha_inicio,
        fecha_fin:    initial.fecha_fin.includes("T") && initial.fecha_fin.length > 16
          ? isoToLocalInput(initial.fecha_fin)
          : initial.fecha_fin,
      });
    } else {
      setValue(EMPTY);
    }
    setErr(null);
  }, [open, initial]);

  const isEdit = Boolean(initial?.id);

  function validate(v: ExcepcionFormValue): string | null {
    if (!v.fecha_inicio || !v.fecha_fin) return t("form.validation.missingFields");
    if (new Date(v.fecha_fin) <= new Date(v.fecha_inicio)) return t("form.validation.endBeforeStart");
    if ((v.scope === "doctor" || v.scope === "both") && !v.doctor_id) return t("form.validation.missingDoctor");
    if ((v.scope === "ubicacion" || v.scope === "both") && !v.ubicacion_id) return t("form.validation.missingUbicacion");
    return null;
  }

  async function handleSubmit() {
    const v = value;
    const validationErr = validate(v);
    if (validationErr) { setErr(validationErr); return; }

    setBusy(true);
    setErr(null);
    try {
      const payload = {
        fecha_inicio: new Date(v.fecha_inicio).toISOString(),
        fecha_fin:    new Date(v.fecha_fin).toISOString(),
        motivo:       v.motivo.trim() || null,
        doctor_id:    (v.scope === "doctor" || v.scope === "both") ? v.doctor_id : null,
        ubicacion_id: (v.scope === "ubicacion" || v.scope === "both") ? v.ubicacion_id : null,
      };

      // Edit-in-place: delete the old one first, then create the new one.
      if (isEdit && initial?.id) {
        const delRes = await fetch(`/api/admin/excepciones/${initial.id}`, { method: "DELETE" });
        if (!delRes.ok) {
          const j = await delRes.json().catch(() => ({})) as { error?: string };
          throw new Error(j.error ?? "delete failed");
        }
      }

      const res = await fetch("/api/admin/excepciones", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? "create failed");
      }

      toast.success(t(isEdit ? "toast.actualizado" : "toast.creado"));
      onSaved();
      onClose();
    } catch {
      toast.error(t(isEdit ? "toast.errorActualizar" : "toast.errorCrear"));
    } finally {
      setBusy(false);
    }
  }

  const fieldCls = "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1 font-roboto";

  const needsDoctor    = value.scope === "doctor"    || value.scope === "both";
  const needsUbicacion = value.scope === "ubicacion" || value.scope === "both";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("form.title_edit") : t("form.title_create")}</DialogTitle>
          <DialogDescription className="sr-only">{t("form.title_create")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>{t("form.scopeLabel")}</label>
            <select
              value={value.scope}
              onChange={(e) => setValue((s) => ({ ...s, scope: e.target.value as ExcepcionScope }))}
              className={fieldCls}
            >
              <option value="global">{t("scope.global")}</option>
              <option value="doctor">{t("scope.doctor")}</option>
              <option value="ubicacion">{t("scope.ubicacion")}</option>
              <option value="both">{t("scope.doctorYUbicacion")}</option>
            </select>
          </div>

          {needsDoctor && (
            <div>
              <label className={labelCls}>{t("form.doctorLabel")}</label>
              <select
                value={value.doctor_id ?? ""}
                onChange={(e) => setValue((s) => ({ ...s, doctor_id: e.target.value || null }))}
                className={fieldCls}
              >
                <option value="">{t("form.selectDoctor")}</option>
                {doctores.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {needsUbicacion && (
            <div>
              <label className={labelCls}>{t("form.ubicacionLabel")}</label>
              <select
                value={value.ubicacion_id ?? ""}
                onChange={(e) => setValue((s) => ({ ...s, ubicacion_id: e.target.value || null }))}
                className={fieldCls}
              >
                <option value="">{t("form.selectUbicacion")}</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("form.fechaInicio")}</label>
              <input
                type="datetime-local"
                value={value.fecha_inicio}
                onChange={(e) => setValue((s) => ({ ...s, fecha_inicio: e.target.value }))}
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t("form.fechaFin")}</label>
              <input
                type="datetime-local"
                value={value.fecha_fin}
                onChange={(e) => setValue((s) => ({ ...s, fecha_fin: e.target.value }))}
                className={fieldCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("form.motivo")}</label>
            <textarea
              value={value.motivo}
              onChange={(e) => setValue((s) => ({ ...s, motivo: e.target.value.slice(0, 280) }))}
              rows={2}
              placeholder={t("form.motivoPlaceholder")}
              className={fieldCls}
            />
          </div>

          {err && (
            <p className="text-xs font-roboto text-red-600">{err}</p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {t("form.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {isEdit ? t("form.submitEdit") : t("form.submitCreate")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Build**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 3: Commit**
```bash
git add components/dashboard/admin/AdminExcepcionFormModal.tsx
git commit -m "feat(admin/excepciones): create/edit modal with multi-scope form"
```

---

## Task 5: `AdminExcepcionesCalendario`

**Files:**
- Create: `components/dashboard/admin/AdminExcepcionesCalendario.tsx`

FullCalendar view of all exceptions across all scopes.

- [ ] **Step 1: Create the file with this exact content**

```tsx
"use client";

/**
 * AdminExcepcionesCalendario — global view of all schedule exceptions.
 *
 * Color coding by scope (matches AdminExcepcionesTabla badges):
 *   global         → red-600
 *   ubicacion-only → purple-600
 *   doctor-only    → green-600
 *   doctor + ubic. → blue-600
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import type {
  DatesSetArg,
  EventClickArg,
  EventInput,
  DateSelectArg,
} from "@fullcalendar/core";
import { useLocale } from "next-intl";
import { createClient } from "@/utils/supabase/client";
import AdminExcepcionFormModal, {
  type ExcepcionFormValue,
  type ExcepcionScope,
} from "./AdminExcepcionFormModal";

interface ExcepcionRow {
  id:           string;
  doctor_id:    string | null;
  ubicacion_id: string | null;
  fecha_inicio: string;
  fecha_fin:    string;
  motivo:       string | null;
  doctor:       { id: string; nombre: string } | null | { id: string; nombre: string }[];
  ubicacion:    { id: string; nombre: string } | null | { id: string; nombre: string }[];
}

interface DoctorOption    { id: string; nombre: string; ubicacion_id: string | null }
interface UbicacionOption { id: string; nombre: string }

function pickOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function scopeOf(row: ExcepcionRow): ExcepcionScope {
  if (row.doctor_id && row.ubicacion_id) return "both";
  if (row.doctor_id)                      return "doctor";
  if (row.ubicacion_id)                   return "ubicacion";
  return "global";
}

const COLOR_BY_SCOPE: Record<ExcepcionScope, string> = {
  global:    "#dc2626",
  ubicacion: "#9333ea",
  doctor:    "#16a34a",
  both:      "#2563eb",
};

interface Props {
  doctores:    DoctorOption[];
  ubicaciones: UbicacionOption[];
  doctorFilter?:    string;
  ubicacionFilter?: string;
}

export default function AdminExcepcionesCalendario({
  doctores, ubicaciones, doctorFilter, ubicacionFilter,
}: Props) {
  const t      = useTranslations("Dashboard.admin.excepciones");
  const locale = useLocale();

  const supabase    = useMemo(() => createClient(), []);
  const calendarRef = useRef<FullCalendar>(null);

  const [range, setRange]     = useState<{ start: Date; end: Date } | null>(null);
  const [events, setEvents]   = useState<EventInput[]>([]);
  const [rows, setRows]       = useState<ExcepcionRow[]>([]);
  const [modalOpen, setModalOpen]       = useState(false);
  const [initialValue, setInitialValue] = useState<ExcepcionFormValue | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!range) return;
    const desde = range.start.toISOString().slice(0, 10);
    const hasta = range.end.toISOString().slice(0, 10);
    const sp = new URLSearchParams({ fecha_desde: desde, fecha_hasta: hasta });
    if (doctorFilter)    sp.set("doctor_id",    doctorFilter);
    if (ubicacionFilter) sp.set("ubicacion_id", ubicacionFilter);
    const res = await fetch(`/api/admin/excepciones?${sp.toString()}`, { cache: "no-store" });
    if (!res.ok) { setEvents([]); setRows([]); return; }
    const j = await res.json() as { excepciones: ExcepcionRow[] };
    const list = j.excepciones ?? [];
    setRows(list);
    setEvents(list.map((r) => {
      const sc = scopeOf(r);
      const doc = pickOne(r.doctor);
      const ubi = pickOne(r.ubicacion);
      const scopeLabel = t(`scope.${sc === "both" ? "doctorYUbicacion" : sc}`);
      const titleParts = [scopeLabel];
      if (doc) titleParts.push(doc.nombre);
      if (ubi) titleParts.push(ubi.nombre);
      const title = `${titleParts.join(" · ")}${r.motivo ? ` — ${r.motivo}` : ""}`;
      return {
        id:    r.id,
        title,
        start: r.fecha_inicio,
        end:   r.fecha_fin,
        backgroundColor: COLOR_BY_SCOPE[sc],
        borderColor:     COLOR_BY_SCOPE[sc],
        textColor:       "#ffffff",
      };
    }));
  }, [supabase, range, doctorFilter, ubicacionFilter, t]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("admin-excepciones-calendar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "excepciones_horario" },
        () => { void fetchEvents(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, fetchEvents]);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setRange({ start: arg.start, end: arg.end });
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const row = rows.find((r) => r.id === arg.event.id);
    if (!row) return;
    const sc = scopeOf(row);
    setInitialValue({
      id:           row.id,
      scope:        sc,
      doctor_id:    row.doctor_id,
      ubicacion_id: row.ubicacion_id,
      fecha_inicio: row.fecha_inicio,
      fecha_fin:    row.fecha_fin,
      motivo:       row.motivo ?? "",
    });
    setModalOpen(true);
  }, [rows]);

  const handleSelect = useCallback((arg: DateSelectArg) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const toLocal = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setInitialValue({
      scope:        "global",
      doctor_id:    null,
      ubicacion_id: null,
      fecha_inicio: toLocal(arg.start),
      fecha_fin:    toLocal(arg.end),
      motivo:       "",
    });
    setModalOpen(true);
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        timeZone="America/Managua"
        initialView="dayGridMonth"
        headerToolbar={{
          left:   "prev,next today",
          center: "title",
          right:  "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        locale={locale === "en" ? "en" : esLocale}
        events={events}
        datesSet={handleDatesSet}
        eventClick={handleEventClick}
        selectable
        select={handleSelect}
        height="auto"
        allDaySlot={false}
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
      />

      <AdminExcepcionFormModal
        open={modalOpen}
        initial={initialValue}
        doctores={doctores}
        ubicaciones={ubicaciones}
        onClose={() => setModalOpen(false)}
        onSaved={() => { void fetchEvents(); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 3: Commit**
```bash
git add components/dashboard/admin/AdminExcepcionesCalendario.tsx
git commit -m "feat(admin/excepciones): FullCalendar view across all scopes"
```

---

## Task 6: `AdminExcepcionesTabla`

**Files:**
- Create: `components/dashboard/admin/AdminExcepcionesTabla.tsx`

Table view with filters and inline actions.

- [ ] **Step 1: Create the file with this exact content**

```tsx
"use client";

/**
 * AdminExcepcionesTabla — list view of schedule exceptions with filters.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeNI } from "@/lib/datetime";
import AdminExcepcionFormModal, {
  type ExcepcionFormValue,
  type ExcepcionScope,
} from "./AdminExcepcionFormModal";

interface ExcepcionRow {
  id:           string;
  doctor_id:    string | null;
  ubicacion_id: string | null;
  fecha_inicio: string;
  fecha_fin:    string;
  motivo:       string | null;
  doctor:       { id: string; nombre: string } | null | { id: string; nombre: string }[];
  ubicacion:    { id: string; nombre: string } | null | { id: string; nombre: string }[];
}

interface DoctorOption    { id: string; nombre: string; ubicacion_id: string | null }
interface UbicacionOption { id: string; nombre: string }

function pickOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function scopeOf(row: ExcepcionRow): ExcepcionScope {
  if (row.doctor_id && row.ubicacion_id) return "both";
  if (row.doctor_id)                      return "doctor";
  if (row.ubicacion_id)                   return "ubicacion";
  return "global";
}

const BADGE_BY_SCOPE: Record<ExcepcionScope, string> = {
  global:    "bg-red-100 text-red-700",
  ubicacion: "bg-purple-100 text-purple-700",
  doctor:    "bg-green-100 text-green-700",
  both:      "bg-blue-100 text-blue-700",
};

interface Props {
  doctores:    DoctorOption[];
  ubicaciones: UbicacionOption[];
  doctorFilter?:    string;
  ubicacionFilter?: string;
}

const PAGE_SIZE = 25;

export default function AdminExcepcionesTabla({
  doctores, ubicaciones, doctorFilter, ubicacionFilter,
}: Props) {
  const t      = useTranslations("Dashboard.admin.excepciones");
  const locale = useLocale() as "es" | "en";

  const [rows, setRows]       = useState<ExcepcionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Local filters (additional to props from parent)
  const [scopeFilter, setScopeFilter] = useState<"all" | ExcepcionScope>("all");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");

  // Modal state
  const [modalOpen, setModalOpen]       = useState(false);
  const [initialValue, setInitialValue] = useState<ExcepcionFormValue | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (scopeFilter !== "all") sp.set("scope", scopeFilter);
      if (doctorFilter)    sp.set("doctor_id",    doctorFilter);
      if (ubicacionFilter) sp.set("ubicacion_id", ubicacionFilter);
      if (desde) sp.set("fecha_desde", desde);
      if (hasta) sp.set("fecha_hasta", hasta);
      const res = await fetch(`/api/admin/excepciones?${sp.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const j = await res.json() as { excepciones: ExcepcionRow[] };
      setRows(j.excepciones ?? []);
      setPage(0);
    } catch {
      setRows([]);
      toast.error(t("errorCargar"));
    } finally {
      setLoading(false);
    }
  }, [scopeFilter, doctorFilter, ubicacionFilter, desde, hasta, t]);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/excepciones/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      toast.success(t("toast.eliminado"));
      void load();
    } catch {
      toast.error(t("toast.errorEliminar"));
    } finally {
      setDeletingId(null);
    }
  }

  function openEdit(row: ExcepcionRow) {
    setInitialValue({
      id:           row.id,
      scope:        scopeOf(row),
      doctor_id:    row.doctor_id,
      ubicacion_id: row.ubicacion_id,
      fecha_inicio: row.fecha_inicio,
      fecha_fin:    row.fecha_fin,
      motivo:       row.motivo ?? "",
    });
    setModalOpen(true);
  }

  const pageRows = useMemo(
    () => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [rows, page],
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const filterCls = "px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-700 focus:outline-none focus:ring-2 focus:ring-secondary/30";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("filter.scope")}</span>
          <select
            className={filterCls}
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as "all" | ExcepcionScope)}
          >
            <option value="all">{t("scope.all")}</option>
            <option value="global">{t("scope.global")}</option>
            <option value="doctor">{t("scope.doctor")}</option>
            <option value="ubicacion">{t("scope.ubicacion")}</option>
            <option value="both">{t("scope.doctorYUbicacion")}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("filter.desde")}</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={filterCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("filter.hasta")}</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={filterCls} />
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            {t("loading")}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm font-roboto text-gray-400">{t("empty")}</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2">{t("col.scope")}</th>
                  <th className="px-4 py-2">{t("col.doctor")}</th>
                  <th className="px-4 py-2">{t("col.ubicacion")}</th>
                  <th className="px-4 py-2">{t("col.inicio")}</th>
                  <th className="px-4 py-2">{t("col.fin")}</th>
                  <th className="px-4 py-2">{t("col.motivo")}</th>
                  <th className="px-4 py-2 text-right">{t("col.acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageRows.map((row) => {
                  const sc  = scopeOf(row);
                  const doc = pickOne(row.doctor);
                  const ubi = pickOne(row.ubicacion);
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-medium", BADGE_BY_SCOPE[sc])}>
                          {t(`scope.${sc === "both" ? "doctorYUbicacion" : sc}`)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{doc?.nombre ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-700">{ubi?.nombre ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-700">{formatDateTimeNI(row.fecha_inicio, locale)}</td>
                      <td className="px-4 py-2 text-gray-700">{formatDateTimeNI(row.fecha_fin, locale)}</td>
                      <td className="px-4 py-2 text-gray-700 truncate max-w-[200px]">{row.motivo ?? "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                            aria-label={t("editBtn")}
                            title={t("editBtn")}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row.id)}
                            disabled={deletingId === row.id}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                            aria-label={t("deleteBtn")}
                            title={t("deleteBtn")}
                          >
                            {deletingId === row.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="px-4 py-3 flex items-center justify-between text-xs text-neutral border-t border-gray-100">
                <span>{page + 1} / {totalPages}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <AdminExcepcionFormModal
        open={modalOpen}
        initial={initialValue}
        doctores={doctores}
        ubicaciones={ubicaciones}
        onClose={() => setModalOpen(false)}
        onSaved={() => { void load(); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 3: Commit**
```bash
git add components/dashboard/admin/AdminExcepcionesTabla.tsx
git commit -m "feat(admin/excepciones): table view with filters and inline actions"
```

---

## Task 7: `AdminExcepcionesView` + page + sidebar nav

**Files:**
- Create: `components/dashboard/admin/AdminExcepcionesView.tsx`
- Create: `app/[locale]/(dashboard)/dashboard/admin/excepciones/page.tsx`
- Modify: `components/dashboard/Sidebar.tsx` (add nav item)

- [ ] **Step 1: Create `AdminExcepcionesView.tsx`**

```tsx
"use client";

/**
 * AdminExcepcionesView — toggle wrapper (Calendario ↔ Lista) for /admin/excepciones.
 * The view choice is synced to ?view= so the back button preserves the user's tab.
 * Pre-applies doctor_id from the query string (so the per-doctor UI can deep-link here).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { List, CalendarRange, Plus, CalendarX } from "lucide-react";
import { cn } from "@/lib/utils";
import AdminExcepcionesCalendario from "./AdminExcepcionesCalendario";
import AdminExcepcionesTabla from "./AdminExcepcionesTabla";
import AdminExcepcionFormModal, {
  type ExcepcionFormValue,
} from "./AdminExcepcionFormModal";

interface DoctorOption    { id: string; nombre: string; ubicacion_id: string | null }
interface UbicacionOption { id: string; nombre: string }

type View = "calendario" | "tabla";
function readView(v: string | null): View { return v === "tabla" ? "tabla" : "calendario"; }

export default function AdminExcepcionesView() {
  const t       = useTranslations("Dashboard.admin.excepciones");
  const router  = useRouter();
  const params  = useSearchParams();
  const view    = readView(params.get("view"));

  const doctorFilter    = params.get("doctor_id")    ?? undefined;
  const ubicacionFilter = params.get("ubicacion_id") ?? undefined;

  const [doctores,    setDoctores]    = useState<DoctorOption[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbicacionOption[]>([]);

  const [modalOpen, setModalOpen]       = useState(false);
  const [initialValue, setInitialValue] = useState<ExcepcionFormValue | null>(null);
  const [refreshKey, setRefreshKey]     = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [dRes, uRes] = await Promise.all([
        fetch("/api/admin/doctores",    { cache: "no-store" }),
        fetch("/api/admin/ubicaciones", { cache: "no-store" }),
      ]);
      const [dJ, uJ] = await Promise.all([dRes.json(), uRes.json()]);
      if (cancelled) return;
      setDoctores((dJ.doctores ?? []).map((d: DoctorOption) => ({
        id: d.id, nombre: d.nombre, ubicacion_id: d.ubicacion_id,
      })));
      setUbicaciones((uJ.ubicaciones ?? []).map((u: UbicacionOption) => ({ id: u.id, nombre: u.nombre })));
    })();
    return () => { cancelled = true; };
  }, []);

  const setView = useCallback((next: View) => {
    const url = new URLSearchParams(params.toString());
    if (next === "calendario") url.delete("view");
    else                       url.set("view", next);
    const qs = url.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [params, router]);

  const handleNew = useCallback(() => {
    setInitialValue(null);
    setModalOpen(true);
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
            <CalendarX className="w-5 h-5 text-secondary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-poppins font-bold text-gray-900">{t("title")}</h1>
            <p className="text-sm font-roboto text-neutral">{t("subtitle")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold font-roboto hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {t("newBtn")}
        </button>
      </div>

      {/* Toggle */}
      <div className="inline-flex items-center gap-1 rounded-2xl border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setView("calendario")}
          aria-pressed={view === "calendario"}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-roboto font-medium transition-colors",
            view === "calendario"
              ? "bg-secondary text-white shadow-sm"
              : "text-neutral hover:text-gray-700",
          )}
        >
          <CalendarRange className="w-4 h-4" />
          {t("view.calendario")}
        </button>
        <button
          type="button"
          onClick={() => setView("tabla")}
          aria-pressed={view === "tabla"}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-roboto font-medium transition-colors",
            view === "tabla"
              ? "bg-secondary text-white shadow-sm"
              : "text-neutral hover:text-gray-700",
          )}
        >
          <List className="w-4 h-4" />
          {t("view.tabla")}
        </button>
      </div>

      {/* Active view (key forces remount on refresh, so the child fetches anew) */}
      {view === "calendario" ? (
        <AdminExcepcionesCalendario
          key={`cal-${refreshKey}`}
          doctores={doctores}
          ubicaciones={ubicaciones}
          doctorFilter={doctorFilter}
          ubicacionFilter={ubicacionFilter}
        />
      ) : (
        <AdminExcepcionesTabla
          key={`tab-${refreshKey}`}
          doctores={doctores}
          ubicaciones={ubicaciones}
          doctorFilter={doctorFilter}
          ubicacionFilter={ubicacionFilter}
        />
      )}

      <AdminExcepcionFormModal
        open={modalOpen}
        initial={initialValue}
        doctores={doctores}
        ubicaciones={ubicaciones}
        onClose={() => setModalOpen(false)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

Create `app/[locale]/(dashboard)/dashboard/admin/excepciones/page.tsx`:

```tsx
/**
 * Admin · Excepciones de Horario — page entry.
 * Auth gate inside (dashboard) layout handles login redirect; we additionally
 * verify the role here so non-admins land on /dashboard.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminExcepcionesView from "@/components/dashboard/admin/AdminExcepcionesView";

export default async function AdminExcepcionesPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return <AdminExcepcionesView />;
}
```

- [ ] **Step 3: Add sidebar nav item**

In `components/dashboard/Sidebar.tsx`, find this exact block (around line 102-108):

```tsx
  // "Citas" — booking module management
  const citasItems: NavItemConfig[] = [
    { href: `${base}/admin/citas`,        label: t("nav.gestionarCitas"),       icon: CalendarCheck },
    { href: `${base}/admin/ubicaciones`,  label: t("nav.gestionarUbicaciones"), icon: MapPin },
    { href: `${base}/admin/servicios`,    label: t("nav.gestionarServicios"),   icon: Stethoscope },
    { href: `${base}/admin/doctores`,     label: t("nav.gestionarDoctores"),    icon: UserRound },
  ];
```

Replace with:

```tsx
  // "Citas" — booking module management
  const citasItems: NavItemConfig[] = [
    { href: `${base}/admin/citas`,         label: t("nav.gestionarCitas"),        icon: CalendarCheck },
    { href: `${base}/admin/ubicaciones`,   label: t("nav.gestionarUbicaciones"),  icon: MapPin },
    { href: `${base}/admin/servicios`,     label: t("nav.gestionarServicios"),    icon: Stethoscope },
    { href: `${base}/admin/doctores`,      label: t("nav.gestionarDoctores"),     icon: UserRound },
    { href: `${base}/admin/excepciones`,   label: t("nav.gestionarExcepciones"),  icon: CalendarX },
  ];
```

Then add `CalendarX` to the lucide-react imports at the top of `Sidebar.tsx`. Find the existing `lucide-react` import line and add `CalendarX` to the destructured imports (it may already be imported elsewhere; if so, ensure it's in the Sidebar.tsx import). Read the import block first to know exactly where to add.

- [ ] **Step 4: Build**
```bash
pnpm build
```
Expected: passes. The new route `/[locale]/dashboard/admin/excepciones` appears in the build manifest.

- [ ] **Step 5: Commit**
```bash
git add components/dashboard/admin/AdminExcepcionesView.tsx app/[locale]/\(dashboard\)/dashboard/admin/excepciones components/dashboard/Sidebar.tsx
git commit -m "feat(admin/excepciones): page + view wrapper + sidebar nav item"
```

---

## Task 8: UX polish in `AdminDoctorTabHorarios`

**Files:**
- Modify: `components/dashboard/admin/AdminDoctorTabHorarios.tsx`

Add a small link to `/admin/excepciones?doctor_id=<this>` next to the section B header so the admin can quickly see ALL exceptions affecting this doctor (per-doctor + global + ubicación).

- [ ] **Step 1: Read the file to find section B**

Locate the section B header block (around line 207-220 — the `{/* Section B — Excepciones */}` block with the "Add excepcion" button).

- [ ] **Step 2: Add an info link below the section header**

Use the locale prefix from the route. The component is client-side, so we use `useLocale()`. Add an import at the top:

```tsx
import { useLocale } from "next-intl";
import Link from "next/link";
```

(If `useLocale` is already imported, skip that import; if `Link` is, also skip.)

Inside the component body (near where `useTranslations` is called), add:

```tsx
  const locale = useLocale();
```

Then in the JSX, find the section B header div:

```tsx
      {/* Section B — Excepciones */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-poppins font-semibold text-gray-900 inline-flex items-center gap-2">
            <CalendarX className="w-4 h-4 text-secondary" />
            {t("excepcionesTitle")}
          </h2>
          <button
            type="button"
            onClick={() => setExcepcionOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-roboto font-medium text-secondary border border-secondary/30 hover:bg-secondary/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("addExcepcion")}
          </button>
        </div>
```

Replace with (adds an info paragraph + cross-link after the title row):

```tsx
      {/* Section B — Excepciones */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-poppins font-semibold text-gray-900 inline-flex items-center gap-2">
            <CalendarX className="w-4 h-4 text-secondary" />
            {t("excepcionesTitle")}
          </h2>
          <button
            type="button"
            onClick={() => setExcepcionOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-roboto font-medium text-secondary border border-secondary/30 hover:bg-secondary/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("addExcepcion")}
          </button>
        </div>

        <Link
          href={`/${locale}/dashboard/admin/excepciones?doctor_id=${doctorId}`}
          className="block text-xs font-roboto text-secondary hover:underline"
        >
          {useTranslations("Dashboard.admin.excepciones")("seeGlobalLink")}
        </Link>
```

**Wait — that's a hook-call-inside-JSX, which is illegal.** Fix: declare the translation hook at the top of the component instead. Specifically, near the existing `useTranslations` call for `Dashboard.admin.doctores...`, add:

```tsx
  const tEx = useTranslations("Dashboard.admin.excepciones");
```

And replace the bad `useTranslations(...)("seeGlobalLink")` with `tEx("seeGlobalLink")`. Final JSX:

```tsx
        <Link
          href={`/${locale}/dashboard/admin/excepciones?doctor_id=${doctorId}`}
          className="block text-xs font-roboto text-secondary hover:underline"
        >
          {tEx("seeGlobalLink")}
        </Link>
```

- [ ] **Step 3: Build**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 4: Commit**
```bash
git add components/dashboard/admin/AdminDoctorTabHorarios.tsx
git commit -m "feat(admin/doctores): link from doctor horarios to global excepciones view"
```

---

## Task 9: Verification + deploy + PR

- [ ] **Step 1: Grep gates (verify no regressions on the timezone work from PR #39)**

```bash
grep -rn "America/Managua" components/ app/ 2>/dev/null | grep -v "lib/datetime.ts"
```
Expected: ONLY `AdminCalendarioCitas.tsx:296` AND `AdminExcepcionesCalendario.tsx` (the new file uses the literal in `timeZone="America/Managua"` prop, same controlled exception pattern).

```bash
grep -rn "\.toLocaleDateString\|\.toLocaleTimeString\|\.toLocaleString" components/ app/ 2>/dev/null | grep -v "components/ui/" | grep -v "lib/datetime.ts"
```
Expected: 0 hits.

If either gate has unexpected hits, fix before continuing.

- [ ] **Step 2: Final build**

```bash
pnpm build
```
Expected: passes.

- [ ] **Step 3: Apply migration to remote Supabase**

Controller asks user: "OK to run `supabase db push`? Applies the excepciones_horario ubicacion-scope migration."

If yes:
```bash
supabase db push
```
Expected: applies `20260528120000_excepciones_ubicacion_scope.sql`.

Verify with the MCP `execute_sql` tool:
```sql
SELECT (pg_get_functiondef('public.crear_cita_atomic'::regproc)::text ~ 'e.ubicacion_id IS NULL OR e.ubicacion_id') AS ubicacion_in_crear,
       (pg_get_functiondef('public.obtener_slots_disponibles'::regproc)::text ~ 'e.ubicacion_id IS NULL OR e.ubicacion_id') AS ubicacion_in_obtener,
       (SELECT COUNT(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'excepciones_horario')::INT AS realtime_count;
```
Expected: `ubicacion_in_crear = true`, `ubicacion_in_obtener = true`, `realtime_count = 1`.

- [ ] **Step 4: Push branch**

Controller asks user: "OK to push branch `feat/admin-excepciones-horario`?"

If yes:
```bash
git push -u origin feat/admin-excepciones-horario
```

- [ ] **Step 5: Open PR**

Controller asks user: "OK to open the PR?"

If yes:
```bash
gh pr create --title "feat(admin): excepciones de horario — multi-scope management" --body "<<see body below>>"
```

PR body:

```markdown
## Summary

Completes the `excepciones_horario` admin feature. Three pieces:

1. **SQL fix:** `crear_cita_atomic` and `obtener_slots_disponibles` now honor `ubicacion_id`. Previously the column existed in the schema but was ignored by the booking RPC, so per-clinic blocks didn't actually block.
2. **Unified endpoints** under `/api/admin/excepciones/` (GET/POST/DELETE) supporting all four scope combinations (global, per-doctor, per-ubicación, doctor+ubicación). Legacy per-doctor endpoints unchanged.
3. **New admin page** `/dashboard/admin/excepciones` with calendar↔table toggle (same pattern as `/admin/citas`), color-coded by scope, with create/edit modal. Sidebar nav item under "Citas" group.

Plus a UX polish link from the per-doctor horarios tab pointing at the new global view pre-filtered by that doctor.

## Database migration

`supabase/migrations/20260528120000_excepciones_ubicacion_scope.sql`:
- Replaces `crear_cita_atomic` (preserves all prior logic: 24h cutoff, patient-busy check, slot-taken).
- Replaces `obtener_slots_disponibles`.
- Adds `public.excepciones_horario` to `supabase_realtime` (was not previously published).

## Test plan

- [ ] Create a **global** exception for tomorrow → verify the wizard can't book any doctor at any clinic during that range.
- [ ] Create a **per-ubicación** exception → verify wizard can't book any doctor in that clinic; can still book other clinics.
- [ ] Create a **per-doctor** exception → previous behavior unchanged (still works).
- [ ] Create a **doctor + ubicación** exception → most specific case, blocks only that combo.
- [ ] Toggle calendar↔table works; query string `?view=tabla` persists across reload.
- [ ] Edit an existing exception in either view (DELETE+POST round-trip) → exception updated, audit log shows both actions.
- [ ] Delete an exception with confirmation → row disappears, realtime refresh works.
- [ ] Per-doctor horarios tab shows the "Ver excepciones globales..." link → deep-link arrives at `/admin/excepciones?doctor_id=<id>` with filter applied.

## Specs

- `docs/superpowers/specs/2026-05-28-admin-excepciones-horario-design.md`
- `docs/superpowers/plans/2026-05-28-admin-excepciones-horario.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Self-review

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| §1 Backend extension (ubicacion_id) | Task 1 (SQL migration) |
| §2 Unified endpoints | Task 2 (GET/POST/DELETE) |
| §3 New route + page | Task 7 (page + view wrapper) |
| §3 Calendar component | Task 5 |
| §3 Table component | Task 6 |
| §3 Form modal | Task 4 |
| §4 UX polish (cross-link) | Task 8 |
| §5 i18n keys | Task 3 |
| §6 Sidebar nav | Task 7 (step 3) |
| Realtime publication | Task 1 (in same migration) |
| Manual QA matrix | Task 9 (Test plan section of PR body) |

**Placeholder scan:** none. Every step has exact code or exact commands.

**Type consistency:** `ExcepcionScope`, `ExcepcionFormValue`, `ExcepcionRow`, `DoctorOption`, `UbicacionOption` are defined identically across files. `scopeOf`, `pickOne` use the same shape. `COLOR_BY_SCOPE` and `BADGE_BY_SCOPE` cover the same 4 keys.

**Open items:** none.
