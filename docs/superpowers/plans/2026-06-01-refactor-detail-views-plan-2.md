# Refactor detail views — Plan 2 (9 remaining resources + cleanup)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the parallel-route + split-pane pattern validated in Plan 1 (`admin/usuarios`) to the remaining 9 list-based resources across admin, empresa, and miembro roles. Replace every detail-and-form modal with a dedicated route. Wire calendar views to navigate to detail routes instead of opening modals. Cleanup legacy modal files at the end.

**Architecture:** Each resource gets a `layout.tsx` + `_split-pane-client.tsx` + `@list/page.tsx` + `@detail/default.tsx` plus `@detail/[id]/page.tsx`, `@detail/[id]/editar/page.tsx`, and `@detail/nuevo/page.tsx` where applicable. Forms use Server Actions with `revalidatePath` + `redirect`. The pattern from Plan 1 is the canonical reference — see `app/[locale]/(dashboard)/dashboard/admin/usuarios/` for the working template.

**Tech Stack:** Next.js 16 App Router, React 19 (`useActionState`), TypeScript, Tailwind v4, Supabase, next-intl, sonner, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-01-refactor-detail-views-design.md`
**Plan 1 (reference):** `docs/superpowers/plans/2026-06-01-refactor-detail-views-plan-1.md`
**Branch:** `refactor/detail-views-and-fixes` (continue committing here; PR created at the end)

**Note on testing:** no test suite exists. Verification per task uses `pnpm build`, `pnpm lint`, manual UI checks.

---

## The canonical pattern (read once, apply N times)

For every resource `<resource>` under a role base (`admin/`, `empresa/`, or `dashboard/`), do the following 4 steps. Each step is one commit.

### Step P1 — Scaffold parallel routes

Files (replace `<base>` with the role base, e.g. `admin`, `empresa`, or empty for miembro under `dashboard/`):

- DELETE: `app/[locale]/(dashboard)/dashboard/<base>/<resource>/page.tsx`
- CREATE: `app/[locale]/(dashboard)/dashboard/<base>/<resource>/layout.tsx`
- CREATE: `app/[locale]/(dashboard)/dashboard/<base>/<resource>/_split-pane-client.tsx`
- CREATE: `app/[locale]/(dashboard)/dashboard/<base>/<resource>/@list/page.tsx`
- CREATE: `app/[locale]/(dashboard)/dashboard/<base>/<resource>/@detail/default.tsx`

`layout.tsx` (server, role gate):
```tsx
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import SplitPaneClient from "./_split-pane-client";

interface Props { list: React.ReactNode; detail: React.ReactNode; }

export default async function ResourceLayout({ list, detail }: Props) {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "<ROLE>") redirect(`/${locale}/dashboard`);

  return <SplitPaneClient list={list} detail={detail} />;
}
```
Use `"admin"` for admin resources, `"empresa_admin"` for empresa resources. For miembro resources (under `dashboard/<resource>`, no role gate other than authenticated), skip the rol check.

`_split-pane-client.tsx` (client, identical for every resource):
```tsx
"use client";
import { useSelectedLayoutSegment } from "next/navigation";
import SplitPaneLayout from "@/components/dashboard/shared/SplitPaneLayout";
import type { ReactNode } from "react";

export default function SplitPaneClient({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  const seg = useSelectedLayoutSegment("detail");
  return <SplitPaneLayout list={list} detail={detail} detailActive={seg !== null} />;
}
```

`@list/page.tsx` (server, role gate optional since layout already gates):
```tsx
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import <ListComponent> from "@/components/dashboard/<base>/<ListComponent>";

export default async function ListPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  return <<ListComponent> userId={user.id} />;
}
```

`@detail/default.tsx`:
```tsx
import DetailEmptyState from "@/components/dashboard/shared/DetailEmptyState";
export default function ResourceDetailDefault() { return <DetailEmptyState />; }
```

Commit: `refactor(<base>/<resource>): scaffold parallel routes + split-pane layout`

### Step P2 — Adapt list rows / cards to navigate

Open the existing list component. Apply the same diff pattern as `AdminUsuarios.tsx`:

1. Add imports: `useRouter`, `useParams` from `next/navigation`; `Link` from `next/link`; `useLocale` from `next-intl` (if not already).
2. Inside the component: `const router = useRouter(); const params = useParams<{ id?: string }>(); const activeId = params?.id ?? null; const locale = useLocale();`
3. For each row (`<tr>`), add `onClick={() => router.push(`/${locale}/dashboard/<base>/<resource>/${row.id}`)}` plus `data-active={row.id === activeId ? "true" : undefined}` and class `cursor-pointer hover:bg-gray-50/60 data-[active=true]:bg-primary/5 data-[active=true]:border-l-2 data-[active=true]:border-primary`.
4. For the actions cell (`<td>` containing edit/delete buttons), add `onClick={(e) => e.stopPropagation()}` to prevent the row click. Convert "edit" buttons to `<Link href="/[id]/editar">`. Toggle/delete buttons keep their existing handlers but remain inside the stopPropagation cell.
5. For "create new" buttons (existing `openCreate` flows), convert to `<Link href="/[id parent]/nuevo">`.
6. Remove `useState` and JSX for the now-redundant form modal trigger (`setEditing`, `setFormOpen`, `<FormModal open=... />`). Keep `<FormModal>` IMPORT until the form route in P4 exists, then remove the import + the modal file in cleanup.

Commit: `refactor(<base>/<resource>): rows navigate to /[id]; modal triggers removed`

For card-based lists (BeneficiosGrid, MisAvisos, MisDocumentos), the same idea: wrap each card in `<Link href="/...">` instead of opening a modal.

### Step P3 — `@detail/[id]/page.tsx` (read panel)

Create the file using `DetailPanel` + `BackButton`. Mirror the fields shown by the legacy detail/edit modal. For resources that didn't have a detail modal, design a sensible read view from the row data plus any joined tables the list already fetches.

Template:
```tsx
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function ResourceDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.<base>.<resource>.detalle");

  const { data: row, error } = await supabase
    .from("<table>")
    .select("<fields>")
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/<base>/<resource>`);
  if (!row) notFound();

  return (
    <>
      <BackButton href={`/${locale}/dashboard/<base>/<resource>`} />
      <DetailPanel
        title={row.<title-field> ?? t("untitled")}
        closeHref={`/${locale}/dashboard/<base>/<resource>`}
        actions={
          <Link
            href={`/${locale}/dashboard/<base>/<resource>/${id}/editar`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary/80 px-3 py-1.5 rounded-full bg-secondary/5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("editar")}
          </Link>
        }
      >
        {/* Fields rendered as <dl> rows; reuse <Field> helper from admin/usuarios */}
      </DetailPanel>
    </>
  );
}
```

Add `Dashboard.<base>.<resource>.detalle` keys to `messages/es.json` AND `messages/en.json`. Always add both files in the same commit.

Commit: `feat(<base>/<resource>): @detail/[id] read panel`

### Step P4 — `@detail/[id]/editar/` and `@detail/nuevo/` forms

For each create/edit form:
- `actions.ts` — Server Action that reads form fields, validates, calls `supabase.from(...).update()` or `.insert()`, then `revalidatePath` + `redirect`.
- `page.tsx` — server component that fetches row + any reference data (e.g., empresas for a user form), renders `DetailPanel` + `<XxxForm>`.
- `XxxForm.tsx` — client component using `useActionState`.

Use the working pattern from `app/[locale]/(dashboard)/dashboard/admin/usuarios/@detail/[id]/editar/` as the template. Adapt field names to the resource.

Important rules for form fields:
- Reproduce ALL fields the legacy modal allowed editing — no regressions. Verify by reading the legacy modal source before removing it.
- Required fields use HTML5 `required` attribute on the input AND a server-side check in the action.
- Boolean toggles use `<input type="checkbox" name="..." value="true">` and parse in the action with `formData.get("...") === "true"`.
- Foreign-key selects (e.g., `empresa_id`) follow the `<option value="">— Sin X —</option>` pattern that maps empty string to `null` in the action.

Add `Dashboard.<base>.<resource>.editar` and `Dashboard.<base>.<resource>.nuevo` i18n keys to both message files.

Commit: `feat(<base>/<resource>): @detail/[id]/editar and @detail/nuevo with Server Actions`

After this step, the legacy form modal file (`XxxFormModal.tsx`) and any legacy detail modal (`XxxDetailModal.tsx`) are unused. Delete them in the cleanup phase (Phase J) — don't delete inline to avoid breaking intermediate builds if the modal is still referenced elsewhere.

---

## Phase A — admin/empresas

The `EmpresaFormModal` is inline in `components/dashboard/admin/AdminEmpresas.tsx`. Form fields (read from the existing component):
- `nombre` (required), `codigo_empresa` (auto-generated, regen button), `notas`, `auto_confirmar_citas` (bool), `estado` (`activa`/`inactiva`), `ruc`, `direccion_calle`, `departamento`.

The list has a "Send invitation email" CTA — preserve that as a separate button in the detail panel (it's not part of edit, it's an action).

### Task A1: Scaffold parallel routes for admin/empresas

**Files:**
- Delete: `app/[locale]/(dashboard)/dashboard/admin/empresas/page.tsx`
- Create: `app/[locale]/(dashboard)/dashboard/admin/empresas/layout.tsx`
- Create: `app/[locale]/(dashboard)/dashboard/admin/empresas/_split-pane-client.tsx`
- Create: `app/[locale]/(dashboard)/dashboard/admin/empresas/@list/page.tsx`
- Create: `app/[locale]/(dashboard)/dashboard/admin/empresas/@detail/default.tsx`

- [ ] Apply the Step P1 templates. Use `"admin"` for the rol gate. The list component is `AdminEmpresas` from `@/components/dashboard/admin/AdminEmpresas`. It takes no `userId` prop today — confirm by reading the file and adjust the `<AdminEmpresas />` call.
- [ ] `pnpm build` passes.
- [ ] Commit: `refactor(admin/empresas): scaffold parallel routes + split-pane layout`

### Task A2: Adapt AdminEmpresas rows + remove form modal trigger

**Files:**
- Modify: `components/dashboard/admin/AdminEmpresas.tsx`

- [ ] Apply Step P2. Each row in the empresas table navigates to `/admin/empresas/[id]`. Replace the existing "edit" pencil button with a `<Link>` to `/admin/empresas/[id]/editar`. Replace "Nueva empresa" button with `<Link href="/admin/empresas/nuevo">`.
- [ ] Remove the inline `EmpresaFormModal` function definition AND its state (`setEditing`, `setFormOpen`, etc.) AND the JSX render block. Do NOT delete the file (it's the same file as `AdminEmpresas`); just delete those lines.
- [ ] Confirm the "send invitation email" button still works — it's separate from the form modal.
- [ ] `pnpm build` passes.
- [ ] Commit: `refactor(admin/empresas): rows navigate to /[id]; inline form modal removed`

### Task A3: Empresas detail panel

**Files:**
- Create: `app/[locale]/(dashboard)/dashboard/admin/empresas/@detail/[id]/page.tsx`

Detail panel shows: `nombre`, `codigo_empresa` (with copy button), `estado` (badge), `auto_confirmar_citas` (Sí/No), `ruc`, `direccion_calle`, `departamento`, `notas`, `created_at`, plus counts of associated users (run a separate count query). Include a "Reenviar invitación" button (uses the existing endpoint the original modal used — `grep -n "handleSendEmail\|sendInvitation" components/dashboard/admin/AdminEmpresas.tsx` to find the path).

- [ ] Apply Step P3 template. Add the "Reenviar invitación" CTA in the `actions` slot alongside "Editar".
- [ ] Add `Dashboard.admin.empresas.detalle` i18n keys to es.json + en.json (`untitled`, `editar`, `codigo`, `estado`, `autoConfirma`, `ruc`, `direccion`, `departamento`, `notas`, `creado`, `usuariosCount`, `reenviarInvitacion`).
- [ ] `pnpm build` passes.
- [ ] Commit: `feat(admin/empresas): @detail/[id] read panel with copy + reinvite actions`

### Task A4: Empresas editar + nuevo forms

**Files:**
- Create: `app/[locale]/(dashboard)/dashboard/admin/empresas/@detail/[id]/editar/{actions.ts,page.tsx,EmpresaForm.tsx}`
- Create: `app/[locale]/(dashboard)/dashboard/admin/empresas/@detail/nuevo/{actions.ts,page.tsx}` (reuses the same `EmpresaForm` from the editar folder via relative import)

Form fields: same 8 fields the inline modal had. `codigo_empresa` is editable but optional — the action calls the existing regen RPC if empty. `auto_confirmar_citas` is a checkbox.

- [ ] `actions.ts` exports two actions: `actualizarEmpresaAction` and `crearEmpresaAction`. Both validate `nombre` non-empty, then `update`/`insert` the row. Insert returns the new id so `crearEmpresaAction` can redirect to `/[newId]`.
- [ ] Share the form component between editar and nuevo: place `EmpresaForm.tsx` under `@detail/_components/EmpresaForm.tsx` and import from both pages. Underscore folders are NOT routes in App Router — confirm with `pnpm build`.
- [ ] Add `Dashboard.admin.empresas.editar` and `Dashboard.admin.empresas.nuevo` keys to both message files.
- [ ] `pnpm build` passes.
- [ ] Manually verify: load `/admin/empresas/nuevo`, submit, redirects to `/admin/empresas/<newId>`. Load `/admin/empresas/<id>/editar`, modify a field, submit, returns to detail with updated value.
- [ ] Commit: `feat(admin/empresas): editar + nuevo forms with Server Actions`

---

## Phase B — admin/doctores

`AdminDoctores` already has a `/admin/doctores/[id]/page.tsx` (existing detail page that pre-dates this refactor). Convert that existing page into the `@detail/[id]/page.tsx` of the parallel-route structure, and the form modal `AdminDoctorFormModal` to editar+nuevo routes.

### Task B1: Scaffold parallel routes for admin/doctores

**Files:**
- Move existing `app/[locale]/(dashboard)/dashboard/admin/doctores/[id]/page.tsx` to `app/[locale]/(dashboard)/dashboard/admin/doctores/@detail/[id]/page.tsx` (use `git mv`).
- Delete existing top-level `app/[locale]/(dashboard)/dashboard/admin/doctores/page.tsx`.
- Create: `layout.tsx`, `_split-pane-client.tsx`, `@list/page.tsx`, `@detail/default.tsx` per Step P1.

- [ ] Read the existing `[id]/page.tsx` to understand what it renders. It uses `AdminDoctorDetalle` which is already a panel-style component with tabs. Inside `@detail/[id]/page.tsx` after the move, wrap the existing content with `BackButton` + `DetailPanel` (or skip `DetailPanel` if the existing component already has its own card shell — verify).
- [ ] `pnpm build` passes.
- [ ] Commit: `refactor(admin/doctores): move /[id] under @detail parallel route + scaffold`

### Task B2: Adapt AdminDoctores rows + remove form modal trigger

**Files:**
- Modify: `components/dashboard/admin/AdminDoctores.tsx`

- [ ] Existing rows already have an `onClick={() => goDetail(d)}` for the eye icon — convert `goDetail` to `router.push(\`/${locale}/dashboard/admin/doctores/${d.id}\`)` if it isn't already. Also add row-level click navigation as in the canonical pattern.
- [ ] Pencil "Editar" button → `<Link href="/[id]/editar">`.
- [ ] "Crear" button → `<Link href="/nuevo">`.
- [ ] Remove `<AdminDoctorFormModal />` JSX + import + state.
- [ ] `pnpm build` passes.
- [ ] Commit: `refactor(admin/doctores): rows navigate; form modal trigger removed`

### Task B3: Doctores editar + nuevo forms

**Files:**
- Create: `@detail/[id]/editar/{actions.ts,page.tsx,DoctorForm.tsx}` (and `@detail/nuevo/...` reusing the form via `_components/`)

Fields (read from `AdminDoctorFormModal.tsx` first): `nombre`, `correo`, `telefono`, `especialidad`, `activo` (bool), `ubicacion_id` (FK select), plus the `doctor_servicios` pivote — services this doctor offers (multi-select). The services pivote is a separate INSERT/DELETE in the action.

- [ ] Build the action carefully: for editar, diff the new vs old service set and apply minimal mutations (delete removed, insert added). For nuevo, insert the doctor row first to get the id, then insert pivote rows.
- [ ] Add `Dashboard.admin.doctores.editar` and `Dashboard.admin.doctores.nuevo` i18n keys.
- [ ] `pnpm build` passes; manual verify create + edit flows.
- [ ] Commit: `feat(admin/doctores): editar + nuevo forms with services pivote sync`

---

## Phase C — admin/servicios

Fields in `AdminServicioFormModal`: `nombre`, `descripcion`, `slot_duracion` (minutes), `activo` (bool), plus icon/slug if present.

### Task C1: Scaffold parallel routes

**Files:**
- Delete: `app/[locale]/(dashboard)/dashboard/admin/servicios/page.tsx`
- Create: `layout.tsx`, `_split-pane-client.tsx`, `@list/page.tsx`, `@detail/default.tsx`

- [ ] Apply Step P1 templates. Commit: `refactor(admin/servicios): scaffold parallel routes`

### Task C2: Adapt rows

**Files:**
- Modify: `components/dashboard/admin/AdminServicios.tsx`

- [ ] Apply Step P2. Remove `AdminServicioFormModal` import + state + JSX.
- [ ] Commit: `refactor(admin/servicios): rows navigate; form modal trigger removed`

### Task C3: Detail panel

**Files:**
- Create: `@detail/[id]/page.tsx`

- [ ] Apply Step P3. Show `nombre`, `descripcion`, `slot_duracion` (formatted as "X minutos"), `activo` (badge), and count of doctors offering it.
- [ ] Add `Dashboard.admin.servicios.detalle` keys.
- [ ] Commit: `feat(admin/servicios): @detail/[id] read panel`

### Task C4: Editar + nuevo forms

**Files:**
- Create: `@detail/[id]/editar/`, `@detail/nuevo/`, `@detail/_components/ServicioForm.tsx`

- [ ] Apply Step P4. Required: `nombre`, `slot_duracion` > 0.
- [ ] Add `Dashboard.admin.servicios.{editar,nuevo}` keys.
- [ ] Commit: `feat(admin/servicios): editar + nuevo forms`

---

## Phase D — admin/ubicaciones

Fields in `AdminUbicacionFormModal`: `nombre`, `direccion`, `telefono`, `activa` (bool), `departamento`.

### Task D1: Scaffold parallel routes

- [ ] Same as Step P1. Commit: `refactor(admin/ubicaciones): scaffold parallel routes`

### Task D2: Adapt rows

**Files:** Modify `components/dashboard/admin/AdminUbicaciones.tsx`

- [ ] Same as Step P2. Commit: `refactor(admin/ubicaciones): rows navigate; form modal trigger removed`

### Task D3: Detail panel

**Files:** Create `@detail/[id]/page.tsx`

- [ ] Fields: `nombre`, `direccion`, `telefono`, `departamento`, `activa` (badge), count of doctors at this ubicación.
- [ ] Add i18n keys. Commit: `feat(admin/ubicaciones): @detail/[id] read panel`

### Task D4: Editar + nuevo forms

- [ ] Apply Step P4. Required: `nombre`, `departamento`. Commit: `feat(admin/ubicaciones): editar + nuevo forms`

---

## Phase E — admin/excepciones

`AdminExcepcionesView` has two view modes (`tabla` and `calendario`). Keep both; clicking a calendar event navigates to `/admin/excepciones/[id]`. The calendar view + table view BOTH live under `@list/page.tsx`.

Fields in `AdminExcepcionFormModal`: `doctor_id` (FK), `fecha_inicio`, `fecha_fin`, `tipo` (e.g., `vacacion`, `feriado`), `motivo`.

### Task E1: Scaffold parallel routes

- [ ] Same as Step P1. `@list/page.tsx` renders `AdminExcepcionesView` unchanged (it manages its own internal view toggle).
- [ ] Commit: `refactor(admin/excepciones): scaffold parallel routes`

### Task E2: Adapt table rows + calendar events to navigate

**Files:**
- Modify: `components/dashboard/admin/AdminExcepcionesView.tsx`
- Modify: `components/dashboard/admin/AdminExcepcionesTabla.tsx`
- Modify: `components/dashboard/admin/AdminExcepcionesCalendario.tsx`

- [ ] Apply Step P2 to the table component.
- [ ] In the calendar component, replace whatever modal-trigger the event-click handler does today with `router.push(\`/${locale}/dashboard/admin/excepciones/${event.id}\`)`.
- [ ] Remove the `<AdminExcepcionFormModal />` render + state + import from `AdminExcepcionesView`.
- [ ] Past calendar events render with `opacity-60` (spec requirement). Apply to both citas and excepciones calendar event components.
- [ ] Commit: `refactor(admin/excepciones): table rows + calendar events navigate to /[id]; past dim`

### Task E3: Detail panel

**Files:** Create `@detail/[id]/page.tsx`

- [ ] Show `doctor.nombre` (joined), `fecha_inicio`, `fecha_fin` (formatted), `tipo` (badge), `motivo`, `created_at`.
- [ ] Add i18n keys. Commit: `feat(admin/excepciones): @detail/[id] read panel`

### Task E4: Editar + nuevo forms

- [ ] Apply Step P4. `doctor_id` is a `<select>` populated from `doctores` table. Date inputs use `<input type="datetime-local">` (or `date` if the excepciones are full-day).
- [ ] Required: `doctor_id`, `fecha_inicio`, `fecha_fin`.
- [ ] Validate `fecha_fin >= fecha_inicio` server-side.
- [ ] Add i18n keys.
- [ ] Commit: `feat(admin/excepciones): editar + nuevo forms`

---

## Phase F — admin/beneficios + miembro

This resource has two roles to handle. Admin manages CRUD; miembro views only.

### Task F1: Scaffold admin/beneficios parallel routes

- [ ] Same as Step P1, base `admin`.
- [ ] Commit: `refactor(admin/beneficios): scaffold parallel routes`

### Task F2: Adapt AdminBeneficios

**Files:** Modify `components/dashboard/admin/AdminBeneficios.tsx`

- [ ] Cards navigate to `/admin/beneficios/[id]`.
- [ ] Edit button → `/[id]/editar`. Create button → `/nuevo`.
- [ ] Remove `BeneficioFormModal` AND `BeneficioDetailModal` triggers + state + JSX (legacy import to `miembro/beneficios/BeneficioDetailModal` becomes unused).
- [ ] Commit: `refactor(admin/beneficios): cards navigate; modal triggers removed`

### Task F3: Admin detail panel

**Files:** Create `@detail/[id]/page.tsx`

- [ ] Show `titulo`, `descripcion`, `tipo_beneficio`, `fecha_inicio`, `fecha_fin`, `estado_beneficio`, `beneficio_image_url` (rendered as `<Image>`), `porcentaje_descuento` if applicable.
- [ ] Add `Dashboard.admin.beneficios.detalle` keys. Commit: `feat(admin/beneficios): @detail/[id] read panel`

### Task F4: Admin editar + nuevo forms

- [ ] Apply Step P4. Fields read from `BeneficioFormModal.tsx`: `titulo`, `descripcion`, `tipo_beneficio` (select), `fecha_inicio`, `fecha_fin`, `estado_beneficio` (`activa`/`inactiva`), `beneficio_image_url` (upload), `porcentaje_descuento`, `empresa_id` (optional FK).
- [ ] To find the existing upload flow: `grep -n "storage\.\|upload\|beneficio_image" components/dashboard/admin/BeneficioFormModal.tsx`. Preserve the exact storage bucket + path pattern. Image upload happens client-side (file input → `<input type="file">` → presigned URL or direct upload), so the form remains a client component using `formData.set("beneficio_image_url", uploadedUrl)` before `formAction(formData)`.
- [ ] If the original modal also handled image DELETION on edit (e.g., a "remove image" button), preserve that.
- [ ] Commit: `feat(admin/beneficios): editar + nuevo forms with image upload`

### Task F5: Scaffold dashboard/beneficios (miembro) parallel routes

- [ ] Apply Step P1. Miembro layout — no rol check, just authenticated.
- [ ] `@list/page.tsx` renders `BeneficiosGrid`.
- [ ] Commit: `refactor(miembro/beneficios): scaffold parallel routes`

### Task F6: Adapt BeneficiosGrid + cards

**Files:** Modify `components/dashboard/miembro/beneficios/BeneficiosGrid.tsx` and `BeneficioCard.tsx`

- [ ] Each card becomes a `<Link href="/dashboard/beneficios/[id]">` wrapper.
- [ ] Remove the `setBeneficio` state and `<BeneficioDetailModal />` render at the bottom.
- [ ] Commit: `refactor(miembro/beneficios): cards navigate; detail modal removed`

### Task F7: Miembro detail page

**Files:** Create `app/[locale]/(dashboard)/dashboard/beneficios/@detail/[id]/page.tsx`

- [ ] Mirror what `BeneficioDetailModal` (miembro) shows: image, titulo, descripcion, fechas, tipo, "Cómo usar" instructions if present. No actions slot (read-only for miembro).
- [ ] Add `Dashboard.miembro.beneficios.detalle` keys.
- [ ] Commit: `feat(miembro/beneficios): @detail/[id] read panel`

---

## Phase G — admin/avisos + miembro

### Task G1: Scaffold admin/avisos parallel routes

- [ ] Step P1. Commit: `refactor(admin/avisos): scaffold parallel routes`

### Task G2: Adapt AvisosAdmin

**Files:** Modify `components/dashboard/admin/AvisosAdmin.tsx`

- [ ] Cards/rows navigate to `/admin/avisos/[id]`. Edit → `/[id]/editar`. Create → `/nuevo`.
- [ ] Remove `AvisoFormModal` state + JSX.
- [ ] Commit: `refactor(admin/avisos): rows navigate; form modal trigger removed`

### Task G3: Admin detail panel

**Files:** Create `@detail/[id]/page.tsx`

- [ ] Show `titulo`, `descripcion`, `estado_aviso`, `fecha_inicio`, `fecha_fin`, `created_at`. Action: delete (existing handler) wrapped in confirm.
- [ ] i18n keys. Commit: `feat(admin/avisos): @detail/[id] read panel`

### Task G4: Admin editar + nuevo forms

- [ ] Fields from `AvisoFormModal.tsx`: `titulo`, `descripcion`, `estado_aviso`, `fecha_inicio`, `fecha_fin`, `empresa_id` (optional FK).
- [ ] Commit: `feat(admin/avisos): editar + nuevo forms`

### Task G5: Scaffold dashboard/avisos (miembro) parallel routes

- [ ] Step P1. Commit: `refactor(miembro/avisos): scaffold parallel routes`

### Task G6: Adapt MisAvisos cards

**Files:** Modify `components/dashboard/miembro/avisos/MisAvisos.tsx`

- [ ] Each card → `<Link href="/dashboard/avisos/[id]">`. Remove `AvisoDetailModal` trigger + state.
- [ ] Commit: `refactor(miembro/avisos): cards navigate; detail modal removed`

### Task G7: Miembro detail page

**Files:** Create `app/[locale]/(dashboard)/dashboard/avisos/@detail/[id]/page.tsx`

- [ ] Mirror `AvisoDetailModal`. Read-only.
- [ ] Commit: `feat(miembro/avisos): @detail/[id] read panel`

---

## Phase H — admin/documentos + miembro

`AdminDocumentos` already has inline edit state (no separate form modal — edit fields are inline in the row or via `SubirDocumentoModal` for create). The miembro side renders cards via `DocumentoCard`.

### Task H1: Scaffold admin/documentos parallel routes

- [ ] Step P1. Commit: `refactor(admin/documentos): scaffold parallel routes`

### Task H2: Adapt AdminDocumentos

**Files:** Modify `components/dashboard/admin/AdminDocumentos.tsx`

- [ ] Rows navigate. Edit → `/[id]/editar`. Upload button → `/nuevo`. Remove inline edit state (`editDoc`, `editNombre`, etc.) + the `<SubirDocumentoModal>` render.
- [ ] Commit: `refactor(admin/documentos): rows navigate; modal triggers removed`

### Task H3: Admin detail panel

**Files:** Create `@detail/[id]/page.tsx`

- [ ] Show `nombre_documento`, `tipo_documento` (badge), `fecha_documento`, `estado_archivo`, `tipo_archivo`, `created_at`, plus a "Descargar" button using the existing storage signed-URL helper.
- [ ] i18n keys. Commit: `feat(admin/documentos): @detail/[id] read panel`

### Task H4: Admin editar + nuevo forms

- [ ] Editar fields: `nombre_documento`, `tipo_documento`, `fecha_documento`, `estado_archivo`. Nuevo flow uses the existing file upload + signed URL helper.
- [ ] To find the upload flow: `grep -n "storage\.\|upload\|file_path" components/dashboard/admin/SubirDocumentoModal.tsx`. Preserve the bucket + path logic exactly (the existing path format is used by downstream signed-URL generators).
- [ ] Nuevo requires `usuario_id` selector (admin uploads on behalf of a member).
- [ ] Commit: `feat(admin/documentos): editar + nuevo forms (upload preserved)`

### Task H5: Scaffold dashboard/documentos (miembro) parallel routes

- [ ] Step P1. Commit: `refactor(miembro/documentos): scaffold parallel routes`

### Task H6: Adapt MisDocumentos cards

**Files:** Modify `components/dashboard/miembro/documentos/MisDocumentos.tsx` and `DocumentoCard.tsx`

- [ ] Card click → `<Link href="/dashboard/documentos/[id]">`. View + download buttons remain inline.
- [ ] Commit: `refactor(miembro/documentos): cards navigate to detail`

### Task H7: Miembro detail page

**Files:** Create `app/[locale]/(dashboard)/dashboard/documentos/@detail/[id]/page.tsx`

- [ ] Same field set as admin minus the "Editar" action. Download button via storage signed URL.
- [ ] Commit: `feat(miembro/documentos): @detail/[id] read panel`

---

## Phase I — Citas (admin, empresa, miembro)

The citas resource is the most complex because of the calendar views and cross-role sharing.

### Task I1: Scaffold admin/citas parallel routes (with calendario relocation)

`admin/citas` currently has:
- `page.tsx` (renders `AdminCitasRegistro` — the table view)
- `calendario/page.tsx` (renders `AdminCalendarioCitas`)

**Architectural decision — calendario must move to a sibling route.** A parallel-routes layout at `admin/citas/` applies to ALL descendants. The calendario sub-route would inherit the split-pane layout, which is wrong (calendar should be full-bleed). Move it to a sibling instead.

**Files:**
- Move: `app/[locale]/(dashboard)/dashboard/admin/citas/calendario/page.tsx` → `app/[locale]/(dashboard)/dashboard/admin/citas-calendario/page.tsx` (use `git mv`).
- Delete: `app/[locale]/(dashboard)/dashboard/admin/citas/page.tsx`.
- Create: `layout.tsx`, `_split-pane-client.tsx`, `@list/page.tsx`, `@detail/default.tsx` per Step P1.
- Update the sidebar/nav (search with `grep -rn "admin/citas/calendario" app/ components/`) so the calendar link points to the new path.

- [ ] Apply Step P1 templates. `@list/page.tsx` renders `AdminCitasRegistro`.
- [ ] `pnpm build` passes; the calendar route loads at the new URL.
- [ ] Commit: `refactor(admin/citas): scaffold parallel routes; relocate calendario to sibling route`

### Task I2: Adapt AdminCitasRegistro rows

**Files:** Modify `components/dashboard/admin/AdminCitasRegistro.tsx`

- [ ] Rows navigate to `/admin/citas/[id]`. Remove the `<DetalleModalAdmin>` trigger + state + JSX. Keep the import deletion for the cleanup phase.
- [ ] Commit: `refactor(admin/citas): rows navigate to /[id]; detail modal removed`

### Task I3: Adapt AdminCalendarioCitas event clicks

**Files:** Modify `components/dashboard/admin/AdminCalendarioCitas.tsx`

- [ ] Replace the event-click handler that opened `AdminCitaDetalleModal` with `router.push(\`/${locale}/dashboard/admin/citas/${event.id}\`)`.
- [ ] Apply `opacity-60` to past-date events (spec requirement).
- [ ] Remove the `<AdminCitaDetalleModal>` render + state + import.
- [ ] Commit: `refactor(admin/citas): calendar events navigate to /[id]; past dim`

### Task I4: Admin citas detail panel (read)

**Files:** Create `app/[locale]/(dashboard)/dashboard/admin/citas/@detail/[id]/page.tsx`

This page must subsume ALL of `AdminCitaDetalleModal`'s behavior:
- Show: paciente, doctor, servicio, ubicacion, fecha, motivo, estado, motivo_rechazo/cancelacion if present.
- Actions per state:
  - `pendiente` / `pendiente_admin` → confirmar / rechazar buttons (existing endpoints).
  - `pendiente_empresa` → empresa actions (will only render if actor is empresa_admin — guard at the action handler).
  - `confirmado` && !esPasada → cancelar button (with motivo input toggle).
  - `confirmado` && esPasada → "Cita finalizada — no se puede cancelar" badge.
  - Terminal states → no actions, just badge.

This is a meaty page. Use Server Actions for the mutations.

- [ ] Files: `@detail/[id]/page.tsx` (server, fetches the cita + related), `@detail/[id]/CitaActions.tsx` (client, manages local state for the cancel motivo input and form submission).
- [ ] Add `Dashboard.admin.citas.detalle` i18n keys (reuse existing modal keys where possible).
- [ ] Commit: `feat(admin/citas): @detail/[id] read panel with state-aware actions`

### Task I5: Empresa citas mirror

**Files:**
- Modify: `app/[locale]/(dashboard)/dashboard/empresa/citas/page.tsx`
- Create: full parallel-routes structure for `empresa/citas`
- Create: `empresa/citas/@detail/[id]/page.tsx`
- Modify: `components/dashboard/empresa/EmpresaCitasRegistro.tsx`

- [ ] Apply Step P1 (rol = `"empresa_admin"`).
- [ ] EmpresaCitasRegistro: rows navigate. Remove modal trigger.
- [ ] `@detail/[id]/page.tsx`: similar to admin's, but actions restricted to `pendiente_empresa` confirm/reject and cancellation within the ventana. The empresa_admin guard at the page level ensures only their empresa's citas are accessible (verify with an RLS-friendly query).
- [ ] Commit: `refactor(empresa/citas): parallel routes + detail panel`

### Task I6: Miembro citas detail panel

**Files:**
- Modify: `app/[locale]/(dashboard)/dashboard/citas/page.tsx` → restructure as parallel routes
- Create: `dashboard/citas/@detail/[id]/page.tsx`

- [ ] Apply Step P1 (no rol check beyond authenticated). `@list/page.tsx` renders `MisCitas`.
- [ ] `CitaCard` (existing) renders inside the list. Add `<Link href="/dashboard/citas/[id]">` wrap to each card.
- [ ] Detail page shows full cita info, cancel button (if within ventana and not past), add-to-calendar (reuse existing `AgregarACalendario`).
- [ ] Commit: `refactor(miembro/citas): parallel routes + detail panel`

The cita creation wizard (`Paso*` steps) is OUT OF SCOPE per the spec — do not refactor it. The "Agendar cita" CTA still navigates to `/dashboard/citas/nueva` or wherever the wizard lives today; don't touch that flow.

---

## Phase J — empresa/usuarios

The empresa_admin role has its own user-management view (`EmpresaUsuarios`) with two modals: `DetalleModal` (read) and `EditarUsuarioModal` (edit).

### Task J1: Scaffold empresa/usuarios parallel routes

- [ ] Step P1 with rol = `"empresa_admin"`.
- [ ] Commit: `refactor(empresa/usuarios): scaffold parallel routes`

### Task J2: Adapt EmpresaUsuarios rows

**Files:** Modify `components/dashboard/empresa/EmpresaUsuarios.tsx`

- [ ] Rows navigate to `/empresa/usuarios/[id]`. Edit → `/[id]/editar`. Remove both modals' state + JSX.
- [ ] Commit: `refactor(empresa/usuarios): rows navigate; modals removed`

### Task J3: Detail panel

**Files:** Create `@detail/[id]/page.tsx`

- [ ] Mirror what empresa's `DetalleModal` shows (probably similar to admin's user detail minus the empresa selector — empresa_admin only sees their own users). Reuse `AdminUsuarioContratosUsage` if accessible to empresa_admin (check RLS).
- [ ] Add `Dashboard.empresa.usuarios.detalle` keys.
- [ ] Commit: `feat(empresa/usuarios): @detail/[id] read panel`

### Task J4: Editar form

**Files:** Create `@detail/[id]/editar/{actions.ts,page.tsx,EditarUsuarioForm.tsx}`

- [ ] Fields the legacy `EditarUsuarioModal` allowed (read it to confirm). Likely subset of admin's: `nombre_completo`, `telefono`, `email`, `estado` (empresa_admin probably can't change `rol`).
- [ ] Server Action enforces empresa scope: verify the target user's `empresa_id` matches the actor's before allowing the update.
- [ ] Add `Dashboard.empresa.usuarios.editar` keys.
- [ ] Commit: `feat(empresa/usuarios): editar form with empresa-scope guard`

Empresa does not typically create users (they self-register or admin creates) — no `nuevo` route unless `EmpresaUsuarios` currently has a "create" CTA. If it does, mirror admin's pattern; if not, skip.

---

## Phase K — Cleanup (delete legacy modal files)

After Phases A–J ship, the following files are unused. Verify with `grep` before deleting each one:

- `components/dashboard/admin/AdminCitaDetalleModal.tsx`
- `components/dashboard/admin/AdminDoctorFormModal.tsx`
- `components/dashboard/admin/AdminServicioFormModal.tsx`
- `components/dashboard/admin/AdminUbicacionFormModal.tsx`
- `components/dashboard/admin/AdminExcepcionFormModal.tsx`
- `components/dashboard/admin/BeneficioFormModal.tsx`
- `components/dashboard/admin/AvisoFormModal.tsx`
- `components/dashboard/admin/SubirDocumentoModal.tsx`
- `components/dashboard/admin/DetalleModalAdmin.tsx`
- `components/dashboard/miembro/beneficios/BeneficioDetailModal.tsx`
- `components/dashboard/miembro/avisos/AvisoDetailModal.tsx`
- `components/dashboard/empresa/DetalleModal.tsx`
- `components/dashboard/empresa/EditarUsuarioModal.tsx`

### Task K1: Verify zero references and delete

- [ ] For each file in the list above, run `grep -rn "<basename>" --include="*.tsx" --include="*.ts" .` (excluding the file itself). If zero matches, `git rm` it.
- [ ] If a file still has references, investigate before deleting — there may be a hidden integration the plan missed.
- [ ] `pnpm build` after each batch deletion to catch missing-import errors early.
- [ ] Commit (one big commit is fine here): `chore: remove legacy detail/form modal files`

### Task K2: Remove unused i18n keys

- [ ] Search for translation keys that referenced the old modals and are no longer used (`grep` for the key path in tsx/ts files). Delete from both `messages/es.json` and `messages/en.json`.
- [ ] Commit: `chore(i18n): drop unused legacy modal translation keys`

---

## Phase L — Final verification + PR

### Task L1: Full-app verification

- [ ] `pnpm build` clean.
- [ ] `pnpm lint`: confirm no new errors vs main (line count of warnings is OK if equal-or-lower than Plan 1's baseline of 17).
- [ ] Manual UI walk-through:
  1. As admin: visit each refactored route, click a row, verify detail panel, click edit, edit a field, submit, verify list updates.
  2. As empresa_admin: same for empresa/usuarios and empresa/citas.
  3. As miembro: same for dashboard/{citas,beneficios,avisos,documentos}.
  4. Calendar views (admin/citas/calendario, admin/excepciones in calendar mode): click an event, verify navigation to `/[id]`, verify past events have `opacity-60`.
  5. Mobile (resize to <md): each list → click a row → only detail panel shows → "Volver" returns.
- [ ] Confirm zero regressions in the AdminCitas cancel flow against a past cita (CITA_YA_PASO error shows with Spanish text from Plan 1's i18n keys).

### Task L2: Open the PR

- [ ] Push the branch one more time: `git push origin refactor/detail-views-and-fixes`.
- [ ] Open the PR:
  ```bash
  gh pr create --title "refactor: detail views as parallel routes + past-cita fixes" --body "$(cat <<'EOF'
## Summary
- Replace all detail and form modals with dedicated routes under a parallel-route split-pane layout (10 resources × ~4 routes each).
- Bug A: ProximaCita on the home no longer shows past confirmed citas (.gte filter + pg_cron auto-complete job).
- Bug B: admin/empresa/miembro can no longer cancel past citas. RPC rejects with CITA_YA_PASO; UI hides the cancel button.
- New auto_completado event type with in-app-only notification (no WA/email noise).
- Home reorg: CredentialCard and MisServiciosCubiertos share a row on md+.

## Spec & Plans
- Spec: docs/superpowers/specs/2026-06-01-refactor-detail-views-design.md
- Plan 1: docs/superpowers/plans/2026-06-01-refactor-detail-views-plan-1.md
- Plan 2: docs/superpowers/plans/2026-06-01-refactor-detail-views-plan-2.md

## Test plan
- [ ] Verify each refactored resource end-to-end as admin
- [ ] Verify empresa_admin scopes (citas, usuarios)
- [ ] Verify miembro read-only flows
- [ ] Verify calendar event navigation (citas + excepciones)
- [ ] Verify ProximaCita ignores past citas after the fix
- [ ] Verify CITA_YA_PASO blocks cancellation on past citas at the RPC level
- [ ] Verify auto_complete_past_citas cron runs successfully (check cron.job_run_details)
- [ ] Verify auto_completado event triggers in-app notification only

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
  ```
- [ ] Paste the PR URL in your final report.

---

## Out of scope (for the curious)

- Member cita creation wizard rewrite.
- Notification system changes beyond the new `auto_completado` event type.
- Admin reports, auditoría, sistema sections (no detail modals to migrate).
- Destructive-action `AlertDialog` confirmations.
- Refactoring routes that already have `/[id]/page.tsx` patterns and no associated modal (none identified).
