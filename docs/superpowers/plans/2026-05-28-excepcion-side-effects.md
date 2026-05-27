# Excepción Side-Effects + Doctor Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a warning panel + auto-cancel cascade when creating excepciones that affect existing citas, and extend the notification pipeline so doctors receive email + .ics for confirmed citas and email notice for cancelled citas.

**Architecture:** One new SQL RPC wraps INSERT-excepción + UPDATE-cancel-citas in a single transaction. The existing `tr_cita_estado_change` trigger and edge function pipeline handles patient notification automatically. The edge function is extended with two new doctor-email branches (`confirmada`, `cancelada`). One new endpoint provides preview of affected citas for the form modal; the form modal debounces against this endpoint and shows a warning panel.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Edge Functions), Resend, next-intl, shadcn/ui, sonner, `lib/datetime.ts`.

**No test suite:** verify with `pnpm build`. Edge function deploy via `supabase functions deploy procesar_eventos_cita`.

**Spec:** `docs/superpowers/specs/2026-05-28-excepcion-side-effects-design.md`

---

## File structure

```
supabase/migrations/20260528180000_excepcion_cancel_cascade.sql              (new)
app/api/admin/excepciones/preview-affected/route.ts                          (new)
app/api/admin/excepciones/route.ts                                           (modify — POST calls RPC)
components/dashboard/admin/AdminExcepcionFormModal.tsx                       (modify — warning panel)
supabase/functions/procesar_eventos_cita/index.ts                            (modify — doctor email)
messages/es.json, messages/en.json                                           (modify — affected.* keys + toast)
```

---

## Order

1. Task 0 — Setup verification
2. Task 1 — SQL migration (new RPC)
3. Task 2 — Preview endpoint
4. Task 3 — POST endpoint switches to RPC
5. Task 4 — i18n keys
6. Task 5 — Warning panel in form modal
7. Task 6 — Edge function doctor email branches
8. Task 7 — Verification + db push + edge function deploy + push + PR

---

## Task 0: Setup verification

- [ ] **Step 1: Confirm branch**
```bash
git branch --show-current
```
Expected: `feat/excepcion-side-effects-and-doctor-notif`.

- [ ] **Step 2: Confirm spec is committed**
```bash
git log --oneline -3
```
Expected: top commit `docs(specs): excepción side-effects + doctor notifications design` (`2d2aeb1`).

- [ ] **Step 3: Baseline build**
```bash
pnpm build
```
Expected: passes.

---

## Task 1: SQL migration — `crear_excepcion_con_cancelaciones` RPC

**File:** Create `supabase/migrations/20260528180000_excepcion_cancel_cascade.sql`

**DO NOT run `supabase db push`** — Task 7 deploys after user confirmation.

- [ ] **Step 1: Create migration file**

Create the file with this EXACT content:

```sql
-- Migración: RPC crear_excepcion_con_cancelaciones.
-- Inserta una excepción de horario Y cancela todas las citas existentes que
-- caen dentro de su scope+ventana. La cancelación dispara el trigger
-- tr_cita_estado_change → cita_eventos → edge function (email al paciente).

BEGIN;

CREATE OR REPLACE FUNCTION public.crear_excepcion_con_cancelaciones(
  p_doctor_id    UUID,
  p_ubicacion_id UUID,
  p_fecha_inicio TIMESTAMPTZ,
  p_fecha_fin    TIMESTAMPTZ,
  p_motivo       TEXT
)
RETURNS TABLE (
  excepcion_id            UUID,
  citas_canceladas_count  INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID := auth.uid();
  v_user_rol      TEXT;
  v_excepcion_id  UUID;
  v_motivo_cancel TEXT;
  v_count         INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol INTO v_user_rol FROM public.users WHERE id = v_user_id;
  IF v_user_rol <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF p_fecha_fin <= p_fecha_inicio THEN
    RAISE EXCEPTION 'INVALID_RANGE' USING ERRCODE = 'P0001';
  END IF;

  -- 1) Insertar la excepción.
  INSERT INTO public.excepciones_horario (doctor_id, ubicacion_id, fecha_inicio, fecha_fin, motivo)
  VALUES (p_doctor_id, p_ubicacion_id, p_fecha_inicio, p_fecha_fin, p_motivo)
  RETURNING id INTO v_excepcion_id;

  -- 2) Componer el motivo de cancelación que verá el paciente en el email.
  v_motivo_cancel := CASE
    WHEN p_motivo IS NULL OR TRIM(p_motivo) = ''
      THEN 'Bloqueo administrativo del horario'
    ELSE 'Bloqueo administrativo: ' || p_motivo
  END;

  -- 3) Cancelar citas afectadas. El trigger tr_cita_estado_change escribirá
  -- un evento 'cancelada' por cada fila → edge function envía email al
  -- paciente con este motivo.
  WITH affected AS (
    UPDATE public.citas c
    SET estado_sync        = 'cancelado'::public.estado_sync,
        motivo_cancelacion = v_motivo_cancel,
        cancelado_por      = v_user_id,
        cancelado_at       = NOW()
    WHERE c.estado_sync NOT IN ('cancelado', 'rechazado')
      AND (p_doctor_id    IS NULL OR c.doctor_id    = p_doctor_id)
      AND (p_ubicacion_id IS NULL OR c.ubicacion_id = p_ubicacion_id)
      AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
          && tstzrange(p_fecha_inicio, p_fecha_fin, '[)')
    RETURNING c.id
  )
  SELECT COUNT(*)::INT INTO v_count FROM affected;

  RETURN QUERY SELECT v_excepcion_id, v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_excepcion_con_cancelaciones(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO authenticated;

COMMIT;
```

- [ ] **Step 2: Build (TypeScript only — SQL is not validated by pnpm build but confirm nothing else regressed)**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260528180000_excepcion_cancel_cascade.sql
git commit -m "feat(citas): RPC to create exception and cascade-cancel affected citas"
```

---

## Task 2: Preview endpoint

**File:** Create `app/api/admin/excepciones/preview-affected/route.ts`

Returns the list of citas that would be cancelled if the given exception scope+window were applied. Capped at 50 rows.

- [ ] **Step 1: Create the file with this EXACT content**

```ts
/**
 * Admin · Excepciones — preview affected citas.
 *
 * GET /api/admin/excepciones/preview-affected?fecha_inicio&fecha_fin&doctor_id?&ubicacion_id?
 *
 * Returns the citas that would be cancelled if an exception with the given
 * scope+window were created. Capped at 50 rows. Used by the form modal to
 * show a warning panel before submit.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

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

interface RawRow {
  id:              string;
  fecha_hora_cita: string;
  fecha_hora_fin:  string | null;
  paciente:  { nombre_completo: string | null; telefono: string | null } | { nombre_completo: string | null; telefono: string | null }[] | null;
  doctor:    { nombre: string } | { nombre: string }[] | null;
  ubicacion: { nombre: string } | { nombre: string }[] | null;
}

function pickOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const fechaInicio = sp.get("fecha_inicio");
  const fechaFin    = sp.get("fecha_fin");
  const doctorId    = sp.get("doctor_id");
  const ubicacionId = sp.get("ubicacion_id");

  if (!fechaInicio || !fechaFin) {
    return NextResponse.json({ affected: [] });
  }
  if (new Date(fechaFin) <= new Date(fechaInicio)) {
    return NextResponse.json({ affected: [] });
  }

  let q = supabase
    .from("citas")
    .select(`
      id, fecha_hora_cita, fecha_hora_fin,
      paciente:users!paciente_id(nombre_completo, telefono),
      doctor:doctores(nombre),
      ubicacion:ubicaciones(nombre)
    `)
    .not("estado_sync", "in", "(cancelado,rechazado)")
    .lt("fecha_hora_cita", fechaFin)
    .gt("fecha_hora_fin",  fechaInicio)
    .order("fecha_hora_cita", { ascending: true })
    .limit(50);

  if (doctorId)    q = q.eq("doctor_id",    doctorId);
  if (ubicacionId) q = q.eq("ubicacion_id", ubicacionId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const affected = ((data ?? []) as unknown as RawRow[]).map((r) => {
    const pac = pickOne(r.paciente);
    const doc = pickOne(r.doctor);
    const ubi = pickOne(r.ubicacion);
    return {
      id:                r.id,
      fecha_hora_cita:   r.fecha_hora_cita,
      paciente_nombre:   pac?.nombre_completo ?? "—",
      paciente_telefono: pac?.telefono ?? null,
      doctor_nombre:     doc?.nombre ?? "—",
      ubicacion_nombre:  ubi?.nombre ?? "—",
    };
  });

  return NextResponse.json({ affected });
}
```

- [ ] **Step 2: Build**
```bash
pnpm build
```
Expected: passes. The new route appears in the manifest as `ƒ /api/admin/excepciones/preview-affected`.

- [ ] **Step 3: Commit**
```bash
git add app/api/admin/excepciones/preview-affected
git commit -m "feat(api): preview-affected endpoint for exception form modal"
```

---

## Task 3: POST endpoint switches to RPC

**File:** Modify `app/api/admin/excepciones/route.ts`

Replace the direct INSERT with a call to `crear_excepcion_con_cancelaciones`. Response now includes `citas_canceladas`.

- [ ] **Step 1: Update the POST handler**

In `app/api/admin/excepciones/route.ts`, find the entire `export async function POST(req: NextRequest)` block and replace its body (everything inside the function, AFTER the validation checks) with:

```ts
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

  const { data, error } = await supabase.rpc("crear_excepcion_con_cancelaciones", {
    p_doctor_id:    body.doctor_id    ?? null,
    p_ubicacion_id: body.ubicacion_id ?? null,
    p_fecha_inicio: body.fecha_inicio,
    p_fecha_fin:    body.fecha_fin,
    p_motivo:       body.motivo ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // RPC returns a one-row TABLE; supabase-js returns it as an array of objects.
  const row = Array.isArray(data) ? data[0] : data;
  const excepcionId       = row?.excepcion_id           ?? null;
  const citasCanceladas   = row?.citas_canceladas_count ?? 0;

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "excepcion.crear",
    entidad:      "excepciones_horario",
    entidadId:    excepcionId ?? "",
    datosDespues: {
      doctor_id:    body.doctor_id    ?? null,
      ubicacion_id: body.ubicacion_id ?? null,
      fecha_inicio: body.fecha_inicio,
      fecha_fin:    body.fecha_fin,
      motivo:       body.motivo ?? null,
      citas_canceladas: citasCanceladas,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      excepcion: {
        id:           excepcionId,
        doctor_id:    body.doctor_id    ?? null,
        ubicacion_id: body.ubicacion_id ?? null,
        fecha_inicio: body.fecha_inicio,
        fecha_fin:    body.fecha_fin,
        motivo:       body.motivo ?? null,
      },
      citas_canceladas: citasCanceladas,
    },
    { status: 201 },
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
git add app/api/admin/excepciones/route.ts
git commit -m "feat(api): POST excepciones now cascades via crear_excepcion_con_cancelaciones RPC"
```

---

## Task 4: i18n keys

**Files:**
- Modify: `messages/es.json`
- Modify: `messages/en.json`

Add `affected.*` block and `toast.creadoConCancelaciones` under `Dashboard.admin.excepciones`.

- [ ] **Step 1: Add to `messages/es.json`**

Find inside `Dashboard.admin.excepciones` the existing `toast` block. Use Edit with pre-image:

```
"toast": {
    "creado": "Excepción creada.",
    "eliminado": "Excepción eliminada.",
    "actualizado": "Excepción actualizada.",
    "errorCrear": "No se pudo crear la excepción.",
    "errorEliminar": "No se pudo eliminar la excepción.",
    "errorActualizar": "No se pudo actualizar la excepción."
  },
```

Post-image (note: indentation may be 6 spaces in your file — use grep to confirm exact whitespace before applying):

```
"toast": {
    "creado": "Excepción creada.",
    "creadoConCancelaciones": "Excepción creada. {n} cita(s) cancelada(s).",
    "eliminado": "Excepción eliminada.",
    "actualizado": "Excepción actualizada.",
    "errorCrear": "No se pudo crear la excepción.",
    "errorEliminar": "No se pudo eliminar la excepción.",
    "errorActualizar": "No se pudo actualizar la excepción."
  },
  "affected": {
    "loading": "Verificando citas afectadas…",
    "none": "Ninguna cita existente se verá afectada por esta excepción.",
    "count": "Esta excepción cancelará {n} cita(s) existente(s).",
    "whatsappReminder": "Al crear la excepción, estas citas se cancelarán automáticamente y se enviará correo al paciente. Recuerda contactarlos también por WhatsApp para confirmar y reagendar si corresponde."
  },
```

If the surrounding indentation differs, adjust accordingly. The two new top-level objects (`creadoConCancelaciones` key inside `toast`, and `affected` block at the same level as `toast`) must be at the right depth inside `Dashboard.admin.excepciones`.

- [ ] **Step 2: Add equivalent EN to `messages/en.json`**

Same approach in EN file. Find the `toast` block under `Dashboard.admin.excepciones` and add:

```json
"creadoConCancelaciones": "Exception created. {n} appointment(s) cancelled.",
```

inside the toast block, and the new sibling `affected` block:

```json
"affected": {
  "loading": "Checking affected appointments…",
  "none": "No existing appointments will be affected by this exception.",
  "count": "This exception will cancel {n} existing appointment(s).",
  "whatsappReminder": "When the exception is created, these appointments will be auto-cancelled and the patient will be emailed. Remember to also contact them via WhatsApp to confirm and reschedule if needed."
}
```

- [ ] **Step 3: Build**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 4: Commit**
```bash
git add messages/es.json messages/en.json
git commit -m "feat(i18n): affected-citas keys for exception form"
```

---

## Task 5: Warning panel in `AdminExcepcionFormModal`

**File:** Modify `components/dashboard/admin/AdminExcepcionFormModal.tsx`

Add state for affected-citas preview, debounced fetch, and a warning panel that renders above the footer. Also update the success toast to use `creadoConCancelaciones` when citas are cancelled.

- [ ] **Step 1: Add imports + new state**

In `components/dashboard/admin/AdminExcepcionFormModal.tsx`, find the existing import block at the top. Add to the `useState` line in imports if not already there (it is), and add `useLocale` to next-intl import (it's not there).

Find:
```tsx
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
```

Replace with:
```tsx
import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatShortDateTimeNI } from "@/lib/datetime";
```

- [ ] **Step 2: Add `AffectedCita` type and new state**

Find the existing types block (after `import` lines). Add this type alongside `ExcepcionFormValue`:

```tsx
interface AffectedCita {
  id:                string;
  fecha_hora_cita:   string;
  paciente_nombre:   string;
  paciente_telefono: string | null;
  doctor_nombre:     string;
  ubicacion_nombre:  string;
}
```

Inside the component body (right after the existing `const [err, setErr]   = useState<string | null>(null);`), add:

```tsx
  const locale = useLocale() as "es" | "en";
  const [affected,       setAffected]       = useState<AffectedCita[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
```

- [ ] **Step 3: Add the debounced preview effect**

Add a NEW `useEffect` right after the existing `useEffect` that resets the form on `open`/`initial` changes. Insert:

```tsx
  // Debounced preview of affected citas. Re-runs when any field that affects
  // the overlap changes. Skipped when validation would fail.
  useEffect(() => {
    if (!open) return;

    // Pre-validate: skip preview if fields aren't ready.
    if (!value.fecha_inicio || !value.fecha_fin) { setAffected(null); return; }
    if (new Date(value.fecha_fin) <= new Date(value.fecha_inicio)) { setAffected(null); return; }
    if ((value.scope === "doctor"    || value.scope === "both") && !value.doctor_id)    { setAffected(null); return; }
    if ((value.scope === "ubicacion" || value.scope === "both") && !value.ubicacion_id) { setAffected(null); return; }

    let cancelled = false;
    setPreviewLoading(true);
    const handle = setTimeout(async () => {
      try {
        const sp = new URLSearchParams({
          fecha_inicio: new Date(value.fecha_inicio).toISOString(),
          fecha_fin:    new Date(value.fecha_fin).toISOString(),
        });
        const docId = (value.scope === "doctor"    || value.scope === "both") ? value.doctor_id    : null;
        const ubiId = (value.scope === "ubicacion" || value.scope === "both") ? value.ubicacion_id : null;
        if (docId) sp.set("doctor_id",    docId);
        if (ubiId) sp.set("ubicacion_id", ubiId);
        const res = await fetch(`/api/admin/excepciones/preview-affected?${sp.toString()}`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) { setAffected([]); return; }
        const j = await res.json() as { affected: AffectedCita[] };
        setAffected(j.affected ?? []);
      } catch {
        if (!cancelled) setAffected([]);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 300);

    return () => { cancelled = true; clearTimeout(handle); };
  }, [open, value.scope, value.doctor_id, value.ubicacion_id, value.fecha_inicio, value.fecha_fin]);
```

- [ ] **Step 4: Update `handleSubmit` to use cancelled-count toast**

Find the existing `handleSubmit` function. Inside the `try` block, after `if (!res.ok) { ... }`, replace:

```ts
      toast.success(t(isEdit ? "toast.actualizado" : "toast.creado"));
```

With:

```ts
      if (isEdit) {
        toast.success(t("toast.actualizado"));
      } else {
        const j2 = await res.json().catch(() => ({})) as { citas_canceladas?: number };
        const cancelled = j2.citas_canceladas ?? 0;
        if (cancelled > 0) {
          toast.success(t("toast.creadoConCancelaciones", { n: cancelled }));
        } else {
          toast.success(t("toast.creado"));
        }
      }
```

Note: the existing code reads `res` once with `if (!res.ok) ...` but doesn't consume the body. If `res.json()` was already called above (it isn't — the success branch never reads the body in the current code), then this is safe. Verify the function flow before applying.

- [ ] **Step 5: Add the warning panel JSX**

Find the existing JSX inside `<div className="space-y-4">`. The error paragraph is the last child:

```tsx
          {err && (
            <p className="text-xs font-roboto text-red-600">{err}</p>
          )}
        </div>
```

Insert the warning panel BEFORE the `{err && ...}` line:

```tsx
          {previewLoading && (
            <p className="text-xs font-roboto text-gray-400">{t("affected.loading")}</p>
          )}
          {!previewLoading && affected && affected.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-sm font-roboto font-semibold text-red-700">
                ⚠️ {t("affected.count", { n: affected.length })}
              </p>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {affected.map((c) => (
                  <li
                    key={c.id}
                    className="text-xs font-roboto text-red-900 grid grid-cols-[auto_1fr] gap-2"
                  >
                    <span className="font-medium whitespace-nowrap">
                      {formatShortDateTimeNI(c.fecha_hora_cita, locale)}
                    </span>
                    <span>
                      {c.paciente_nombre}
                      {c.paciente_telefono ? ` · ${c.paciente_telefono}` : ""}
                      {" · "}{c.doctor_nombre} — {c.ubicacion_nombre}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs font-roboto text-red-700">
                {t("affected.whatsappReminder")}
              </p>
            </div>
          )}
          {!previewLoading && affected && affected.length === 0 && (
            <p className="text-xs font-roboto text-gray-500">{t("affected.none")}</p>
          )}

          {err && (
```

(The closing `)}` for the err paragraph stays the same — you're only inserting blocks ABOVE it.)

- [ ] **Step 6: Build**
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 7: Commit**
```bash
git add components/dashboard/admin/AdminExcepcionFormModal.tsx
git commit -m "feat(admin/excepciones): warning panel showing affected citas before submit"
```

---

## Task 6: Edge function — doctor email branches

**File:** Modify `supabase/functions/procesar_eventos_cita/index.ts`

Extend `CitaDetalle.doctor` to include `correo`, fetch it in the query, and add doctor-email branches for `confirmada` and `cancelada`.

- [ ] **Step 1: Extend the `CitaDetalle` interface**

Find:
```ts
interface CitaDetalle {
  id: string;
  fecha_hora_cita: string;
  fecha_hora_fin: string | null;
  paciente_id: string;
  motivo_cita: string | null;
  estado_sync: string;
  motivo_rechazo: string | null;
  motivo_cancelacion: string | null;
  paciente: { nombre_completo: string | null; telefono: string | null; email: string | null } | null;
  doctor: { nombre: string } | null;
  servicio: { nombre: string } | null;
  ubicacion: { nombre: string; direccion: string | null } | null;
}
```

Replace with (only `doctor` line changes):
```ts
interface CitaDetalle {
  id: string;
  fecha_hora_cita: string;
  fecha_hora_fin: string | null;
  paciente_id: string;
  motivo_cita: string | null;
  estado_sync: string;
  motivo_rechazo: string | null;
  motivo_cancelacion: string | null;
  paciente: { nombre_completo: string | null; telefono: string | null; email: string | null } | null;
  doctor: { nombre: string | null; correo: string | null } | null;
  servicio: { nombre: string } | null;
  ubicacion: { nombre: string; direccion: string | null } | null;
}
```

- [ ] **Step 2: Update the SELECT in `fetchCita`**

Find:
```ts
      doctor:doctores(nombre),
```

Replace with:
```ts
      doctor:doctores(nombre, correo),
```

- [ ] **Step 3: Add doctor email branch in `case "confirmada":`**

Find the existing `case "confirmada":` block. After the existing patient email push (the `if (cita.paciente.email && cita.fecha_hora_fin)` block ending with `}));` and `}`), and BEFORE the line `const results = await Promise.allSettled(promises);`, insert:

```ts
      // NEW: doctor receives the same .ics + a different email body.
      if (cita.doctor?.correo && cita.fecha_hora_fin) {
        const icsDoc = buildIcs({
          uid:         cita.id,
          start:       new Date(cita.fecha_hora_cita),
          end:         new Date(cita.fecha_hora_fin),
          summary:     `${servicioNombre} — ${cita.paciente.nombre_completo ?? "Paciente"}`,
          description: cita.motivo_cita ?? undefined,
          location:    `${ubicacionNombre}${cita.ubicacion?.direccion ? ` — ${cita.ubicacion.direccion}` : ""}`,
          organizer:   { name: "clubSOS", email: Deno.env.get("EMAIL_FROM") ?? "no-reply@clubsos.com" },
        });
        promises.push(sendEmail({
          to:      cita.doctor.correo,
          subject: `Nueva cita: ${cita.paciente.nombre_completo ?? "Paciente"} — ${fechaTxt}`,
          html: `
            <h2>Nueva cita agendada</h2>
            <p>Hola Dr(a). ${cita.doctor.nombre ?? ""},</p>
            <p>Se confirmó una nueva cita en tu agenda:</p>
            <ul>
              <li><strong>Paciente:</strong> ${cita.paciente.nombre_completo ?? "—"}</li>
              <li><strong>Teléfono:</strong> ${cita.paciente.telefono ?? "—"}</li>
              <li><strong>Servicio:</strong> ${servicioNombre}</li>
              <li><strong>Fecha:</strong> ${fechaTxt}</li>
              <li><strong>Ubicación:</strong> ${ubicacionNombre}</li>
              ${cita.motivo_cita ? `<li><strong>Motivo:</strong> ${cita.motivo_cita}</li>` : ""}
            </ul>
            <p>Adjuntamos un archivo .ics para que puedas agregarla a tu calendario.</p>
            <p>— El equipo de clubSOS</p>
          `,
          icsContent: icsDoc,
        }));
      }
```

- [ ] **Step 4: Add doctor email branch in `case "cancelada":`**

Find the existing `case "cancelada":` block. Currently it's structured around in-app + WhatsApp to the patient; replace the entire `case "cancelada":` body to add a Promise.allSettled fan-out that also emails the doctor.

Find:
```ts
    case "cancelada":
      await insertInApp(
        cita.paciente_id, "cita_cancelada",
        "Cita cancelada",
        `Tu cita de ${servicioNombre} el ${fechaTxt} fue cancelada.`,
        "/dashboard/citas",
      );
      if (cita.paciente.telefono) {
        await sendWhatsappTemplate({
          to: cita.paciente.telefono, template: "cita_cancelada", languageCode: "es",
          params: [
            cita.paciente.nombre_completo ?? "",
            servicioNombre,
            fechaTxt,
          ],
        });
      }
      return { ok: true };
```

Replace with:

```ts
    case "cancelada": {
      const promises: Promise<unknown>[] = [];

      promises.push(insertInApp(
        cita.paciente_id, "cita_cancelada",
        "Cita cancelada",
        `Tu cita de ${servicioNombre} el ${fechaTxt} fue cancelada${cita.motivo_cancelacion ? `: ${cita.motivo_cancelacion}` : ""}.`,
        "/dashboard/citas",
      ));

      if (cita.paciente.telefono) {
        promises.push(sendWhatsappTemplate({
          to: cita.paciente.telefono, template: "cita_cancelada", languageCode: "es",
          params: [
            cita.paciente.nombre_completo ?? "",
            servicioNombre,
            fechaTxt,
          ],
        }));
      }

      // Patient email with motivo (new — previously only WhatsApp + in-app).
      if (cita.paciente.email) {
        promises.push(sendEmail({
          to:      cita.paciente.email,
          subject: "Tu cita ha sido cancelada",
          html: `
            <h2>Cita cancelada</h2>
            <p>Hola ${cita.paciente.nombre_completo ?? ""},</p>
            <p>Te informamos que tu cita fue <strong>cancelada</strong>:</p>
            <ul>
              <li><strong>Servicio:</strong> ${servicioNombre}</li>
              <li><strong>Doctor:</strong> ${doctorNombre}</li>
              <li><strong>Fecha:</strong> ${fechaTxt}</li>
              <li><strong>Ubicación:</strong> ${ubicacionNombre}</li>
              ${cita.motivo_cancelacion ? `<li><strong>Motivo:</strong> ${cita.motivo_cancelacion}</li>` : ""}
            </ul>
            <p>Si tienes preguntas o necesitas reagendar, contáctanos.</p>
            <p>— El equipo de clubSOS</p>
          `,
        }));
      }

      // NEW: doctor notification (no .ics — the cancellation is just informative).
      if (cita.doctor?.correo) {
        promises.push(sendEmail({
          to:      cita.doctor.correo,
          subject: `Cita cancelada: ${cita.paciente.nombre_completo ?? "Paciente"} — ${fechaTxt}`,
          html: `
            <h2>Cita cancelada</h2>
            <p>Hola Dr(a). ${cita.doctor.nombre ?? ""},</p>
            <p>La siguiente cita fue cancelada y el horario queda libre en tu agenda:</p>
            <ul>
              <li><strong>Paciente:</strong> ${cita.paciente.nombre_completo ?? "—"}</li>
              <li><strong>Servicio:</strong> ${servicioNombre}</li>
              <li><strong>Fecha:</strong> ${fechaTxt}</li>
              <li><strong>Ubicación:</strong> ${ubicacionNombre}</li>
              ${cita.motivo_cancelacion ? `<li><strong>Motivo:</strong> ${cita.motivo_cancelacion}</li>` : ""}
            </ul>
            <p>— El equipo de clubSOS</p>
          `,
        }));
      }

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      if (fulfilled.length === 0 && results.length > 0) {
        return { ok: false, error: "Todos los canales fallaron" };
      }
      return { ok: true };
    }
```

- [ ] **Step 5: Build (TypeScript checks main app; edge function is Deno and not part of pnpm build)**

```bash
pnpm build
```
Expected: passes.

Optionally, smoke-test the edge function syntax via Deno (if installed):
```bash
deno check supabase/functions/procesar_eventos_cita/index.ts 2>&1 | tail -5
```
If `deno` is not installed locally, skip — Supabase will validate at deploy time.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/procesar_eventos_cita/index.ts
git commit -m "feat(citas/edge): doctor email + ics on confirmada, patient/doctor email on cancelada"
```

---

## Task 7: Verification + db push + edge function deploy + push + PR

All actions in this task touch the remote — controller must request user confirmation before each.

- [ ] **Step 1: Final build + grep gates**

```bash
pnpm build
```
Expected: passes.

Verify the timezone grep gates from PR #39 still hold (no regressions):
```bash
grep -rn "America/Managua" components/ app/ 2>/dev/null | grep -v "lib/datetime.ts"
```
Expected: ONLY `AdminCalendarioCitas.tsx` and `AdminExcepcionesCalendario.tsx` (controlled exceptions).

```bash
grep -rn "\.toLocaleDateString\|\.toLocaleTimeString\|\.toLocaleString" components/ app/ 2>/dev/null | grep -v "components/ui/" | grep -v "lib/datetime.ts"
```
Expected: 0 hits.

- [ ] **Step 2: Apply migration**

Controller asks user: "OK to run `supabase db push`? Adds the new RPC `crear_excepcion_con_cancelaciones`."

If yes:
```bash
supabase db push
```
Expected: applies `20260528180000_excepcion_cancel_cascade.sql`.

Verify with MCP `execute_sql`:
```sql
SELECT
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'crear_excepcion_con_cancelaciones') AS rpc_present,
  (SELECT pronargs FROM pg_proc WHERE proname = 'crear_excepcion_con_cancelaciones') AS rpc_arg_count;
```
Expected: `rpc_present = true`, `rpc_arg_count = 5`.

- [ ] **Step 3: Deploy edge function**

Controller asks user: "OK to run `supabase functions deploy procesar_eventos_cita`? Pushes the updated function with doctor email branches."

If yes:
```bash
supabase functions deploy procesar_eventos_cita
```
Expected: deploys without error.

(Edge function logs can be monitored via the Supabase dashboard if something looks off post-deploy.)

- [ ] **Step 4: Push branch**

Controller asks user: "OK to push `feat/excepcion-side-effects-and-doctor-notif`?"

If yes:
```bash
git push -u origin feat/excepcion-side-effects-and-doctor-notif
```

- [ ] **Step 5: Open PR**

Controller asks user: "OK to open the PR?"

If yes, PR body:

```markdown
## Summary

Closes the loop on `excepciones_horario`: when admin creates an exception, the system now (a) previews the affected citas in the form, (b) auto-cancels those citas on submit, and (c) the existing pipeline emails the patient with the cancellation motivo. Plus, doctors now receive their own email + .ics calendar invite when a cita is confirmed, and an email notice when a cita is cancelled.

### What changed

1. **New SQL RPC** `crear_excepcion_con_cancelaciones(doctor_id, ubicacion_id, fecha_inicio, fecha_fin, motivo)` wraps the INSERT + cascade UPDATE in one transaction. Returns `{ excepcion_id, citas_canceladas_count }`.

2. **New endpoint** `GET /api/admin/excepciones/preview-affected` returns up to 50 citas that would be cancelled.

3. **POST `/api/admin/excepciones`** now calls the RPC and includes `citas_canceladas` in the response.

4. **`AdminExcepcionFormModal`** debounces a preview against the new endpoint and renders a red warning panel with patient name, phone, doctor, location, and a WhatsApp reminder. The success toast reports the cancelled count.

5. **Edge function `procesar_eventos_cita`** extended:
   - `confirmada` event → doctor now receives email + .ics matching the patient's calendar invite (subject + body adjusted for the doctor's perspective).
   - `cancelada` event → patient now receives an email (previously only WhatsApp + in-app) with the cancellation motivo, AND doctor receives an email notice (no .ics).

## Database migration

Applied: `supabase/migrations/20260528180000_excepcion_cancel_cascade.sql`.

## Edge function deploy

Applied: `supabase functions deploy procesar_eventos_cita`.

## Test plan

- [ ] Open `/admin/excepciones` → "Nueva excepción" → pick a range with NO active citas → no warning shown → submit → toast "Excepción creada."
- [ ] Pick a range covering an active cita → warning panel shows patient + phone + doctor + ubicación + WhatsApp reminder text → submit → toast "Excepción creada. 1 cita(s) cancelada(s)." → patient receives cancellation email with the motivo.
- [ ] As a member, schedule a cita → admin confirms it → doctor receives email with .ics attachment → opens cleanly in Google Calendar.
- [ ] Admin cancels a cita from `AdminCitaDetalleModal` → patient receives cancellation email with motivo → doctor receives email notice with motivo.
- [ ] Test scope combinations: doctor-only exception cancels only that doctor's affected citas; ubicación-only cancels all doctors at that clinic; doctor+ubicación cancels only the intersection; global cancels everything in the window.

## Specs

- `docs/superpowers/specs/2026-05-28-excepcion-side-effects-design.md`
- `docs/superpowers/plans/2026-05-28-excepcion-side-effects.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Command:
```bash
gh pr create --title "feat(citas): excepción auto-cancel + doctor email notifications" --body "<<above>>"
```

---

## Self-review

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| §1 SQL migration with new RPC | Task 1 |
| §2 Preview endpoint | Task 2 |
| §3 POST switches to RPC | Task 3 |
| §4 Edge function doctor email (confirmada + cancelada) | Task 6 |
| Warning panel + debounced preview in form | Task 5 |
| i18n keys (`affected.*` + `creadoConCancelaciones`) | Task 4 |
| db push + edge function deploy + PR | Task 7 |
| Existing patient cancellation email (already works) | Task 7 (QA only) |

**Placeholder scan:** no "TBD"/"TODO"/"add error handling"/etc. Every step contains exact code or exact commands.

**Type consistency:** `AffectedCita` shape defined in Task 2 (server) and Task 5 (client) match field-for-field (`id`, `fecha_hora_cita`, `paciente_nombre`, `paciente_telefono`, `doctor_nombre`, `ubicacion_nombre`). RPC return shape `{ excepcion_id, citas_canceladas_count }` used consistently in Task 1 (define) and Task 3 (consume).

**Open items:** none.
