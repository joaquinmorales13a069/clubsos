# Refactor: detail views, split-pane layout, home reorg & past-cita fixes

**Date:** 2026-06-01
**Branch:** `refactor/detail-views-and-fixes`
**Status:** Design approved — pending implementation plan

## Overview

Refactor all detail-and-form modals across the dashboard into dedicated routes with a responsive split-pane layout (table + detail panel). Reorganize the member home so the digital credential card and "Mis servicios cubiertos" share a row on md+ screens. Fix two bugs around past appointments: (a) `ProximaCitaCard` showing already-elapsed citas as upcoming, and (b) admin calendar allowing cancellation of past citas.

The refactor is meant to land in a single PR from `refactor/detail-views-and-fixes` into `main`.

## Goals

1. Replace every detail modal with a dedicated page route under a split-pane layout. Replace every create/edit form modal with a dedicated page route as well.
2. For all list-based admin resources (Citas, Beneficios, Avisos, Documentos, Excepciones, Ubicaciones, Servicios, Doctores, Usuarios, Empresas), apply a 3-col table + 1-col detail-panel grid on `lg+`, stacked on smaller screens.
3. Side-by-side `CredentialCard` + `MisServiciosCubiertos` on `md+`. Fix `ProximaCitaCard` to only show future appointments.
4. Block cancellation of past citas from any role (UI + RPC). Auto-mark past `confirmado` citas as `completado` via a `pg_cron` job.

## Non-goals

- Rewriting the member cita creation wizard.
- Refactoring `AlertDialog` confirmation modals for destructive actions.
- Reports, auditoría, or sistema sections (no detail modals to migrate).
- Restructuring notifications beyond a new `auto_completado` event type.

## Architecture

### Routing pattern (all list-based resources)

```
/<recurso>                  → list view (split-pane, empty detail panel)
/<recurso>/[id]             → list + detail panel (read mode)
/<recurso>/[id]/editar      → list + detail panel (edit form)
/<recurso>/nuevo            → list + detail panel (create form)
```

Implemented with **App Router parallel routes**:

```
app/[locale]/(dashboard)/dashboard/<route>/
  layout.tsx                  ← grid container, hosts @list and @detail slots
  @list/
    page.tsx                  ← server component, fetches list data
  @detail/
    default.tsx               ← <DetailEmptyState />
    [id]/
      page.tsx                ← detail (read)
      editar/page.tsx         ← edit form
    nuevo/page.tsx            ← create form
```

`default.tsx` is required for parallel routes so the slot has fallback content when no segment matches.

### Responsive behaviour

| Breakpoint | Behaviour |
|---|---|
| `lg` (≥1024px) | `grid-cols-4` — `col-span-3` list, `col-span-1` detail panel. Panel uses `sticky top-20` and own scroll. |
| `md` (≥768px, <1024px) | Single column. List on top, detail panel below (also full width). No sticky. |
| `sm` (<768px) | Single column. List hidden when a `[id]` / `nuevo` / `editar` segment is active; only the detail panel shows. Top of detail panel has a "Volver" button → `router.push("/<recurso>")`. |

CSS toggles via Tailwind responsive utilities on the layout slots; no JS-driven viewport detection.

### Shared components

Location: `components/dashboard/shared/`

- `SplitPaneLayout.tsx` — receives `list` and `detail` as children; applies responsive grid + sticky logic.
- `DetailPanel.tsx` — card container (glassmorphism, `rounded-2xl`, scroll interno, header con título + close).
- `DetailEmptyState.tsx` — "Selecciona un registro de la lista" placeholder (with icon + i18n).
- `BackButton.tsx` — mobile-only "Volver" button visible <lg, navigates to parent list route.

Table row selection: each row becomes a `<Link href="/<recurso>/[id]">`. Active row gets `data-active` attribute + `bg-primary/5 border-l-2 border-primary` styling, matched against the current `[id]` segment via `useSelectedLayoutSegments()`.

### Form mutations

Forms inside `@detail/nuevo` and `@detail/[id]/editar` use **Server Actions** (Next 16). On success:
1. `revalidatePath("/<locale>/dashboard/<recurso>")` to refresh the list.
2. `redirect("/<locale>/dashboard/<recurso>/[id]")` for edit (back to read mode) or `redirect("/<locale>/dashboard/<recurso>/<newId>")` for create.

Errors surface via `useFormState` / inline field errors; toasts via `sonner` for top-level success/error.

## Modal → route mapping

| Modal removed | Replacement route |
|---|---|
| `AdminCitaDetalleModal` | `admin/citas/@detail/[id]/page.tsx` |
| `AdminDoctorDetalle` (panel) | merged into `admin/doctores/@detail/[id]/page.tsx` |
| `BeneficioDetailModal` (miembro) | `dashboard/beneficios/@detail/[id]/page.tsx` |
| `AvisoDetailModal` (miembro) | `dashboard/avisos/@detail/[id]/page.tsx` |
| `DetalleModalAdmin` | `admin/usuarios/@detail/[id]/page.tsx` |
| `DetalleModal` (empresa) | `dashboard/empresa/usuarios/@detail/[id]/page.tsx` |
| `AdminDoctorFormModal` | `admin/doctores/@detail/nuevo` + `[id]/editar` |
| `AdminServicioFormModal` | `admin/servicios/@detail/nuevo` + `[id]/editar` |
| `AdminUbicacionFormModal` | `admin/ubicaciones/@detail/nuevo` + `[id]/editar` |
| `AdminExcepcionFormModal` | `admin/excepciones/@detail/nuevo` + `[id]/editar` |
| `BeneficioFormModal` | `admin/beneficios/@detail/nuevo` + `[id]/editar` |
| `AvisoFormModal` | `admin/avisos/@detail/nuevo` + `[id]/editar` |
| `SubirDocumentoModal` | `admin/documentos/@detail/nuevo` |
| `EditarUsuarioModal` (empresa) | `dashboard/empresa/usuarios/@detail/[id]/editar` |

`AdminDoctorDetalle` already follows a panel/tab structure (`AdminDoctorTabInfo`, `AdminDoctorTabHorarios`, `AdminDoctorTabServicios`); reuse those tab components inside the new `[id]/page.tsx`.

### Calendars

`AdminCalendarioCitas` and `AdminExcepcionesCalendario` keep the calendar view. Clicking a calendar event now navigates to the corresponding `/[id]` route instead of opening a modal. Past calendar events render with `opacity-60` to signal they are no longer actionable.

## Home reorganization

File: `app/[locale]/(dashboard)/dashboard/page.tsx`

**Before**

```
Greeting
CredentialCard           (full width)
QuickActions             (4 cols)
MisServiciosCubiertos    (full width)
Grid 2x2: ProximaCita, Beneficios, Documentos, Avisos
```

**After**

```
Greeting
md+: [ CredentialCard | MisServiciosCubiertos ]   (grid-cols-2)
sm:   CredentialCard
      MisServiciosCubiertos
QuickActions             (4 cols → 2x2 en sm)
Grid 2x2: ProximaCita, Beneficios, Documentos, Avisos
```

### Component adjustments

- `MisServiciosCubiertos`:
  - Add `h-full` so it matches `CredentialCard` height when on md+.
  - Add `max-h-[280px] overflow-y-auto` for the service rows in case there are many services.
  - No visual changes on sm (still full-width, no scroll cap).
- `CredentialCard`:
  - Keep ~16:10 aspect ratio inside its column; don't stretch when md+ shrinks it horizontally.

## Bug fixes

### Bug A — `ProximaCitaCard` shows past citas

Root cause: the home query in `page.tsx:42-47` filters by `estado_sync in ('pendiente', 'confirmado')` only — past confirmed citas that were never marked completed still match.

**Two-layer fix:**

1. **Root** — auto-complete past citas via `pg_cron` (also drives bug B's third layer).
2. **Defense** — add `.gte("fecha_hora_cita", new Date().toISOString())` to the home query so the UI is correct even if the cron is delayed.

```ts
supabase.from("citas")
  .select("id, fecha_hora_cita, estado_sync, servicio_asociado")
  .in("estado_sync", ["pendiente", "confirmado"])
  .gte("fecha_hora_cita", new Date().toISOString())
  .order("fecha_hora_cita", { ascending: true })
  .limit(1)
  .maybeSingle()
```

### Bug B — Admin can cancel past citas from calendar

**Three layers**:

1. **UI** — cancel button hidden when `new Date(cita.fecha_hora_cita) < new Date()`. Replaced by an informational badge "Cita finalizada — no se puede cancelar" (i18n key `citas.detalle.finalizadaNoCancelable`). Applies to admin, empresa_admin, and miembro detail panels.

2. **RPC** — extend `cancelar_cita` (new migration) to raise `CITA_YA_PASO` (HTTP 409) when `v_cita.fecha_hora_cita < now()`. Add the error code to `lib/citas/errors.ts` map.

3. **Auto-complete** — new function `auto_complete_past_citas()` scheduled every 15 min via `pg_cron`. Marks `confirmado` citas as `completado` when `fecha_hora_cita < now() - interval '2 hours'`. The 2-hour buffer avoids closing citas still in progress.

#### Trigger behaviour

`tr_cita_estado_change` still fires when auto-complete updates a row. The trigger writes to `cita_eventos` with a **new event type `auto_completado`**. The edge function `procesar_eventos_cita` handles this type by writing an in-app notification only (no WhatsApp template, no Resend email) so users aren't spammed.

Citas in `pendiente` or `pendiente_admin` are **not** auto-completed — they remain visible so the admin or empresa can close them manually.

## Migrations

All under `supabase/migrations/`, applied in order:

1. `<ts>_block_cancel_past_citas.sql` — modify `cancelar_cita` to raise `CITA_YA_PASO` for `fecha_hora_cita < now()`.
2. `<ts>_auto_complete_past_citas.sql` — function + `pg_cron.schedule('auto-complete-past-citas', '*/15 * * * *', ...)`.
3. `<ts>_cita_eventos_auto_completado.sql` — add `auto_completado` to the `cita_eventos.tipo` enum/check; adjust `tr_cita_estado_change` to emit this type when the transition is driven by the auto-complete function. Detection uses a session-local GUC: `auto_complete_past_citas()` calls `SET LOCAL clubsos.auto_complete_run = 'true'` before its `UPDATE`; the trigger reads `current_setting('clubsos.auto_complete_run', true)` and chooses the event type accordingly. No actor-based heuristic — explicit signal only.

No schema changes for the modal-to-route refactor — purely application code.

## i18n

Add keys to **both** `messages/es.json` and `messages/en.json`:

- Page titles for each new detail/edit/create page (10 resources × 3 = ~30 keys).
- `shared.detailEmpty` — "Selecciona un registro de la lista".
- `shared.back` — "Volver".
- `errors.citaYaPaso` — server error translation.
- `citas.detalle.finalizadaNoCancelable` — UI badge text.

Existing translations from removed modals can be reused under the new namespaces.

## Edge function changes

`supabase/functions/procesar_eventos_cita`:

- Add case for `auto_completado` event type → write `notificaciones` row only; skip WhatsApp + Resend dispatch.

## Verification (manual, no test suite exists)

Per resource (golden path):
1. Open `/dashboard/<recurso>` — split-pane renders, panel shows empty-state.
2. Click row → URL updates, panel shows detail.
3. Resize to mobile → only panel visible, "Volver" button works.
4. Click "Nuevo" → `/<recurso>/nuevo` form opens in panel.
5. Submit valid form → redirect to `/<recurso>/[newId]` in read mode, list shows new row.
6. Click "Editar" on detail → `/[id]/editar`, submit → back to read mode.

Cita-specific:
- Confirm cancel button is hidden + badge visible on past cita detail.
- Call `rpc('cancelar_cita', ...)` from SQL editor against a past cita → returns `CITA_YA_PASO`.
- Insert a `confirmado` cita with `fecha_hora_cita = now() - interval '3 hours'`, wait one cron tick → row becomes `completado`, in-app notificación appears, no WhatsApp/email triggered.

Home:
- `md+`: `CredentialCard` and `MisServiciosCubiertos` side by side.
- `sm`: stacked.
- With a past `confirmado` cita that escaped the cron, `ProximaCitaCard` shows empty state thanks to the `.gte()` defense.

Build & lint:
- `pnpm build` (includes type-check) passes.
- `pnpm lint` passes.

## Rollout

- Single PR from `refactor/detail-views-and-fixes` into `main`.
- Commits grouped by area (one commit per resource, separate commits for migrations, home, bug B fix).
- Apply SQL migrations to the remote Supabase project (`supabase db push`) before merging so the cron and modified RPC are active in production simultaneously with the front-end changes.
- Preview deploy verification before merge.

## Out of scope

- Member cita creation wizard rewrite.
- Notification system changes beyond the new `auto_completado` event type.
- Reports, auditoría, sistema sections (no detail modals).
- Destructive-action `AlertDialog` confirmations.
