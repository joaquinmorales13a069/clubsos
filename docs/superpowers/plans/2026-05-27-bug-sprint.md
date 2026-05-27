# Bug-fix Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 bug fixes / minor features bundled into a single PR on branch `fix/bug-sprint-mayo-2026`.

**Architecture:** Three pure-frontend changes (#1 tab, #2 bell merge, #3 copy, #5 location) + one database migration (#4 patient-busy validation). All changes are local to existing files; one new component (`CampanaUnificada`) replaces two, one new component (`AdminUsuarioContratosUsage`) is added, one new API route (`/api/admin/usuarios/[id]/contratos-usage`) is added, and one SQL migration replaces the `crear_cita_atomic` RPC.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, Supabase (Postgres + RPCs), next-intl, sonner toasts.

**Important — no test suite:** This codebase has no automated tests (per `CLAUDE.md`). The "verify" step in each task is `pnpm build` (which runs `tsc` type-check) plus a documented manual smoke test. Do not add Jest/Vitest scaffolding.

**Spec:** `docs/superpowers/specs/2026-05-27-bug-sprint-design.md`

---

## Order

1. Task 0 — Setup (branch already created during brainstorming)
2. Task 1 — Bug #3: rename cancel/reject modal buttons
3. Task 2 — Bug #5: show ubicación on member CitaCard
4. Task 3 — Bug #1: add "Uso de citas" tab to admin user modal
5. Task 4 — Bug #2: merge notifications + avisos bells into `CampanaUnificada`
6. Task 5 — Bug #4: patient-busy check in `crear_cita_atomic`
7. Task 6 — Final verification

---

## Task 0: Setup verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm on the right branch**

Run:
```bash
git branch --show-current
```
Expected output: `fix/bug-sprint-mayo-2026`

If not on that branch:
```bash
git checkout fix/bug-sprint-mayo-2026
```

- [ ] **Step 2: Confirm spec is committed**

Run:
```bash
git log --oneline -5
```
Expected: top commit is `docs(specs): bug-fix sprint May 2026 design` (commit `253a2b0` or similar).

- [ ] **Step 3: Baseline build passes**

Run:
```bash
pnpm build
```
Expected: build completes without TypeScript errors. If it fails, stop and report — do not start coding on a broken baseline.

---

## Task 1: Bug #3 — Cancel/Reject modal buttons

**Files:**
- Modify: `components/dashboard/admin/AdminCitaDetalleModal.tsx` (footer buttons in `showCancelar` and `showRechazar` branches)
- Modify: `messages/es.json` (add keys under `Dashboard.admin.citas.calendario.modal`)
- Modify: `messages/en.json` (add same keys)

- [ ] **Step 1: Add i18n keys to `messages/es.json`**

Open `messages/es.json`. Find the block `"calendario": { ... "modal": { ... }` (around line 855). Inside the `modal` object, after the existing `"cancelar_ok": "Cita cancelada"` line, add:

```json
"no_regresar": "No, regresar",
"si_cancelar_cita": "Sí, cancelar cita",
"si_rechazar_cita": "Sí, rechazar cita",
```

Use Edit with the exact existing context:

```
"cancelar_ok": "Cita cancelada",
            "cargando": "Cargando...",
            "error_cargar": "No se pudo cargar el detalle de la cita"
```

Replace with:

```
"cancelar_ok": "Cita cancelada",
            "no_regresar": "No, regresar",
            "si_cancelar_cita": "Sí, cancelar cita",
            "si_rechazar_cita": "Sí, rechazar cita",
            "cargando": "Cargando...",
            "error_cargar": "No se pudo cargar el detalle de la cita"
```

- [ ] **Step 2: Add same keys to `messages/en.json`**

In the same path inside `messages/en.json`, add:

```json
"no_regresar": "No, go back",
"si_cancelar_cita": "Yes, cancel appointment",
"si_rechazar_cita": "Yes, reject appointment",
```

If the EN file lacks the equivalent `cancelar_ok` line, first locate the `modal` block under `Dashboard.admin.citas.calendario.modal` and insert the three new keys after `cancelar_ok` (or after any existing key in the modal — order does not matter for next-intl).

- [ ] **Step 3: Update the cancel branch in `AdminCitaDetalleModal.tsx`**

In `components/dashboard/admin/AdminCitaDetalleModal.tsx`, find the `isConfirmado && showCancelar` block (lines 363-385). Replace:

```tsx
            {isConfirmado && showCancelar && (
              <>
                <button
                  type="button"
                  onClick={() => { setShowCancelar(false); setMotivo(""); }}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {t("cancelar")}
                </button>
                <button
                  type="button"
                  onClick={handleCancelar}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {busy === "cancelar"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Ban className="w-4 h-4" />}
                  {t("cancelar")}
                </button>
              </>
            )}
```

With (only the two `t("cancelar")` call sites change to the new keys):

```tsx
            {isConfirmado && showCancelar && (
              <>
                <button
                  type="button"
                  onClick={() => { setShowCancelar(false); setMotivo(""); }}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {t("no_regresar")}
                </button>
                <button
                  type="button"
                  onClick={handleCancelar}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {busy === "cancelar"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Ban className="w-4 h-4" />}
                  {t("si_cancelar_cita")}
                </button>
              </>
            )}
```

- [ ] **Step 4: Update the reject branch in `AdminCitaDetalleModal.tsx`**

In the same file, find the `isPendiente && showRechazar` block (lines 327-349). Replace:

```tsx
            {isPendiente && showRechazar && (
              <>
                <button
                  type="button"
                  onClick={() => { setShowRechazar(false); setMotivo(""); }}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {t("cancelar")}
                </button>
                <button
                  type="button"
                  onClick={handleRechazar}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {busy === "rechazar"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <XCircle className="w-4 h-4" />}
                  {t("rechazar")}
                </button>
              </>
            )}
```

With:

```tsx
            {isPendiente && showRechazar && (
              <>
                <button
                  type="button"
                  onClick={() => { setShowRechazar(false); setMotivo(""); }}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {t("no_regresar")}
                </button>
                <button
                  type="button"
                  onClick={handleRechazar}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {busy === "rechazar"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <XCircle className="w-4 h-4" />}
                  {t("si_rechazar_cita")}
                </button>
              </>
            )}
```

- [ ] **Step 5: Type-check**

Run:
```bash
pnpm build
```
Expected: build passes. If `t("no_regresar")` complains about missing key, the JSON edit went wrong — re-check both message files.

- [ ] **Step 6: Manual smoke check (note for reviewer, don't block here)**

Document for PR description: Open `/es/dashboard/admin/citas` → click any confirmed cita on the calendar → click "Cancelar cita" in modal footer → verify the textarea appears and the footer now shows "No, regresar" + "Sí, cancelar cita". Repeat for a pending cita with "Rechazar".

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/admin/AdminCitaDetalleModal.tsx messages/es.json messages/en.json
git commit -m "fix(citas/admin): disambiguate cancel/reject modal footer buttons"
```

---

## Task 2: Bug #5 — Show ubicación on member CitaCard

**Files:**
- Modify: `components/dashboard/miembro/citas/CitaCard.tsx` (add a new block before the patient line; add `MapPin` import)

**Note:** `app/[locale]/(dashboard)/dashboard/citas/page.tsx` already selects `ubicacion:ubicaciones(nombre, direccion)` and `types.ts` already types `ubicacion: { nombre: string; direccion: string | null } | null`. No data-layer changes needed.

- [ ] **Step 1: Update the import line in `CitaCard.tsx`**

In `components/dashboard/miembro/citas/CitaCard.tsx`, find:

```tsx
import { CalendarDays, Clock, X, Loader2 } from "lucide-react";
```

Replace with:

```tsx
import { CalendarDays, Clock, MapPin, X, Loader2 } from "lucide-react";
```

- [ ] **Step 2: Insert the ubicación block between service and patient sections**

In the same file, find:

```tsx
      {/* Service */}
      {cita.servicio_asociado && (
        <p className="text-xs font-roboto text-neutral bg-gray-50 px-3 py-1.5 rounded-lg truncate">
          {cita.servicio_asociado}
        </p>
      )}

      {/* Patient (when not for self) */}
      {!cita.para_titular && cita.paciente_nombre && (
```

Replace with:

```tsx
      {/* Service */}
      {cita.servicio_asociado && (
        <p className="text-xs font-roboto text-neutral bg-gray-50 px-3 py-1.5 rounded-lg truncate">
          {cita.servicio_asociado}
        </p>
      )}

      {/* Ubicación */}
      {cita.ubicacion?.nombre && (
        <div className="flex items-start gap-1.5 text-neutral">
          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-secondary" />
          <div className="min-w-0">
            <p className="text-xs font-roboto font-medium text-gray-700 truncate">
              {cita.ubicacion.nombre}
            </p>
            {cita.ubicacion.direccion && (
              <p className="text-[11px] font-roboto text-gray-400 truncate">
                {cita.ubicacion.direccion}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Patient (when not for self) */}
      {!cita.para_titular && cita.paciente_nombre && (
```

- [ ] **Step 3: Type-check**

Run:
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 4: Manual smoke check (note for reviewer)**

Open `/es/dashboard/citas` → in "Próximas" section, verify each card shows the clinic name (and address below in lighter text if present).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/miembro/citas/CitaCard.tsx
git commit -m "feat(citas/miembro): show ubicación on CitaCard"
```

---

## Task 3: Bug #1 — Contratos-usage tab in admin user modal

**Files:**
- Create: `app/api/admin/usuarios/[id]/contratos-usage/route.ts`
- Create: `components/dashboard/admin/AdminUsuarioContratosUsage.tsx`
- Install: `components/ui/tabs.tsx` via shadcn CLI
- Modify: `components/dashboard/admin/AdminUsuarios.tsx` (wrap modal body in `<Tabs>`)
- Modify: `messages/es.json` and `messages/en.json`

### 3a — Install shadcn tabs component

- [ ] **Step 1: Install Tabs primitive**

The project's `components/ui/` directory does not currently contain `tabs.tsx`. Install via:

```bash
pnpm dlx shadcn@latest add tabs
```

Expected: creates `components/ui/tabs.tsx` and updates `package.json` with `@radix-ui/react-tabs`. If the CLI asks about overwrites, choose **no** for any non-tabs file.

- [ ] **Step 2: Confirm tabs.tsx exists**

Run:
```bash
ls components/ui/tabs.tsx
```
Expected: file exists.

- [ ] **Step 3: Commit the new primitive**

```bash
git add components/ui/tabs.tsx package.json pnpm-lock.yaml
git commit -m "chore(ui): add shadcn tabs primitive"
```

### 3b — Build the API route

- [ ] **Step 4: Create the route handler**

Create `app/api/admin/usuarios/[id]/contratos-usage/route.ts`:

```ts
/**
 * GET /api/admin/usuarios/[id]/contratos-usage
 *
 * Admin-only. Returns the per-contract usage for a member (cuota, used,
 * remaining) by calling RPC public.get_miembro_contrato_usage(user_id).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (me?.rol !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("get_miembro_contrato_usage", {
    p_user_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ usage: data ?? [] });
}
```

- [ ] **Step 5: Type-check**

Run:
```bash
pnpm build
```
Expected: passes. Next.js 16 requires `params` to be a Promise — already reflected above.

### 3c — Build the display component

- [ ] **Step 6: Create `AdminUsuarioContratosUsage.tsx`**

Create `components/dashboard/admin/AdminUsuarioContratosUsage.tsx`:

```tsx
"use client";

/**
 * AdminUsuarioContratosUsage — per-user contract usage panel rendered inside
 * the "Uso de citas" tab of EditarUsuarioAdminModal. Backed by RPC
 * get_miembro_contrato_usage via /api/admin/usuarios/[id]/contratos-usage.
 */

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Loader2, FileText } from "lucide-react";

interface UsageRow {
  contrato_id:       string;
  contrato_nombre:   string;
  cs_id:             string;
  servicio_nombre:   string;
  cuota_por_titular: number;
  familiares_count:  number;
  used:              number;
  remaining:         number;
  period_start:      string;
  tipo_reset:        "mensual" | "semanal" | "personalizado";
  dia_reset:         number;
}

interface Props {
  userId: string;
}

function barColor(used: number, total: number): string {
  if (total <= 0) return "bg-gray-200";
  const pct = used / total;
  if (pct >= 1)   return "bg-red-500";
  if (pct >= 0.7) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function AdminUsuarioContratosUsage({ userId }: Props) {
  const t      = useTranslations("Dashboard.admin.usuarios.contratosUsage");
  const locale = useLocale();
  const [items,   setItems]   = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/usuarios/${userId}/contratos-usage`,
          { cache: "no-store" },
        );
        const j = await res.json() as { usage?: UsageRow[]; error?: string };
        if (!res.ok) throw new Error(j.error ?? "Error");
        if (!cancelled) setItems(j.usage ?? []);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-500 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-600 font-roboto py-6 text-center">
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-10 space-y-2">
        <FileText className="w-10 h-10 text-gray-200" />
        <p className="text-sm font-roboto text-gray-400">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((row) => {
        const totalLabel = `${row.used} / ${row.cuota_por_titular}`;
        const pct = row.cuota_por_titular > 0
          ? Math.min(100, Math.round((row.used / row.cuota_por_titular) * 100))
          : 0;
        const periodFmt = new Date(row.period_start).toLocaleDateString(
          locale === "en" ? "en-US" : "es-NI",
          { year: "numeric", month: "short", day: "numeric", timeZone: "America/Managua" },
        );
        return (
          <div
            key={row.cs_id}
            className="rounded-xl border border-gray-100 bg-white p-4 space-y-2"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-poppins font-semibold text-gray-900 truncate">
                  {row.servicio_nombre}
                </p>
                <p className="text-xs font-roboto text-neutral truncate">
                  {row.contrato_nombre}
                </p>
              </div>
              <p className="text-sm font-roboto font-semibold text-gray-700 shrink-0">
                {totalLabel}
              </p>
            </div>

            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full ${barColor(row.used, row.cuota_por_titular)} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-roboto text-gray-400">
              <span>{t("remainingLabel", { count: row.remaining })}</span>
              <span>{t("periodLabel", { date: periodFmt })}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: Type-check**

Run:
```bash
pnpm build
```
Expected: passes. The component references i18n keys that don't exist yet — that's OK, next-intl will throw at runtime, not at build, and we add the keys in step 9.

### 3d — Add i18n keys

- [ ] **Step 8: Add keys to `messages/es.json`**

In `messages/es.json`, find the `"usuarios": {` block (around line 1026). Inside that object, after `"errorCargar": "..."` (just before `"emptyFilter"`), add:

```json
"tabInfo": "Información",
"tabUsoCitas": "Uso de citas",
"tabUsoNoAplica": "Sin empresa asignada — el uso por contrato solo aplica a miembros con empresa.",
"contratosUsage": {
  "loading": "Cargando uso de citas...",
  "empty": "Este usuario no tiene contratos activos.",
  "remainingLabel": "{count} restante(s)",
  "periodLabel": "Período desde {date}"
},
```

Use Edit with this exact pre-image:

```
"errorCargar": "No se pudieron cargar los usuarios.",
        "emptyFilter": "Sin resultados para los filtros actuales.",
```

And this post-image:

```
"errorCargar": "No se pudieron cargar los usuarios.",
        "tabInfo": "Información",
        "tabUsoCitas": "Uso de citas",
        "tabUsoNoAplica": "Sin empresa asignada — el uso por contrato solo aplica a miembros con empresa.",
        "contratosUsage": {
          "loading": "Cargando uso de citas...",
          "empty": "Este usuario no tiene contratos activos.",
          "remainingLabel": "{count} restante(s)",
          "periodLabel": "Período desde {date}"
        },
        "emptyFilter": "Sin resultados para los filtros actuales.",
```

- [ ] **Step 9: Add keys to `messages/en.json`**

In `messages/en.json`, find the equivalent `"usuarios"` block under `Dashboard.admin.usuarios` and insert the same keys in English. If the file structure differs, just insert anywhere inside the `usuarios` object — order does not affect next-intl.

```json
"tabInfo": "Information",
"tabUsoCitas": "Appointment usage",
"tabUsoNoAplica": "No assigned company — per-contract usage only applies to members with a company.",
"contratosUsage": {
  "loading": "Loading appointment usage...",
  "empty": "This user has no active contracts.",
  "remainingLabel": "{count} remaining",
  "periodLabel": "Period from {date}"
}
```

### 3e — Wire tabs into the modal

- [ ] **Step 10: Add imports in `AdminUsuarios.tsx`**

In `components/dashboard/admin/AdminUsuarios.tsx`, find the existing imports block (top of file). Add these two imports (place near the other `@/components/ui` imports):

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminUsuarioContratosUsage from "./AdminUsuarioContratosUsage";
```

- [ ] **Step 11: Wrap modal body in Tabs**

In the same file, find the modal body section that starts around line 204:

```tsx
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Auth email note */}
          <div className="flex gap-2 p-3 bg-blue-50 rounded-xl text-xs text-blue-700 font-roboto">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t("authEmailNote")}</span>
          </div>
```

Locate the closing `</div>` of the `px-6 py-5 space-y-4` wrapper (find the next sibling element — the dialog footer). The body wrapper closes right before `<DialogFooter>` or the next `<DialogHeader>`/`</DialogContent>`. Read the file from line 204 onward to confirm the exact closing tag location.

Replace the entire `<div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">…</div>` body with:

```tsx
        <div className="px-6 pt-3 pb-5 max-h-[70vh] overflow-y-auto">
          <Tabs defaultValue="info">
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="info">{t("tabInfo")}</TabsTrigger>
              <TabsTrigger
                value="uso"
                disabled={!usuario?.empresa_id}
              >
                {t("tabUsoCitas")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4">
              {/* Auth email note */}
              <div className="flex gap-2 p-3 bg-blue-50 rounded-xl text-xs text-blue-700 font-roboto">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t("authEmailNote")}</span>
              </div>

              {/* …keep all the existing content that used to live in this body, exactly as it was… */}

            </TabsContent>

            <TabsContent value="uso">
              {usuario?.empresa_id && usuario?.id ? (
                <AdminUsuarioContratosUsage userId={usuario.id} />
              ) : (
                <p className="text-sm text-gray-400 font-roboto py-6 text-center">
                  {t("tabUsoNoAplica")}
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
```

**Important:** keep ALL existing body content (warnings, fields grid, etc.) intact inside `<TabsContent value="info">`. Do not lose the `isAdmin` warning, the `empresaChanged` warning, the fields grid, or anything that was already there. The replacement is purely structural — wrap the old content in a tab and add the new tab. If the body is long, do the change in two Edits: first add the `<Tabs>` opening with the info tab, then add the `</Tabs>` closing plus the uso tab.

- [ ] **Step 12: Type-check**

Run:
```bash
pnpm build
```
Expected: passes. If you see errors about missing `Tabs` exports, re-check step 1 — `components/ui/tabs.tsx` must exist and export `Tabs, TabsContent, TabsList, TabsTrigger`.

- [ ] **Step 13: Manual smoke check (note for reviewer)**

Open `/es/dashboard/admin/usuarios` → click "Editar" on a miembro with empresa → modal shows two tabs ("Información" / "Uso de citas") → click "Uso de citas" → see the per-contract progress bars or the empty state. Click "Editar" on an admin user → "Uso de citas" tab is disabled.

- [ ] **Step 14: Commit**

```bash
git add app/api/admin/usuarios components/dashboard/admin/AdminUsuarioContratosUsage.tsx components/dashboard/admin/AdminUsuarios.tsx messages/es.json messages/en.json
git commit -m "feat(admin/usuarios): add contratos usage tab to user detail modal"
```

---

## Task 4: Bug #2 — Merge notifications + avisos into one bell

**Files:**
- Create: `components/dashboard/CampanaUnificada.tsx`
- Modify: `components/dashboard/Topbar.tsx` (replace two components with one)
- Delete: `components/dashboard/TopbarAvisosPopover.tsx`
- Delete: `components/dashboard/NotificacionesCampana.tsx`
- Modify: `messages/es.json`, `messages/en.json`

**Note on grep:** Before deleting, run a grep to confirm no other file imports the two old components — we expect only `Topbar.tsx` does, per earlier check.

### 4a — Add i18n keys

- [ ] **Step 1: Add unified-bell keys to `messages/es.json`**

In `messages/es.json`, find the `"topbar"` block (around line 140):

```json
    "topbar": {
      "notifications": "Notificaciones",
      "goToSOS": "Ir a SOS Medical",
      "refresh": "Actualizar",
      "avisos": {
        "titulo": "Avisos",
        "empty": "Sin avisos activos",
        "verTodos": "Ver todos los avisos"
      }
    },
```

Replace with:

```json
    "topbar": {
      "notifications": "Notificaciones",
      "goToSOS": "Ir a SOS Medical",
      "refresh": "Actualizar",
      "avisos": {
        "titulo": "Avisos",
        "empty": "Sin avisos activos",
        "verTodos": "Ver todos los avisos"
      },
      "campana": {
        "ariaLabel": "Notificaciones y avisos",
        "title": "Notificaciones y avisos",
        "pillNotificacion": "Notif.",
        "pillAviso": "Aviso",
        "empty": "Sin novedades por ahora.",
        "verNotificaciones": "Ver notificaciones",
        "verAvisos": "Ver avisos"
      }
    },
```

- [ ] **Step 2: Mirror the same keys in `messages/en.json`**

Add the equivalent under `topbar`:

```json
"campana": {
  "ariaLabel": "Notifications and announcements",
  "title": "Notifications & Announcements",
  "pillNotificacion": "Notif.",
  "pillAviso": "Announce",
  "empty": "Nothing new for now.",
  "verNotificaciones": "View notifications",
  "verAvisos": "View announcements"
}
```

### 4b — Create the unified component

- [ ] **Step 3: Create `CampanaUnificada.tsx`**

Create `components/dashboard/CampanaUnificada.tsx`:

```tsx
"use client";

/**
 * CampanaUnificada — single bell in the Topbar that combines unread
 * notificaciones and active avisos in a single chronological list.
 *
 * Replaces the previous pair (NotificacionesCampana + TopbarAvisosPopover).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Bell, Megaphone, BellRing, ImageIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type NotifRow = {
  id:         string;
  tipo:       string;
  titulo:     string;
  mensaje:    string;
  link:       string | null;
  leida:      boolean;
  created_at: string;
};

type AvisoRow = {
  id:              string;
  titulo:          string;
  descripcion:     string | null;
  aviso_image_url: string | null;
  created_at:      string;
};

type FeedItem =
  | { kind: "notif";  data: NotifRow }
  | { kind: "aviso"; data: AvisoRow };

export default function CampanaUnificada() {
  const t      = useTranslations("Dashboard.topbar.campana");
  const locale = useLocale();
  const [open,   setOpen]   = useState(false);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [avisos, setAvisos] = useState<AvisoRow[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const [notifRes, avisoRes] = await Promise.all([
        fetch("/api/notificaciones").then((r) => r.json() as Promise<{ notificaciones?: NotifRow[] }>),
        supabase
          .from("avisos")
          .select("id, titulo, descripcion, aviso_image_url, created_at")
          .eq("estado_aviso", "activa")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      setNotifs(notifRes.notificaciones ?? []);
      setAvisos((avisoRes.data ?? []) as AvisoRow[]);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime subscriptions
  useEffect(() => {
    const supabase = createClient();
    const chNotif = supabase
      .channel("campana-notif")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones" },
        () => { void load(); },
      )
      .subscribe();
    const chAviso = supabase
      .channel("campana-aviso")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "avisos" },
        () => { void load(); },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(chNotif);
      void supabase.removeChannel(chAviso);
    };
  }, [load]);

  // Outside-click close
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unreadNotifs = notifs.filter((n) => !n.leida).length;
  const unreadAvisos = avisos.length;

  function markOne(id: string) {
    void fetch("/api/notificaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).then(() => load());
  }

  // Merge & sort
  const feed: FeedItem[] = [
    ...notifs.map((n) => ({ kind: "notif" as const, data: n })),
    ...avisos.map((a) => ({ kind: "aviso" as const, data: a })),
  ].sort((a, b) => b.data.created_at.localeCompare(a.data.created_at));

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("ariaLabel")}
        className="relative p-2 rounded-xl text-neutral hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {/* Two stacked badges, side by side at top-right */}
        {(unreadNotifs > 0 || unreadAvisos > 0) && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center gap-0.5">
            {unreadNotifs > 0 && (
              <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
                {unreadNotifs > 9 ? "9+" : unreadNotifs}
              </span>
            )}
            {unreadAvisos > 0 && (
              <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-secondary text-white text-[9px] font-bold flex items-center justify-center">
                {unreadAvisos > 9 ? "9+" : unreadAvisos}
              </span>
            )}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-poppins font-semibold text-gray-900">{t("title")}</span>
          </div>

          {feed.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral">{t("empty")}</p>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
              {feed.map((item) => item.kind === "notif" ? (
                <Link
                  key={`n-${item.data.id}`}
                  href={item.data.link ? `/${locale}${item.data.link}` : `/${locale}/dashboard`}
                  onClick={() => { setOpen(false); markOne(item.data.id); }}
                  className={`block px-4 py-3 hover:bg-gray-50 transition-colors ${!item.data.leida ? "bg-blue-50/30" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      <BellRing className="w-3 h-3" />
                      {t("pillNotificacion")}
                    </span>
                    <span className="text-[10px] text-neutral">
                      {new Date(item.data.created_at).toLocaleString(locale === "en" ? "en-US" : "es-NI", { timeZone: "America/Managua" })}
                    </span>
                  </div>
                  <p className="text-sm font-semibold">{item.data.titulo}</p>
                  <p className="text-xs text-neutral line-clamp-2">{item.data.mensaje}</p>
                </Link>
              ) : (
                <Link
                  key={`a-${item.data.id}`}
                  href={`/${locale}/dashboard/avisos`}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-secondary bg-secondary/10 px-1.5 py-0.5 rounded-full">
                      <Megaphone className="w-3 h-3" />
                      {t("pillAviso")}
                    </span>
                    <span className="text-[10px] text-neutral">
                      {new Date(item.data.created_at).toLocaleString(locale === "en" ? "en-US" : "es-NI", { timeZone: "America/Managua" })}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    {item.data.aviso_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.data.aviso_image_url}
                        alt=""
                        className="w-8 h-8 rounded-lg object-cover shrink-0 border border-gray-100"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                        <ImageIcon className="w-4 h-4 text-rose-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{item.data.titulo}</p>
                      {item.data.descripcion && (
                        <p className="text-xs text-neutral line-clamp-2">{item.data.descripcion}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between gap-3 text-xs">
            <Link
              href={`/${locale}/dashboard/avisos`}
              onClick={() => setOpen(false)}
              className="font-medium text-secondary hover:text-secondary/80 font-roboto transition-colors"
            >
              {t("verAvisos")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 4c — Wire into Topbar

- [ ] **Step 4: Update `Topbar.tsx`**

In `components/dashboard/Topbar.tsx`, replace the import lines:

```tsx
import NotificacionesCampana from "./NotificacionesCampana";
import TopbarAvisosPopover from "./TopbarAvisosPopover";
```

With:

```tsx
import CampanaUnificada from "./CampanaUnificada";
```

In the same file, replace:

```tsx
        <NotificacionesCampana />

        <TopbarAvisosPopover />
```

With:

```tsx
        <CampanaUnificada />
```

- [ ] **Step 5: Delete the two old components**

```bash
rm components/dashboard/NotificacionesCampana.tsx components/dashboard/TopbarAvisosPopover.tsx
```

- [ ] **Step 6: Confirm no other imports remain**

Run:
```bash
grep -rn "NotificacionesCampana\|TopbarAvisosPopover" app/ components/
```
Expected: no results.

- [ ] **Step 7: Type-check**

Run:
```bash
pnpm build
```
Expected: passes. Any error here likely means a stray import — `grep` again to find it.

- [ ] **Step 8: Manual smoke check (note for reviewer)**

Open the dashboard with notificaciones unread + avisos active → topbar shows ONE bell with two small badges (red for notifs, blue for avisos). Click → unified list with pills. Click a notif → navigates and marks read. Click an aviso → navigates to `/dashboard/avisos`.

- [ ] **Step 9: Commit**

```bash
git add components/dashboard/CampanaUnificada.tsx components/dashboard/Topbar.tsx messages/es.json messages/en.json
git add -u components/dashboard/   # picks up the two deletions
git commit -m "refactor(topbar): merge notificaciones + avisos into single CampanaUnificada"
```

---

## Task 5: Bug #4 — Patient-busy check in `crear_cita_atomic`

**Files:**
- Create: `supabase/migrations/20260527120000_citas_patient_busy_check.sql`
- Modify: `lib/citas/errors.ts` (add `PATIENT_BUSY` mapping)
- Modify: `messages/es.json` (add `Errors.citas.patient_busy`)
- Modify: `messages/en.json`

### 5a — Add the error mapping client-side

- [ ] **Step 1: Update `lib/citas/errors.ts`**

In `lib/citas/errors.ts`, find the type definition:

```ts
export type CitaErrorCode =
  | "SLOT_TAKEN"
  | "SLOT_OUT_OF_HOURS"
  | "SLOT_IN_EXCEPTION"
  | "QUOTA_EXCEEDED"
```

Replace with:

```ts
export type CitaErrorCode =
  | "SLOT_TAKEN"
  | "PATIENT_BUSY"
  | "SLOT_OUT_OF_HOURS"
  | "SLOT_IN_EXCEPTION"
  | "QUOTA_EXCEEDED"
```

Then in the same file find the `MAPPING` constant. Replace:

```ts
const MAPPING: Record<CitaErrorCode, CitaErrorMapping> = {
  SLOT_TAKEN:                        { status: 409, i18nKey: "Errors.citas.slot_taken" },
  SLOT_OUT_OF_HOURS:                 { status: 422, i18nKey: "Errors.citas.slot_out_of_hours" },
```

With:

```ts
const MAPPING: Record<CitaErrorCode, CitaErrorMapping> = {
  SLOT_TAKEN:                        { status: 409, i18nKey: "Errors.citas.slot_taken" },
  PATIENT_BUSY:                      { status: 409, i18nKey: "Errors.citas.patient_busy" },
  SLOT_OUT_OF_HOURS:                 { status: 422, i18nKey: "Errors.citas.slot_out_of_hours" },
```

- [ ] **Step 2: Type-check**

Run:
```bash
pnpm build
```
Expected: passes.

### 5b — Add the i18n key

- [ ] **Step 3: Add key to `messages/es.json`**

In `messages/es.json`, find the `Errors.citas` block (around line 1617):

```json
      "slot_taken": "Ese horario ya fue reservado. Por favor elige otro.",
```

Replace with:

```json
      "slot_taken": "Ese horario ya fue reservado. Por favor elige otro.",
      "patient_busy": "Ya tienes otra cita agendada que se traslapa con este horario. Cancela la cita existente antes de agendar otra.",
```

- [ ] **Step 4: Add key to `messages/en.json`**

In the equivalent `Errors.citas` block of `messages/en.json`, add:

```json
"patient_busy": "You already have another appointment that overlaps with this time. Cancel the existing appointment before booking another.",
```

### 5c — Write the migration

- [ ] **Step 5: Create the migration file**

Create `supabase/migrations/20260527120000_citas_patient_busy_check.sql`.

The migration must do a `CREATE OR REPLACE FUNCTION public.crear_cita_atomic` with the **same signature** as the existing one (in `20260522000600_citas_native_rpc_crear_cita.sql`), with two new advisory-lock + EXISTS blocks added immediately after the existing `SLOT_TAKEN` check. Copy the body of the existing function verbatim and insert the new logic at the right place. Full file content:

```sql
-- Migración: añade validación de "paciente ocupado" en crear_cita_atomic.
-- Una misma persona física (titular o un familiar identificado por cédula)
-- no puede tener dos citas que se traslapen en el tiempo, aunque sean con
-- doctores o en ubicaciones distintas.

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

  -- ── NEW: Patient-busy check ───────────────────────────────────────────────
  -- Una misma persona física no puede tener dos citas que se traslapen en
  -- tiempo, aunque sean con doctores distintos o en ubicaciones distintas.
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
  -- ── END NEW ───────────────────────────────────────────────────────────────

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

COMMIT;
```

- [ ] **Step 6: Apply the migration**

This deploys to the linked Supabase project. Confirm with the user that they're OK pushing before running this step — it's a remote change.

```bash
supabase db push
```

Expected: prints `Applying migration 20260527120000_citas_patient_busy_check.sql...` and exits 0.

- [ ] **Step 7: Manual smoke check (note for reviewer)**

1. Log in as a member.
2. Schedule a cita with Doctor A on Monday 8:00am — confirm it appears in "Mis Citas".
3. Try to schedule another cita with Doctor B on Monday 8:00am (same patient = titular). Expect a toast: "Ya tienes otra cita agendada que se traslapa con este horario..." and the wizard stays on the confirm step.
4. Switch the wizard to "para_titular = false" with a different family member's cédula. Expect the booking to succeed (familiar is a different physical person).
5. Try again with the SAME family member's cédula and an overlapping time — expect the same `patient_busy` toast.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260527120000_citas_patient_busy_check.sql lib/citas/errors.ts messages/es.json messages/en.json
git commit -m "fix(citas): prevent double-booking the same patient across doctors"
```

---

## Task 6: Final verification

- [ ] **Step 1: Confirm clean working tree**

Run:
```bash
git status
```
Expected: clean working tree.

- [ ] **Step 2: Confirm full commit history on the branch**

Run:
```bash
git log --oneline main..HEAD
```
Expected: 6-7 commits (spec + chore tabs + 5 fix commits). Each fix commit message starts with `fix(...)` / `feat(...)` / `refactor(...)`.

- [ ] **Step 3: Final build**

Run:
```bash
pnpm build && pnpm lint
```
Expected: both pass.

- [ ] **Step 4: Push the branch**

Confirm with the user before pushing.

```bash
git push -u origin fix/bug-sprint-mayo-2026
```

- [ ] **Step 5: Prepare PR (do not open until user OK)**

Suggested PR title: `fix(bug-sprint): 5 reported bugs/improvements`

Suggested PR body covers each of the 5 items with a one-liner and the manual-test instructions from Tasks 1.6, 2.4, 3.13, 4.8, 5.7.

---

## Self-review notes

- **Spec coverage:**
  - #1 → Tasks 3a-3e
  - #2 → Task 4
  - #3 → Task 1
  - #4 → Task 5
  - #5 → Task 2
  - "Verify MisCitas query has ubicación" → already true (see `app/[locale]/(dashboard)/dashboard/citas/page.tsx`), called out in Task 2 prelude.
- **No placeholders:** all code blocks contain real code; SQL migration is the full function body (not "see existing file"); i18n inserts show the exact pre/post.
- **Type consistency:** new `CitaErrorCode` value `PATIENT_BUSY` is added to both the union and the `MAPPING`. Component `AdminUsuarioContratosUsage` consumes RPC fields (`cuota_por_titular`, `used`, `remaining`, `period_start`, `tipo_reset`, `dia_reset`) that match the JSONB shape produced by `get_miembro_contrato_usage` in `supabase/migrations/20260428210000_subscription_citas_rpcs.sql`.
- **Open issues:** none.
