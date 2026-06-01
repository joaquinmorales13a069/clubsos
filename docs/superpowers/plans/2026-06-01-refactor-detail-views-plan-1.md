# Refactor detail views — Plan 1 (foundation, bug fixes, pilot Usuarios)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the SQL migrations + edge function changes that fix the past-cita cancellation bug and auto-complete past confirmed citas; reorganize the member home so `CredentialCard` and `MisServiciosCubiertos` share a row on md+; and establish the parallel-route + split-pane pattern with `admin/usuarios` as the validated pilot.

**Architecture:** Three-layer fix for past citas (UI guard + RPC rejection + `pg_cron` auto-complete with a new `auto_completado` event type). Parallel routes (`@list` + `@detail` slots) under `app/[locale]/(dashboard)/dashboard/admin/usuarios/`, hosted by a `SplitPaneLayout` shared component. Plan 2 will repeat the pilot pattern across the remaining 9 resources.

**Tech Stack:** Next.js 16 App Router (parallel routes, Server Actions), React 19, TypeScript, Tailwind CSS v4, Supabase (Postgres + `pg_cron` + RLS + edge functions), next-intl, sonner, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-01-refactor-detail-views-design.md`

**Branch:** `refactor/detail-views-and-fixes` (already created)

**Note on testing:** No test suite exists in this repo (`CLAUDE.md` confirms). Verification per task uses `pnpm build`, `pnpm lint`, and manual UI/SQL checks. Skip TDD steps.

---

## Phase A — SQL migrations (past-cita fixes)

### Task 1: Migration — block cancelling past citas in `cancelar_cita`

**Files:**
- Create: `supabase/migrations/20260601120000_block_cancel_past_citas.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Reject cancellation attempts on citas whose fecha_hora_cita is already in the past.
-- Defense in depth: the UI also hides the cancel button, but the RPC must enforce it.

CREATE OR REPLACE FUNCTION public.cancelar_cita(
  p_cita_id uuid,
  p_motivo  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cita                    public.citas%ROWTYPE;
  v_actor_id                uuid;
  v_actor_rol               text;
  v_ventana_horas           int;
  v_horas_hasta_cita        numeric;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT rol INTO v_actor_rol FROM public.users WHERE id = v_actor_id;

  SELECT * INTO v_cita
  FROM public.citas
  WHERE id = p_cita_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CITA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- New guard: past citas cannot be cancelled
  IF v_cita.fecha_hora_cita < now() THEN
    RAISE EXCEPTION 'CITA_YA_PASO' USING ERRCODE = 'P0001';
  END IF;

  -- Already-terminal states cannot be cancelled
  IF v_cita.estado_sync IN ('cancelado', 'rechazado', 'completado') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  -- Role-based access: admin can always cancel; otherwise the actor must be the patient
  -- or the cita's owner (titular). empresa_admin may cancel citas of users in their empresa.
  IF v_actor_rol = 'admin' THEN
    NULL; -- allowed
  ELSIF v_actor_rol = 'empresa_admin' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = v_cita.paciente_id
        AND u.empresa_id = (SELECT empresa_id FROM public.users WHERE id = v_actor_id)
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_cita.paciente_id <> v_actor_id AND v_cita.usuario_id <> v_actor_id THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;

    -- Members are subject to the cancellation window
    SELECT ventana_cancelacion_horas
      INTO v_ventana_horas
      FROM public.configuracion_sistema
     LIMIT 1;
    v_ventana_horas := COALESCE(v_ventana_horas, 24);

    v_horas_hasta_cita := EXTRACT(EPOCH FROM (v_cita.fecha_hora_cita - now())) / 3600.0;
    IF v_horas_hasta_cita < v_ventana_horas THEN
      RAISE EXCEPTION 'CANCEL_TOO_LATE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.citas
     SET estado_sync         = 'cancelado',
         motivo_cancelacion  = p_motivo,
         updated_at          = now()
   WHERE id = p_cita_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_cita(uuid, text) TO authenticated;
```

- [ ] **Step 2: Apply locally / to remote**

Run: `supabase db push`
Expected: migration applied without errors.

- [ ] **Step 3: Manual SQL verification**

Open the Supabase SQL editor (or `psql`). Insert a `confirmado` cita with `fecha_hora_cita = now() - interval '1 hour'`. Then run:

```sql
SELECT public.cancelar_cita('<id>', 'test');
```

Expected: `ERROR: CITA_YA_PASO`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260601120000_block_cancel_past_citas.sql
git commit -m "feat(citas): block cancellation of past citas in cancelar_cita RPC"
```

---

### Task 2: Migration — `cita_eventos.auto_completado` event type

**Files:**
- Create: `supabase/migrations/20260601120100_cita_eventos_auto_completado.sql`

The trigger `tr_cita_estado_change` enqueues notification events into `cita_eventos.evento` (text column today). Add a new value `auto_completado` and prepare a session-local GUC the trigger reads to distinguish auto-completed transitions from manual ones.

- [ ] **Step 1: Inspect current trigger**

Run:
```bash
grep -rn "tr_cita_estado_change\|cita_eventos" supabase/migrations/ | head -20
```
Use the result to identify the latest definition of the trigger function (likely named `enqueue_cita_evento` or similar). Open that file to confirm the current `CASE`/`IF` mapping.

- [ ] **Step 2: Write the migration**

Replace `<trigger_fn_name>` below with the actual function name found in Step 1. If the existing function is `enqueue_cita_evento_fn`, keep that and just extend it.

```sql
-- Add `auto_completado` event type emitted when a cita is completed by the
-- background job auto_complete_past_citas(). Detected via a session-local GUC
-- the job sets before its UPDATE.

CREATE OR REPLACE FUNCTION public.enqueue_cita_evento_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auto_flag text;
  v_evento    text;
BEGIN
  -- Only react to state transitions
  IF TG_OP = 'UPDATE' AND NEW.estado_sync = OLD.estado_sync THEN
    RETURN NEW;
  END IF;

  v_auto_flag := current_setting('clubsos.auto_complete_run', true);

  IF NEW.estado_sync = 'completado' AND v_auto_flag = 'true' THEN
    v_evento := 'auto_completado';
  ELSIF TG_OP = 'INSERT' THEN
    v_evento := 'creada';
  ELSE
    v_evento := CASE NEW.estado_sync
      WHEN 'confirmado' THEN 'confirmada'
      WHEN 'rechazado'  THEN 'rechazada'
      WHEN 'cancelado'  THEN 'cancelada'
      WHEN 'completado' THEN 'completado'
      ELSE NEW.estado_sync
    END;
  END IF;

  INSERT INTO public.cita_eventos (cita_id, evento, intentos, payload)
  VALUES (NEW.id, v_evento, 0, NULL);

  RETURN NEW;
END;
$$;
```

- [ ] **Step 3: Apply**

Run: `supabase db push`
Expected: migration applied.

- [ ] **Step 4: Verify**

```sql
-- In SQL editor:
SET LOCAL clubsos.auto_complete_run = 'true';
UPDATE public.citas SET estado_sync = 'completado' WHERE id = '<some confirmado cita>';
SELECT evento FROM public.cita_eventos ORDER BY id DESC LIMIT 1;
```

Expected: `auto_completado`. Run the same UPDATE in a fresh transaction without the SET — expect `completado` (manual).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260601120100_cita_eventos_auto_completado.sql
git commit -m "feat(citas): emit auto_completado event when transition is automated"
```

---

### Task 3: Migration — `auto_complete_past_citas` + `pg_cron` schedule

**Files:**
- Create: `supabase/migrations/20260601120200_auto_complete_past_citas.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Background job: every 15 minutes, mark `confirmado` citas whose
-- fecha_hora_cita is older than 2 hours as `completado`. The 2h buffer
-- prevents closing citas still in progress. Sets a session-local GUC so the
-- trigger `enqueue_cita_evento_fn` emits the `auto_completado` event type
-- (handled separately by the edge function).

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.auto_complete_past_citas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  PERFORM set_config('clubsos.auto_complete_run', 'true', true);

  UPDATE public.citas
     SET estado_sync = 'completado',
         updated_at  = now()
   WHERE estado_sync     = 'confirmado'
     AND fecha_hora_cita < now() - interval '2 hours';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- Idempotent schedule registration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-complete-past-citas') THEN
    PERFORM cron.unschedule('auto-complete-past-citas');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-complete-past-citas',
  '*/15 * * * *',
  $$SELECT public.auto_complete_past_citas();$$
);
```

- [ ] **Step 2: Apply**

Run: `supabase db push`
Expected: migration applied; `pg_cron` extension already present in Supabase managed projects.

- [ ] **Step 3: Verify**

```sql
SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'auto-complete-past-citas';
```
Expected: one row with `*/15 * * * *`.

Insert a test cita with `fecha_hora_cita = now() - interval '3 hours'`, `estado_sync = 'confirmado'`. Then run manually:
```sql
SELECT public.auto_complete_past_citas();
```
Expected: returns `1`. Re-query the cita: `estado_sync = 'completado'`. Check `cita_eventos`: last row for that cita has `evento = 'auto_completado'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260601120200_auto_complete_past_citas.sql
git commit -m "feat(citas): pg_cron job to auto-complete past confirmed citas"
```

---

## Phase B — App-side error map + edge function

### Task 4: Add `CITA_YA_PASO` to `lib/citas/errors.ts`

**Files:**
- Modify: `lib/citas/errors.ts`

- [ ] **Step 1: Update the type union and mapping**

In `lib/citas/errors.ts`, add `"CITA_YA_PASO"` to the `CitaErrorCode` union (alphabetically between `CANCEL_TOO_LATE` and `INVALID_STATE_TRANSITION` works fine). Then add to `MAPPING`:

```ts
CITA_YA_PASO: { status: 409, i18nKey: "Errors.citas.cita_ya_paso" },
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: build succeeds. If any consumer does an exhaustive switch on `CitaErrorCode`, TypeScript will flag the missing case — handle it.

- [ ] **Step 3: Commit**

```bash
git add lib/citas/errors.ts
git commit -m "feat(citas): map CITA_YA_PASO error to HTTP 409"
```

---

### Task 5: Edge function — handle `auto_completado` event

**Files:**
- Modify: `supabase/functions/procesar_eventos_cita/index.ts`

The current `switch (evt.evento)` covers `creada`, `confirmada`, `rechazada`, `cancelada`, `recordatorio_24h`. Add `auto_completado` which writes only the in-app notification — no WhatsApp template, no email.

- [ ] **Step 1: Locate the switch and existing in-app notification helper**

Run:
```bash
grep -n "notificaciones\|case \"" supabase/functions/procesar_eventos_cita/index.ts | head -40
```

Identify the helper that inserts into `public.notificaciones` (if there isn't one, you'll inline a single insert). Confirm the schema columns: `usuario_id`, `tipo`, `titulo`, `mensaje`, `cita_id`, `leida`, `created_at`.

- [ ] **Step 2: Add the case**

Add this block inside the `switch (evt.evento)`, before the `default` branch (replace `<getCitaDetalle>` with the existing helper used by other cases, e.g. `fetchCitaDetalle`):

```ts
case "auto_completado": {
  const cita = await fetchCitaDetalle(supabase, evt.cita_id);
  if (!cita || !cita.paciente_id) {
    return { ok: true };
  }
  await supabase.from("notificaciones").insert({
    usuario_id: cita.paciente_id,
    tipo:       "cita_completada",
    titulo:     "Tu cita fue marcada como completada",
    mensaje:    `Tu cita del ${formatFechaNI(cita.fecha_hora_cita)} ha finalizado. ¡Esperamos verte pronto!`,
    cita_id:    evt.cita_id,
    leida:      false,
  });
  return { ok: true };
}
```

If `fetchCitaDetalle` is named differently in the file, reuse whatever the `cancelada` / `confirmada` cases use to look up the cita.

- [ ] **Step 3: Deploy the function**

Run: `supabase functions deploy procesar_eventos_cita`
Expected: deploy succeeds. Check logs for syntax errors.

- [ ] **Step 4: End-to-end verification**

In SQL editor: insert a past `confirmado` cita, run `SELECT public.auto_complete_past_citas();`, then wait for the cron tick (or invoke `procesar_eventos_cita` manually via `supabase functions invoke`). Expected: a row appears in `public.notificaciones` for the patient; **no** WhatsApp dispatch and **no** Resend email logged.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/procesar_eventos_cita/index.ts
git commit -m "feat(edge): in-app notification for auto_completado citas (no WA/email)"
```

---

## Phase C — Home reorganization + ProximaCita filter

### Task 6: Add `.gte()` filter to the home cita query

**Files:**
- Modify: `app/[locale]/(dashboard)/dashboard/page.tsx:42-47`

- [ ] **Step 1: Edit the query**

Replace the cita query in the `Promise.all(...)` block with:

```ts
// Next upcoming appointment (pendiente or confirmado), strictly in the future
supabase
  .from("citas")
  .select("id, fecha_hora_cita, estado_sync, servicio_asociado")
  .in("estado_sync", ["pendiente", "confirmado"])
  .gte("fecha_hora_cita", new Date().toISOString())
  .order("fecha_hora_cita", { ascending: true })
  .limit(1)
  .maybeSingle(),
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

Start `pnpm dev`. Log in as a member with a past `confirmado` cita and no future cita. Open `/es/dashboard`. Expected: `ProximaCitaCard` shows the empty state, **not** the past cita.

- [ ] **Step 4: Commit**

```bash
git add app/[locale]/\(dashboard\)/dashboard/page.tsx
git commit -m "fix(home): exclude past citas from ProximaCitaCard query"
```

---

### Task 7: Side-by-side `CredentialCard` + `MisServiciosCubiertos` on md+

**Files:**
- Modify: `app/[locale]/(dashboard)/dashboard/page.tsx` (the JSX after `MfaBanner`/greeting)
- Modify: `components/dashboard/miembro/MisServiciosCubiertos.tsx`

- [ ] **Step 1: Update home layout JSX**

Replace the block:
```tsx
<CredentialCard ... />
<QuickActions locale={locale} />
<MisServiciosCubiertos userId={user.id} />
```

with:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
  <CredentialCard
    id={profile?.id ?? ""}
    nombreCompleto={profile?.nombre_completo ?? "—"}
    empresaNombre={empresas?.nombre ?? null}
    estado={(profile?.estado as "activo" | "inactivo" | "pendiente") ?? "pendiente"}
    sexo={(profile?.sexo as "masculino" | "femenino") ?? null}
    fechaNacimiento={profile?.fecha_nacimiento ?? null}
  />
  <MisServiciosCubiertos userId={user.id} />
</div>

<QuickActions locale={locale} />
```

(Remove the standalone `CredentialCard` and `MisServiciosCubiertos` lines that were above/below — they now live inside the new grid.)

- [ ] **Step 2: Adjust `MisServiciosCubiertos` for shared-row sizing**

Open `components/dashboard/miembro/MisServiciosCubiertos.tsx`. On the root container element, add `h-full` so the card stretches to the credential's height in md+. On the inner list (the scrollable area of services), add `md:max-h-[280px] md:overflow-y-auto`. Keep the sm behaviour unchanged (no max-height, full-width). If the file does not currently scope its own max height, this is purely additive.

- [ ] **Step 3: Manual verification**

`pnpm dev`. Inspect `/es/dashboard` at md (≥768px) and below 768px. Expected: md+ shows credential and services side by side, equal heights; sm stacks them.

- [ ] **Step 4: Commit**

```bash
git add app/[locale]/\(dashboard\)/dashboard/page.tsx components/dashboard/miembro/MisServiciosCubiertos.tsx
git commit -m "feat(home): pair CredentialCard with MisServiciosCubiertos on md+"
```

---

## Phase D — i18n keys

### Task 8: Add new translation keys for errors, badges, shared shells

**Files:**
- Modify: `messages/es.json`
- Modify: `messages/en.json`

- [ ] **Step 1: Add keys to both files**

In `messages/es.json` under the appropriate namespace (`Errors.citas` already exists), add:
```json
"cita_ya_paso": "La cita ya pasó; no se puede cancelar."
```

Under a top-level `Dashboard.citas.detalle` namespace (create the nested object if missing), add:
```json
"finalizadaNoCancelable": "Cita finalizada — no se puede cancelar."
```

Under a new top-level `Dashboard.shared` namespace, add:
```json
"detailEmpty": "Selecciona un registro de la lista para ver el detalle.",
"detailEmptyHint": "Tu selección se mostrará aquí.",
"back": "Volver"
```

In `messages/en.json` mirror with:
```json
"cita_ya_paso": "The appointment has already passed; it cannot be cancelled.",
"finalizadaNoCancelable": "Past appointment — cannot be cancelled.",
"detailEmpty": "Select a record from the list to view details.",
"detailEmptyHint": "Your selection will appear here.",
"back": "Back"
```

- [ ] **Step 2: Validate JSON**

Run: `pnpm build`
Expected: build succeeds (next-intl validates keys at compile time when used; raw JSON parses).

- [ ] **Step 3: Commit**

```bash
git add messages/es.json messages/en.json
git commit -m "i18n: add shared detail-panel, back, and past-cita error keys"
```

---

## Phase E — Interim UI guard for AdminCitaDetalleModal

The full modal-to-route refactor for `admin/citas` happens in Plan 2. While the modal still exists, the cancel button must respect the past-cita guard.

### Task 9: Hide cancel button in `AdminCitaDetalleModal` when cita is past

**Files:**
- Modify: `components/dashboard/admin/AdminCitaDetalleModal.tsx`

- [ ] **Step 1: Add the guard near the cancel button**

Locate the JSX that renders the "Cancelar cita" button. Above the button, compute:

```tsx
const esPasada = new Date(cita.fecha_hora_cita).getTime() < Date.now();
const esCancelable =
  !esPasada &&
  !["cancelado", "rechazado", "completado"].includes(cita.estado_sync);
```

Then wrap the button:
```tsx
{esCancelable ? (
  <Button variant="destructive" onClick={handleCancelar}>
    <CircleSlash className="w-4 h-4 mr-1.5" />
    {t("cancelar")}
  </Button>
) : esPasada ? (
  <span className="inline-flex items-center gap-1.5 text-xs font-roboto text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
    <Clock className="w-3.5 h-3.5" />
    {tCitas("finalizadaNoCancelable")}
  </span>
) : null}
```

(`tCitas` comes from `useTranslations("Dashboard.citas.detalle")` — add the hook at the top of the component if not already present.)

- [ ] **Step 2: Also apply to the empresa modal**

Open `components/dashboard/empresa/DetalleModal.tsx` (or whatever modal empresa_admin uses to view cita detail) and apply the same guard around its cancel button.

If the file you find does not deal with cita cancellation, skip it — only patch files that render a "Cancelar cita" CTA.

- [ ] **Step 3: Manual verification**

`pnpm dev`. As admin, open the calendar, click an event for a past cita. Expected: no "Cancelar cita" button; in its place a muted "Cita finalizada — no se puede cancelar" pill.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/admin/AdminCitaDetalleModal.tsx components/dashboard/empresa/DetalleModal.tsx
git commit -m "fix(citas): hide cancel button for past citas in detail modals"
```

---

## Phase F — Shared split-pane components

### Task 10: Create `SplitPaneLayout`

**Files:**
- Create: `components/dashboard/shared/SplitPaneLayout.tsx`

This component is rendered by each resource's `layout.tsx` and receives the two parallel-route slots as `list` and `detail`. It applies the responsive grid + sticky behaviour.

- [ ] **Step 1: Create the file**

```tsx
/**
 * SplitPaneLayout — shared container for list + detail parallel routes.
 *
 * - lg+ : 3-col list / 1-col sticky detail panel
 * - md  : single column, list on top, detail below
 * - sm  : list hidden when `detailActive`; only the detail panel shows
 *
 * Server Component. The `detailActive` flag must be computed by the host layout
 * from the URL segments (e.g. `useSelectedLayoutSegment` in a client wrapper, or
 * by reading params in the host server layout).
 */
import { ReactNode } from "react";

interface SplitPaneLayoutProps {
  list: ReactNode;
  detail: ReactNode;
  /** When true on small screens, only the detail panel is shown. */
  detailActive?: boolean;
}

export default function SplitPaneLayout({
  list,
  detail,
  detailActive = false,
}: SplitPaneLayoutProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
      {/* List slot */}
      <div
        className={`
          ${detailActive ? "hidden md:block" : "block"}
          lg:col-span-3
        `}
      >
        {list}
      </div>

      {/* Detail slot */}
      <aside
        className={`
          ${detailActive ? "block" : "hidden md:block"}
          lg:col-span-1 lg:sticky lg:top-20
        `}
      >
        {detail}
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/shared/SplitPaneLayout.tsx
git commit -m "feat(shared): SplitPaneLayout for list+detail parallel routes"
```

---

### Task 11: Create `DetailPanel`

**Files:**
- Create: `components/dashboard/shared/DetailPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
/**
 * DetailPanel — card shell for the detail slot of a split-pane page.
 * Glassmorphism, rounded-2xl, sticky header with title + optional close link.
 *
 * Server Component (close link is a plain <Link>).
 */
import { ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";

interface DetailPanelProps {
  title: string;
  /** When provided, an X icon links here (used for desktop "close detail"). */
  closeHref?: string;
  /** Optional header right-side actions (badges, secondary buttons). */
  actions?: ReactNode;
  children: ReactNode;
}

export default function DetailPanel({
  title,
  closeHref,
  actions,
  children,
}: DetailPanelProps) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white/60">
        <h2 className="text-base font-poppins font-semibold text-gray-900 truncate">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {actions}
          {closeHref && (
            <Link
              href={closeHref}
              className="hidden lg:inline-flex p-1 rounded-full text-neutral hover:bg-gray-100"
              aria-label="Cerrar detalle"
            >
              <X className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
      <div className="p-4 max-h-[calc(100vh-10rem)] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/shared/DetailPanel.tsx
git commit -m "feat(shared): DetailPanel card shell"
```

---

### Task 12: Create `DetailEmptyState`

**Files:**
- Create: `components/dashboard/shared/DetailEmptyState.tsx`

- [ ] **Step 1: Create the file**

```tsx
/**
 * DetailEmptyState — placeholder shown in the detail slot when no record is
 * selected. Renders nothing on small screens (the list takes the whole view).
 *
 * Server Component.
 */
import { getTranslations } from "next-intl/server";
import { Inbox } from "lucide-react";

export default async function DetailEmptyState() {
  const t = await getTranslations("Dashboard.shared");

  return (
    <div className="hidden md:flex flex-col items-center justify-center text-center p-8 bg-white/60 rounded-2xl border border-dashed border-gray-200 min-h-[280px]">
      <Inbox className="w-10 h-10 text-gray-300 mb-3" />
      <p className="text-sm font-roboto font-medium text-gray-600">
        {t("detailEmpty")}
      </p>
      <p className="text-xs font-roboto text-neutral mt-1">
        {t("detailEmptyHint")}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/shared/DetailEmptyState.tsx
git commit -m "feat(shared): DetailEmptyState placeholder"
```

---

### Task 13: Create `BackButton`

**Files:**
- Create: `components/dashboard/shared/BackButton.tsx`

- [ ] **Step 1: Create the file**

```tsx
/**
 * BackButton — small-screen "Volver" affordance shown above DetailPanel
 * content to return to the list view. Hidden on lg+ (the list is always
 * visible there).
 *
 * Client Component because it uses the next/navigation router for back.
 */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";

interface BackButtonProps {
  /** Where "Volver" goes — typically the resource list root, e.g. /es/dashboard/admin/usuarios. */
  href: string;
}

export default function BackButton({ href }: BackButtonProps) {
  const t = useTranslations("Dashboard.shared");
  return (
    <Link
      href={href}
      className="lg:hidden inline-flex items-center gap-1 text-sm font-roboto text-secondary hover:text-secondary/80 mb-3"
    >
      <ChevronLeft className="w-4 h-4" />
      {t("back")}
    </Link>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/shared/BackButton.tsx
git commit -m "feat(shared): BackButton for mobile detail-panel navigation"
```

---

## Phase G — Pilot: admin/usuarios with parallel routes

The existing route is `app/[locale]/(dashboard)/dashboard/admin/usuarios/page.tsx` which renders `<AdminUsuarios />` (table + inline `EditarUsuarioAdminModal` + opens `DetalleModalAdmin` on row click). We restructure to parallel routes and move the detail/edit panels into routes.

### Task 14: Restructure `admin/usuarios` to parallel-route layout

**Files:**
- Delete: `app/[locale]/(dashboard)/dashboard/admin/usuarios/page.tsx` (replaced by parallel routes)
- Create: `app/[locale]/(dashboard)/dashboard/admin/usuarios/layout.tsx`
- Create: `app/[locale]/(dashboard)/dashboard/admin/usuarios/@list/page.tsx`
- Create: `app/[locale]/(dashboard)/dashboard/admin/usuarios/@detail/default.tsx`

- [ ] **Step 1: Delete the existing `page.tsx`**

```bash
git rm app/[locale]/\(dashboard\)/dashboard/admin/usuarios/page.tsx
```

(Parallel routes use `@slot/page.tsx`; the route-level `page.tsx` is no longer needed.)

- [ ] **Step 2: Create the `layout.tsx`**

The server layout runs the admin-role gate, then delegates to a small client wrapper that uses `useSelectedLayoutSegment("detail")` to decide whether the list or the detail panel should be visible on small screens.

```tsx
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import SplitPaneClient from "./_split-pane-client";

interface UsuariosLayoutProps {
  list: React.ReactNode;
  detail: React.ReactNode;
}

export default async function UsuariosLayout({
  list,
  detail,
}: UsuariosLayoutProps) {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return <SplitPaneClient list={list} detail={detail} />;
}
```

- [ ] **Step 3: Create the small client wrapper**

Create `app/[locale]/(dashboard)/dashboard/admin/usuarios/_split-pane-client.tsx`:

```tsx
"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import SplitPaneLayout from "@/components/dashboard/shared/SplitPaneLayout";
import type { ReactNode } from "react";

interface Props {
  list: ReactNode;
  detail: ReactNode;
}

export default function SplitPaneClient({ list, detail }: Props) {
  // null = default.tsx (no detail segment); otherwise we have an active detail route.
  const detailSegment = useSelectedLayoutSegment("detail");
  const detailActive = detailSegment !== null;
  return <SplitPaneLayout list={list} detail={detail} detailActive={detailActive} />;
}
```

- [ ] **Step 4: Create the `@list/page.tsx`**

This wraps the existing `AdminUsuarios` component (the table). We need it to render only the table-and-filters (no modals, no row-click handler that opens modals — clicking a row will navigate to `/admin/usuarios/[id]`). For the pilot, leave `AdminUsuarios` as-is initially and adapt it in the next task.

```tsx
import AdminUsuarios from "@/components/dashboard/admin/AdminUsuarios";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function UsuariosListPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  return <AdminUsuarios userId={user.id} />;
}
```

- [ ] **Step 5: Create the `@detail/default.tsx`**

```tsx
import DetailEmptyState from "@/components/dashboard/shared/DetailEmptyState";

export default function UsuariosDetailDefault() {
  return <DetailEmptyState />;
}
```

- [ ] **Step 6: Verify the route still loads**

Run: `pnpm build`
Expected: build succeeds.

Run: `pnpm dev`. Visit `/es/dashboard/admin/usuarios`. Expected: existing table still renders on the left; empty-state card visible on the right at lg+.

- [ ] **Step 7: Commit**

```bash
git add -A app/[locale]/\(dashboard\)/dashboard/admin/usuarios/
git commit -m "refactor(admin/usuarios): scaffold parallel routes + split-pane layout"
```

---

### Task 15: Adapt `AdminUsuarios` table rows to navigate to `/[id]`

**Files:**
- Modify: `components/dashboard/admin/AdminUsuarios.tsx`

The current implementation opens `DetalleModalAdmin` from a row click. Replace that with a `<Link>` to the new detail route.

- [ ] **Step 1: Replace row-click handler with Link wrapping**

Locate the `<TableRow>` (or `<tr>`) inside the table render. Today it likely has `onClick={() => setUsuarioSeleccionado(usuario)}` and conditional modal rendering at the bottom.

Replace the row markup so that each clickable cell becomes a `<Link href={\`/${locale}/dashboard/admin/usuarios/${u.id}\`}>` wrapper, and add `data-active={u.id === activeId ? "true" : undefined}` to the row. Compute `activeId` via the client hook:

```tsx
"use client";
// (file is already client; keep the directive)
import { useParams } from "next/navigation";
// ...
const params = useParams<{ id?: string }>();
const activeId = params?.id ?? null;
```

Add row styling:
```tsx
<tr
  data-active={u.id === activeId ? "true" : undefined}
  className="border-b last:border-b-0 hover:bg-gray-50 data-[active=true]:bg-primary/5 data-[active=true]:border-l-2 data-[active=true]:border-primary"
>
  <td>
    <Link href={`/${locale}/dashboard/admin/usuarios/${u.id}`} className="block px-3 py-2">
      {u.nombre_completo}
    </Link>
  </td>
  ...
</tr>
```

- [ ] **Step 2: Remove the `DetalleModalAdmin` import and JSX**

Delete the `<DetalleModalAdmin ... />` render block at the bottom of the file and any state (`usuarioSeleccionado`, `setUsuarioSeleccionado`) used solely to drive it. Keep `EditarUsuarioAdminModal` state for now — the edit flow will move to a route in the next task but is out of pilot scope. Confirm at the top of the file the unused imports are removed.

- [ ] **Step 3: Type-check and run**

Run: `pnpm build`
Expected: succeeds. If `EditarUsuarioAdminModal` references something removed, restore it.

`pnpm dev`. Click a user row. Expected: URL changes to `/es/dashboard/admin/usuarios/<id>`; right panel will be blank for now (the `@detail/[id]/page.tsx` lands in the next task).

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/admin/AdminUsuarios.tsx
git commit -m "refactor(admin/usuarios): replace row-click modal with Link to /[id]"
```

---

### Task 16: Build `@detail/[id]/page.tsx` (read mode)

**Files:**
- Create: `app/[locale]/(dashboard)/dashboard/admin/usuarios/@detail/[id]/page.tsx`

This page replaces the read content of `DetalleModalAdmin`. Open the modal source first to copy the field layout, then port it into a server component using `DetailPanel`.

- [ ] **Step 1: Read the existing modal to identify the fields rendered**

Run:
```bash
grep -n "nombre_completo\|email\|telefono\|rol\|empresa" components/dashboard/admin/DetalleModalAdmin.tsx | head -30
```

Note the fields the modal shows (nombre, email, teléfono, rol, empresa, estado, fecha_nacimiento, contratos usage, etc.) and any nested queries.

- [ ] **Step 2: Create the page**

```tsx
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import AdminUsuarioContratosUsage from "@/components/dashboard/admin/AdminUsuarioContratosUsage";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function UsuarioDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.usuarios.detalle");

  const { data: usuario, error } = await supabase
    .from("users")
    .select("id, nombre_completo, email, telefono, rol, estado, fecha_nacimiento, empresas(nombre)")
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/admin/usuarios`);
  if (!usuario) notFound();

  const empresa = Array.isArray(usuario.empresas)
    ? usuario.empresas[0]?.nombre ?? null
    : (usuario.empresas as { nombre: string } | null)?.nombre ?? null;

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/usuarios`} />
      <DetailPanel
        title={usuario.nombre_completo ?? t("untitled")}
        closeHref={`/${locale}/dashboard/admin/usuarios`}
        actions={
          <Link
            href={`/${locale}/dashboard/admin/usuarios/${id}/editar`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary/80 px-3 py-1.5 rounded-full bg-secondary/5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("editar")}
          </Link>
        }
      >
        <dl className="space-y-3 text-sm font-roboto">
          <Field label={t("email")} value={usuario.email} />
          <Field label={t("telefono")} value={usuario.telefono} />
          <Field label={t("rol")} value={usuario.rol} />
          <Field label={t("estado")} value={usuario.estado} />
          <Field label={t("empresa")} value={empresa} />
          <Field
            label={t("fechaNacimiento")}
            value={usuario.fecha_nacimiento}
          />
        </dl>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <h3 className="text-sm font-poppins font-semibold text-gray-900 mb-2">
            {t("contratos")}
          </h3>
          <AdminUsuarioContratosUsage userId={id} />
        </div>
      </DetailPanel>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral">{label}</dt>
      <dd className="text-gray-900 text-right truncate max-w-[60%]">
        {value ?? "—"}
      </dd>
    </div>
  );
}
```

- [ ] **Step 3: Add i18n keys**

Add to `messages/es.json` (and mirror in `en.json`) under `Dashboard.admin.usuarios.detalle`:

```json
{
  "untitled": "Usuario",
  "editar": "Editar",
  "email": "Correo",
  "telefono": "Teléfono",
  "rol": "Rol",
  "estado": "Estado",
  "empresa": "Empresa",
  "fechaNacimiento": "Fecha de nacimiento",
  "contratos": "Servicios contratados"
}
```

English mirror with appropriate translations (`"Email"`, `"Phone"`, `"Role"`, `"Status"`, `"Company"`, `"Date of birth"`, `"Contracted services"`, `"User"`, `"Edit"`).

- [ ] **Step 4: Type-check and run**

Run: `pnpm build`
Expected: succeeds. If the `AdminUsuarioContratosUsage` component expects different props, adapt the call to match its actual signature (read the component if needed).

`pnpm dev`. Click a user in the list. Expected: detail panel populates with the user's fields; "Editar" link goes to `/...usuarios/<id>/editar` (404 expected for now — handled in Task 17); X icon closes back to the list.

- [ ] **Step 5: Commit**

```bash
git add app/[locale]/\(dashboard\)/dashboard/admin/usuarios/@detail/\[id\]/page.tsx messages/es.json messages/en.json
git commit -m "feat(admin/usuarios): @detail/[id] read panel replaces DetalleModalAdmin"
```

---

### Task 17: Build `@detail/[id]/editar/page.tsx` with Server Action

**Files:**
- Create: `app/[locale]/(dashboard)/dashboard/admin/usuarios/@detail/[id]/editar/page.tsx`
- Create: `app/[locale]/(dashboard)/dashboard/admin/usuarios/@detail/[id]/editar/actions.ts`

This replaces the inline `EditarUsuarioAdminModal` defined in `AdminUsuarios.tsx`.

- [ ] **Step 1: Re-read the existing inline modal to copy the form fields**

Run:
```bash
sed -n '117,250p' components/dashboard/admin/AdminUsuarios.tsx
```

Identify the editable fields (likely `rol`, `empresa_id`, `estado`, etc.) and any validation logic (role/empresa change warnings).

- [ ] **Step 2: Create the Server Action**

`actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export interface ActualizarUsuarioState {
  error?: string;
}

export async function actualizarUsuarioAction(
  prevState: ActualizarUsuarioState,
  formData: FormData,
): Promise<ActualizarUsuarioState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (actor?.rol !== "admin") return { error: "FORBIDDEN" };

  const id          = String(formData.get("id") ?? "");
  const rol         = String(formData.get("rol") ?? "");
  const estado      = String(formData.get("estado") ?? "");
  const empresa_id  = String(formData.get("empresa_id") ?? "") || null;
  const locale      = String(formData.get("locale") ?? "es");

  const { error } = await supabase
    .from("users")
    .update({ rol, estado, empresa_id })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/${locale}/dashboard/admin/usuarios`);
  redirect(`/${locale}/dashboard/admin/usuarios/${id}`);
}
```

- [ ] **Step 3: Create the page**

`page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import EditarUsuarioForm from "./EditarUsuarioForm";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function EditarUsuarioPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.usuarios.editar");

  const [usuarioRes, empresasRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, nombre_completo, rol, estado, empresa_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("empresas")
      .select("id, nombre")
      .order("nombre", { ascending: true }),
  ]);

  if (!usuarioRes.data) notFound();

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/usuarios/${id}`} />
      <DetailPanel
        title={t("title")}
        closeHref={`/${locale}/dashboard/admin/usuarios/${id}`}
      >
        <EditarUsuarioForm
          usuario={usuarioRes.data}
          empresas={empresasRes.data ?? []}
          locale={locale}
        />
      </DetailPanel>
    </>
  );
}
```

- [ ] **Step 4: Create the client form**

`EditarUsuarioForm.tsx` (same folder):
```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useEffect } from "react";
import { actualizarUsuarioAction, type ActualizarUsuarioState } from "./actions";

interface Usuario {
  id: string;
  nombre_completo: string | null;
  rol: string | null;
  estado: string | null;
  empresa_id: string | null;
}

interface Empresa { id: string; nombre: string }

interface Props {
  usuario: Usuario;
  empresas: Empresa[];
  locale: string;
}

const ROLES   = ["admin", "empresa_admin", "miembro"] as const;
const ESTADOS = ["activo", "inactivo", "pendiente"] as const;

export default function EditarUsuarioForm({ usuario, empresas, locale }: Props) {
  const t = useTranslations("Dashboard.admin.usuarios.editar");
  const [state, formAction, pending] = useActionState<ActualizarUsuarioState, FormData>(
    actualizarUsuarioAction,
    {},
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id"     value={usuario.id} />
      <input type="hidden" name="locale" value={locale} />

      <Field label={t("nombre")}>
        <input
          value={usuario.nombre_completo ?? ""}
          disabled
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-500"
        />
      </Field>

      <Field label={t("rol")}>
        <select
          name="rol"
          defaultValue={usuario.rol ?? "miembro"}
          className="w-full px-3 py-2 rounded-lg border border-gray-200"
        >
          {ROLES.map(r => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
        </select>
      </Field>

      <Field label={t("estado")}>
        <select
          name="estado"
          defaultValue={usuario.estado ?? "activo"}
          className="w-full px-3 py-2 rounded-lg border border-gray-200"
        >
          {ESTADOS.map(s => <option key={s} value={s}>{t(`estados.${s}`)}</option>)}
        </select>
      </Field>

      <Field label={t("empresa")}>
        <select
          name="empresa_id"
          defaultValue={usuario.empresa_id ?? ""}
          className="w-full px-3 py-2 rounded-lg border border-gray-200"
        >
          <option value="">— {t("sinEmpresa")} —</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2 rounded-full bg-primary text-white font-semibold disabled:opacity-60"
      >
        {pending ? t("guardando") : t("guardar")}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 5: Add i18n keys**

Under `Dashboard.admin.usuarios.editar`:

```json
{
  "title": "Editar usuario",
  "nombre": "Nombre completo",
  "rol": "Rol",
  "estado": "Estado",
  "empresa": "Empresa",
  "sinEmpresa": "Sin empresa",
  "guardar": "Guardar cambios",
  "guardando": "Guardando…",
  "roles": {
    "admin": "Administrador",
    "empresa_admin": "Admin de empresa",
    "miembro": "Miembro"
  },
  "estados": {
    "activo": "Activo",
    "inactivo": "Inactivo",
    "pendiente": "Pendiente"
  }
}
```

English mirror.

- [ ] **Step 6: Remove the inline `EditarUsuarioAdminModal` from `AdminUsuarios.tsx`**

Replace whatever "Edit" CTA the row had with a `<Link>` to `/[locale]/dashboard/admin/usuarios/[id]/editar`. Delete the inline modal component (the function defined around line 126) and its rendering at the bottom. Remove the now-unused state hooks.

- [ ] **Step 7: Type-check and run**

Run: `pnpm build`
Expected: succeeds.

`pnpm dev`. Click "Editar" on a user's detail. Expected: form appears in the panel, submitting valid changes returns to `/[id]` read mode, list reflects the new role/estado. Toast shows on error.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(admin/usuarios): @detail/[id]/editar form + Server Action; drop inline modal"
```

---

## Phase H — Final verification

### Task 18: Plan-1 end-to-end verification + cleanup

**Files:** (no edits, verification only)

- [ ] **Step 1: Verify build + lint clean**

Run:
```bash
pnpm build && pnpm lint
```
Expected: both succeed with no new errors.

- [ ] **Step 2: Manual UI verification (member home)**

`pnpm dev`. Log in as a member. Verify:
- `/es/dashboard` shows `CredentialCard` + `MisServiciosCubiertos` side by side at lg/md ≥768px.
- Below 768px they stack.
- A user with only a past `confirmado` cita sees the empty state in `ProximaCitaCard`.

- [ ] **Step 3: Manual UI verification (admin/usuarios)**

Log in as admin. At `/es/dashboard/admin/usuarios`:
- Empty-state visible in the right panel on lg.
- Click a user → URL becomes `/admin/usuarios/<id>`, detail loads.
- Active row shows the bg/border highlight.
- Click "Editar" → form loads in the panel; submit → returns to read mode with updated fields.
- Resize to <md: clicking a user shows only the detail panel with "Volver" button.

- [ ] **Step 4: SQL verification (past-cita guards)**

In Supabase SQL editor:
- Insert a past `confirmado` cita; call `cancelar_cita` — expect `CITA_YA_PASO`.
- Run `SELECT public.auto_complete_past_citas();` — past cita becomes `completado`; `cita_eventos` has `auto_completado`.
- Wait for one cron tick (or check `cron.job_run_details` for the next `auto-complete-past-citas` run) — confirm the job runs without errors.

- [ ] **Step 5: Confirm in-app notification flow**

Invoke the edge function (Supabase dashboard → Edge Functions → procesar_eventos_cita → Invoke). Confirm:
- `public.notificaciones` has a new row for the auto-completed cita's patient.
- The function logs show no WhatsApp/Resend dispatch for `auto_completado`.

- [ ] **Step 6: Push the branch**

Do not open the PR yet — Plan 2 lands on the same branch.

```bash
git push -u origin refactor/detail-views-and-fixes
```

- [ ] **Step 7: Hand off to Plan 2**

Plan 2 (`docs/superpowers/plans/2026-06-01-refactor-detail-views-plan-2.md`, to be written next) will repeat the pilot pattern across the remaining 9 resources (empresas, doctores, servicios, ubicaciones, citas, beneficios, avisos, documentos, excepciones) and remove the legacy modal files.

---
