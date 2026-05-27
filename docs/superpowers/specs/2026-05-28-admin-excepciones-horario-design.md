# Admin Excepciones de Horario — Design

**Branch:** `feat/admin-excepciones-horario`
**Goal:** Complete the `excepciones_horario` feature in the admin UI: support all four scope levels (global, by-location, by-doctor, by-doctor+location), expose a unified global management view, and fix the SQL backend that currently ignores `ubicacion_id`.

## Background

The `excepciones_horario` table is the mechanism that blocks specific date ranges from being booked. The schema supports four scope levels via two nullable FK columns (`doctor_id`, `ubicacion_id`):

| `doctor_id` | `ubicacion_id` | Meaning |
|---|---|---|
| NULL | NULL | Global — blocks every doctor at every clinic |
| set | NULL | Specific doctor at every clinic |
| NULL | set | Every doctor at this specific clinic |
| set | set | Specific doctor at specific clinic |

Current state of the system:
- **Per-doctor UI exists.** `AdminDoctorTabHorarios.tsx` section B has a working create/list/delete UI scoped to one doctor.
- **`crear_cita_atomic` ignores `ubicacion_id`.** Only the `doctor_id IS NULL OR doctor_id = ...` clause is checked, so any exception you create with `ubicacion_id` set has no effect.
- **No way to create global exceptions.** The only endpoint is `POST /api/admin/doctores/[id]/excepciones` which forces `doctor_id` to be set.
- **No aggregated view.** Admin must navigate doctor-by-doctor to audit what's blocked.

This PR fixes all three gaps.

## Architecture

### Data model — unchanged

The `excepciones_horario` schema already supports all four scopes. No schema migration; only the RPCs that consume the table are updated.

### Scope discovery (read in RPC)

For booking validation a single overlap query must consider **all applicable exceptions** for the requested (doctor, ubicación, time-range) tuple. The matching predicate is:

```sql
WHERE (e.doctor_id    IS NULL OR e.doctor_id    = p_doctor_id)
  AND (e.ubicacion_id IS NULL OR e.ubicacion_id = v_ubicacion_id)
  AND tstzrange(e.fecha_inicio, e.fecha_fin, '[)')
      && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
```

This naturally encodes all four scopes:
- Global (both NULL) → matches every booking.
- Doctor-only → matches if doctor matches, any ubicación.
- Ubicación-only → matches if ubicación matches, any doctor.
- Doctor+ubicación → matches only if both match.

### Components touched

```
supabase/migrations/20260528120000_excepciones_ubicacion_scope.sql   (new)
app/api/admin/excepciones/route.ts                                    (new)
app/api/admin/excepciones/[id]/route.ts                               (new)
app/[locale]/(dashboard)/dashboard/admin/excepciones/page.tsx         (new)
components/dashboard/admin/AdminExcepcionesView.tsx                   (new — toggle wrapper)
components/dashboard/admin/AdminExcepcionesCalendario.tsx             (new — FullCalendar view)
components/dashboard/admin/AdminExcepcionesTabla.tsx                  (new — table view)
components/dashboard/admin/AdminExcepcionFormModal.tsx                (new — create/edit modal)
components/dashboard/admin/AdminDoctorTabHorarios.tsx                 (modify — UX polish only)
components/dashboard/Sidebar.tsx                                       (modify — add nav item)
messages/es.json, messages/en.json                                     (modify — new keys)
```

## Backend

### 1. SQL migration — `20260528120000_excepciones_ubicacion_scope.sql`

Two `CREATE OR REPLACE FUNCTION` statements wrapped in a single transaction:

**a) `crear_cita_atomic`** — replace the current "Ubicación-blind" excepciones check:

```sql
IF EXISTS (
  SELECT 1 FROM public.excepciones_horario e
  WHERE (e.doctor_id    IS NULL OR e.doctor_id    = p_doctor_id)
    AND (e.ubicacion_id IS NULL OR e.ubicacion_id = v_ubicacion_id)
    AND tstzrange(e.fecha_inicio, e.fecha_fin, '[)')
        && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
) THEN
  RAISE EXCEPTION 'SLOT_IN_EXCEPTION' USING ERRCODE = 'P0001';
END IF;
```

`v_ubicacion_id` is already declared and assigned earlier in the function (`v_ubicacion_id := v_doctor.ubicacion_id`). No other changes to the RPC body.

**b) `obtener_slots_disponibles`** — update the `bloqueados` CTE to use the same predicate:

```sql
bloqueados AS (
  SELECT s.slot_start
  FROM slots s
  WHERE EXISTS (
    SELECT 1 FROM public.excepciones_horario e
    WHERE (e.doctor_id    IS NULL OR e.doctor_id    = p_doctor_id)
      AND (e.ubicacion_id IS NULL OR e.ubicacion_id = (
            SELECT d.ubicacion_id FROM public.doctores d WHERE d.id = p_doctor_id
          ))
      AND tstzrange(e.fecha_inicio, e.fecha_fin, '[)')
          && tstzrange(s.slot_start, s.slot_end, '[)')
  )
)
```

(The subquery for `ubicacion_id` mirrors how the RPC currently resolves the doctor's ubicación.)

**c) Realtime publication** — add `excepciones_horario` to `supabase_realtime` so the admin calendar can subscribe to changes:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.excepciones_horario;
```

(Verified: the table is currently NOT in the publication — only `citas` was added in `20260522000300_citas_native_indexes_and_realtime.sql`.)

**d) Verification** — the migration ends with a comment that GRANT is preserved by `CREATE OR REPLACE`.

### 2. Endpoints

All under `app/api/admin/excepciones/`. Each performs the standard `assertAdmin` pattern (same as the existing per-doctor endpoints).

**a) `GET /api/admin/excepciones`** — list with optional filters:

Query string params (all optional):
- `scope` — one of `global`, `doctor`, `ubicacion`, `both`, `all` (default: `all`)
- `doctor_id` — UUID
- `ubicacion_id` — UUID
- `fecha_desde` — YYYY-MM-DD (filter exceptions whose `fecha_fin >= this`)
- `fecha_hasta` — YYYY-MM-DD (filter exceptions whose `fecha_inicio <= this`)

Response:
```ts
{
  excepciones: Array<{
    id: string;
    doctor_id: string | null;
    ubicacion_id: string | null;
    fecha_inicio: string;     // ISO TIMESTAMPTZ
    fecha_fin: string;
    motivo: string | null;
    created_at: string;
    doctor:    { id: string; nombre: string } | null;
    ubicacion: { id: string; nombre: string } | null;
  }>
}
```

Scope filter logic:
- `global` → `doctor_id IS NULL AND ubicacion_id IS NULL`
- `doctor` → `doctor_id IS NOT NULL AND ubicacion_id IS NULL`
- `ubicacion` → `doctor_id IS NULL AND ubicacion_id IS NOT NULL`
- `both` → both not null
- `all` → no filter

**b) `POST /api/admin/excepciones`** — create any scope:

Body:
```ts
{
  fecha_inicio: string;         // ISO
  fecha_fin: string;            // ISO
  motivo?: string;
  doctor_id?: string | null;    // omit or null → not doctor-scoped
  ubicacion_id?: string | null; // omit or null → not ubicación-scoped
}
```

Validates `fecha_fin > fecha_inicio` (DB constraint also enforces; the endpoint returns a friendly error before the round-trip). Returns `{ ok: true, excepcion: { id, ... } }`. Writes audit log `accion: "excepcion.crear"`.

**c) `DELETE /api/admin/excepciones/[id]`** — delete by id:

Path param `id`. No `doctor_id` constraint (unlike the legacy endpoint). Returns `{ ok: true }`. Audit log `accion: "excepcion.eliminar"`.

### 3. Backwards compatibility

The legacy endpoints `POST /api/admin/doctores/[id]/excepciones` and `DELETE /api/admin/doctores/[id]/excepciones/[excepcionId]` remain. The per-doctor UI continues to use them unchanged. The new endpoints under `/api/admin/excepciones` are additive.

## Frontend

### 1. New route + page

`app/[locale]/(dashboard)/dashboard/admin/excepciones/page.tsx`:

- Server component. Authenticates session, fetches role, redirects to `/dashboard` if not admin.
- Renders `<AdminExcepcionesView locale={locale} />`.

### 2. `AdminExcepcionesView.tsx` — toggle wrapper

Mirrors `AdminCitasView.tsx`:
- Header with title + view toggle (Calendario / Lista) + "Nueva excepción" button.
- Toggle state stored locally; calendar is default.
- Passes shared filter state down to whichever view is active.

### 3. `AdminExcepcionesCalendario.tsx`

- FullCalendar with `timeZone="America/Managua"` (controlled exception, same as existing `AdminCalendarioCitas`).
- Plugins: dayGrid, timeGrid, interaction.
- Events fetched via `GET /api/admin/excepciones?fecha_desde=...&fecha_hasta=...` whenever the visible range changes.
- Event color by scope:
  - Global → `#dc2626` (red-600)
  - Ubicación-only → `#9333ea` (purple-600)
  - Doctor-only → `#16a34a` (green-600)
  - Doctor+Ubicación → `#2563eb` (blue-600)
- Event title: `[scope label] · motivo (or "—")`.
- Click on event → opens `AdminExcepcionFormModal` in edit mode.
- Click on empty day → opens modal in create mode pre-filled with `fecha_inicio = clicked_day 00:00`, `fecha_fin = clicked_day 23:59`.
- Realtime subscription to `excepciones_horario` table → refetch on any change.

### 4. `AdminExcepcionesTabla.tsx`

- Filters bar (sticky): scope dropdown, doctor selector, ubicación selector, date-range pickers (`<input type="date">` native, two of them).
- Table columns: Scope (badge with color matching calendar), Doctor (name or "—"), Ubicación (name or "—"), Inicio (date+time in NI), Fin (date+time in NI), Motivo, Acciones (✏️ edit / 🗑️ delete).
- Empty state: "No hay excepciones que coincidan con los filtros".
- Pagination: 25 per page, same pattern as `AdminUsuarios`.
- Date formatting via `lib/datetime.ts` helpers (`formatDateTimeNI` for inicio/fin).

### 5. `AdminExcepcionFormModal.tsx`

- shadcn `Dialog` component.
- Fields:
  - **Scope (radio group)**: Global / Por doctor / Por ubicación / Por doctor + ubicación.
  - **Doctor selector** (shown when scope includes doctor): combobox listing all active doctors with their ubicación.
  - **Ubicación selector** (shown when scope includes ubicación): select listing all active ubicaciones. When scope is "Doctor + Ubicación" and a doctor is selected, this is pre-filled with the doctor's primary ubicación and read-only.
  - **Fecha inicio** (`<input type="datetime-local">`).
  - **Fecha fin** (`<input type="datetime-local">`).
  - **Motivo** (textarea, optional, 280-char limit).
- Validation: `fecha_fin > fecha_inicio` enforced client-side before submit (helpful error inline). Server enforces too.
- Submit: POST or PUT depending on create-vs-edit. Wait — the spec doesn't include PUT. **Edit-in-place** is achieved by DELETE + POST in the same handler to keep the API minimal. (Audit log shows both actions; acceptable for an admin tool used rarely.)
- Toast on success/failure via `sonner`.

### 6. UX polish in `AdminDoctorTabHorarios.tsx`

- Under the section B header, add a small text link:
  > "Ver excepciones globales y por ubicación que también afectan a este doctor →"

  The link goes to `/admin/excepciones?doctor_id={this_doctor_id}&scope=all`. The query string pre-applies the doctor filter so the global view shows everything affecting this doctor in one click.
- An info tooltip near the section B title clarifies the multi-scope behavior.

### 7. Sidebar nav

In `components/dashboard/Sidebar.tsx`, add a new entry under the `Citas` admin nav group:

```ts
{ key: "excepciones", href: "/admin/excepciones", icon: CalendarX, ... }
```

Visible only when `rol === 'admin'`. Positioned between "Calendario" and "Registro" (or wherever feels natural — the implementer decides if the order is non-obvious; the spec doesn't pin it).

### 8. i18n

New nested keys under `Dashboard.admin.excepciones.*`:
- `title`, `subtitle`
- `newBtn`, `editBtn`, `deleteBtn`, `deleteConfirm`
- `view.calendario`, `view.tabla`
- `scope.global`, `scope.doctor`, `scope.ubicacion`, `scope.doctorYUbicacion`, `scope.all`
- `col.scope`, `col.doctor`, `col.ubicacion`, `col.inicio`, `col.fin`, `col.motivo`, `col.acciones`
- `filter.scope`, `filter.doctor`, `filter.ubicacion`, `filter.desde`, `filter.hasta`, `filter.todos`
- `form.scopeLabel`, `form.fechaInicio`, `form.fechaFin`, `form.motivo`, `form.motivoPlaceholder`
- `form.validation.endBeforeStart`
- `empty`, `loading`, `errorCargar`
- `toast.creado`, `toast.eliminado`, `toast.errorCrear`, `toast.errorEliminar`
- `seeGlobalLink`, `multiScopeTooltip`

Both `messages/es.json` and `messages/en.json` updated in lockstep.

## Error handling

- Server endpoints return `{ error: <message> }` with appropriate HTTP status (400 validation, 403 forbidden, 500 internal). Client maps these to toasts.
- Form validation errors (end before start, both date fields empty) render inline below the field.
- Network errors during fetch → toast `t("toast.errorCargar")`, list shows empty state.

## Realtime

- The migration adds `excepciones_horario` to `supabase_realtime` (see SQL section above).
- The calendar view subscribes to the table.
- On INSERT/UPDATE/DELETE event → refetch the current visible range.

## Testing

No automated test suite per CLAUDE.md. Verification = `pnpm build` (TypeScript) + manual QA.

Manual QA matrix:

| Scope | Create | Verify behavior |
|---|---|---|
| Global | `{ doctor_id: null, ubicacion_id: null }` | Member wizard cannot book ANY doctor in that range. |
| Doctor-only | `{ doctor_id: X, ubicacion_id: null }` | Member cannot book doctor X. Other doctors fine. |
| Ubicación-only | `{ doctor_id: null, ubicacion_id: Y }` | Member cannot book ANY doctor in clinic Y. Other clinics fine. |
| Doctor+Ubicación | `{ doctor_id: X, ubicacion_id: Y }` | Member cannot book doctor X at clinic Y. Same doctor X at clinic Z still bookable. |

Plus: toggle calendar↔tabla, filters apply correctly, edit-in-place works (DELETE+POST round-trip), delete with confirmation, realtime updates from another browser tab.

## Out of scope

- Showing exceptions as background events on the existing `/admin/citas` calendar (would require event merging in the citas calendar; defer).
- `empresa_admin` role being able to manage exceptions (still admin-only — exceptions cross empresa boundaries).
- Recurring exceptions (weekly closures, etc.). Manual range creation for now.
- Notifying members whose existing citas fall inside a newly-created exception. Admin must reach out manually.
- Soft delete / archive of historical exceptions. Hard delete only.

## Branch + PR

- Branch: `feat/admin-excepciones-horario` (already created at HEAD `cf0fcef`).
- Single PR with ~8 commits (one per logical chunk: SQL migration, 3 endpoints, 4 frontend components/files, i18n, polish, sidebar).
- Migration filename: `supabase/migrations/20260528120000_excepciones_ubicacion_scope.sql`.

## Self-review checklist

- ✅ Spec covers all 4 user-selected scope items (global, view, ubicacion-fix, UX polish).
- ✅ Backwards-compat: legacy per-doctor endpoints remain, UI unchanged.
- ✅ SQL migration is single transaction, idempotent via `CREATE OR REPLACE`, comments why GRANT is preserved.
- ✅ Edit-in-place via DELETE+POST is documented honestly as a trade-off vs. introducing PUT.
- ✅ Sidebar placement decided (under Citas group).
- ✅ Realtime publication explicitly added in the SQL migration (verified table is currently NOT in the publication).
- ✅ Date handling uses centralized `lib/datetime.ts` helpers established in PR #39.
- ✅ Manual QA matrix covers all 4 scope behaviors end-to-end.
