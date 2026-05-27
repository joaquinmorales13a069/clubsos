# Excepción Side-Effects + Doctor Notifications — Design

**Branch:** `feat/excepcion-side-effects-and-doctor-notif`
**Goal:** Make `excepciones_horario` close the loop with affected appointments (preview + auto-cancel + auto-notify), and extend the existing notification pipeline so doctors receive email + .ics when their appointments are confirmed and cancelled.

## Background

After merging PR #40, admin can manage `excepciones_horario` across four scopes. But two gaps remain:

1. **No visibility / no automatic handling of existing citas.** When admin creates an exception spanning a time window with active citas, those citas stay scheduled. Members never learn the cita is in conflict; admin has to manually find and contact each one.

2. **Doctors receive no email notifications.** The existing pipeline (`cita_eventos` table + `procesar_eventos_cita` edge function) sends email + .ics + WhatsApp + in-app to the patient on `confirmada` and `cancelada` events, but the doctor only sees changes when they (or admin) open the calendar. Doctors want the same `.ics` attachment so they can add the appointment to their personal calendar.

This PR fixes both.

## Decisions (already made in brainstorming)

- **Auto-cancel + auto-notify** chosen over manual flow. When admin creates an exception affecting N existing citas, those citas are cancelled automatically and the existing notification pipeline emails the patient with the cancellation reason. Mitigation against accidental mass-cancellation: a warning panel inside the form modal previews affected citas before submit.

- **Existing cancellation email pipeline is sufficient** for notifying patients. The migration only needs to set `motivo_cancelacion` and `estado_sync = 'cancelado'` on affected citas; the existing trigger `tr_cita_estado_change` writes the `cancelada` event, and the edge function emails the patient. No edge function changes required for the patient-side flow.

- **Doctor email goes on `confirmada` and `cancelada`** events (consistent with the patient flow that also emails on these two). Doctor does NOT get `creada` (pending) emails to avoid noise from yet-to-be-approved citas. Doctor does NOT get `recordatorio_24h` (out of scope; can add later if useful).

- **Admin still contacts patients via WhatsApp manually**. The warning panel reminds them. Auto-email handles the formal notification; WhatsApp is the human follow-up.

## Architecture

### Components touched

```
supabase/migrations/20260528180000_excepcion_cancel_cascade.sql       (new)
supabase/functions/procesar_eventos_cita/index.ts                      (modify)
supabase/functions/procesar_eventos_cita/lib/email.ts                  (modify if needed)
app/api/admin/excepciones/route.ts                                     (modify — POST now calls RPC)
app/api/admin/excepciones/preview-affected/route.ts                    (new — GET preview)
components/dashboard/admin/AdminExcepcionFormModal.tsx                 (modify — warning panel)
messages/es.json, messages/en.json                                     (modify — new keys)
```

### Data flow (auto-cancel chain)

```
Admin submits exception form
        │
        ▼
POST /api/admin/excepciones
        │
        ▼
RPC crear_excepcion_con_cancelaciones(...)
   1. INSERT INTO excepciones_horario
   2. UPDATE citas SET estado_sync='cancelado',
                       motivo_cancelacion='[Excepción: ...]',
                       cancelado_por=auth.uid(),
                       cancelado_at=NOW()
      WHERE <overlap match for this exception's scope>
   3. RETURN { excepcion_id, citas_canceladas_count }
        │
        ▼ trigger tr_cita_estado_change fires once per cancelled row
        │
        ▼
INSERT INTO cita_eventos (cita_id, evento='cancelada', payload={motivo})
        │
        ▼ pg_cron (every minute) or pg_net (in same txn)
        │
        ▼
procesar_eventos_cita edge function
   - email patient with .ics + motivo
   - whatsapp patient with cancel template
   - in-app notification
   - NEW: email doctor with cancellation summary
```

Existing patient-side notifications work **without any edge function change**. The edge function only needs an additive doctor-side email branch.

## Backend

### 1. SQL migration `20260528180000_excepcion_cancel_cascade.sql`

Adds a new RPC `crear_excepcion_con_cancelaciones` that wraps the INSERT + cascade UPDATE in a transaction. The migration also wraps the call in `SECURITY DEFINER` so the RLS-blind UPDATE works for admin only.

```sql
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
  v_user_id      UUID := auth.uid();
  v_user_rol     TEXT;
  v_excepcion_id UUID;
  v_motivo_cancel TEXT;
  v_count        INT;
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

  -- Insert the exception itself.
  INSERT INTO public.excepciones_horario (doctor_id, ubicacion_id, fecha_inicio, fecha_fin, motivo)
  VALUES (p_doctor_id, p_ubicacion_id, p_fecha_inicio, p_fecha_fin, p_motivo)
  RETURNING id INTO v_excepcion_id;

  -- Compose the cancellation reason that will be emailed to patients.
  v_motivo_cancel := CASE
    WHEN p_motivo IS NULL OR TRIM(p_motivo) = ''
      THEN 'Bloqueo administrativo del horario'
    ELSE 'Bloqueo administrativo: ' || p_motivo
  END;

  -- Cancel affected citas. The trigger tr_cita_estado_change writes one
  -- 'cancelada' event per row → edge function emails patient + (new) doctor.
  WITH affected AS (
    UPDATE public.citas c
    SET estado_sync        = 'cancelado'::public.estado_sync,
        motivo_cancelacion = v_motivo_cancel,
        cancelado_por      = v_user_id,
        cancelado_at       = NOW()
    FROM public.doctores d
    WHERE c.doctor_id = d.id
      AND c.estado_sync NOT IN ('cancelado', 'rechazado')
      AND (p_doctor_id    IS NULL OR c.doctor_id  = p_doctor_id)
      AND (p_ubicacion_id IS NULL OR d.ubicacion_id = p_ubicacion_id)
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

Notes:
- The UPDATE joins to `doctores` to resolve `ubicacion_id` per cita (citas table doesn't directly store ubicacion_id in the cita row — wait, it does. Let me re-check: `citas.ubicacion_id` IS a column per the schema. Then the JOIN is unnecessary and we can simplify with `c.ubicacion_id` directly.)
- **Correction during spec write:** `citas.ubicacion_id` is set at INSERT time by `crear_cita_atomic` (it copies `v_doctor.ubicacion_id` into the row). So the UPDATE WHERE can use `c.ubicacion_id` directly without a JOIN. Final WHERE clause:
  ```sql
  WHERE c.estado_sync NOT IN ('cancelado', 'rechazado')
    AND (p_doctor_id    IS NULL OR c.doctor_id    = p_doctor_id)
    AND (p_ubicacion_id IS NULL OR c.ubicacion_id = p_ubicacion_id)
    AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
        && tstzrange(p_fecha_inicio, p_fecha_fin, '[)')
  ```

### 2. New preview endpoint `app/api/admin/excepciones/preview-affected/route.ts`

`GET` with same query params as `POST /api/admin/excepciones` (minus motivo): `fecha_inicio`, `fecha_fin`, `doctor_id?`, `ubicacion_id?`. Returns `{ affected: [...] }`:

```ts
{
  affected: Array<{
    id: string;
    fecha_hora_cita: string;
    paciente_nombre: string;
    paciente_telefono: string | null;
    doctor_nombre: string;
    ubicacion_nombre: string;
  }>
}
```

Server-side SELECT joining `citas` ↔ `users (paciente_id)` ↔ `doctores` ↔ `ubicaciones`. Same overlap predicate as the RPC. Capped at 50 rows (if more than 50 are affected, the panel shows "X more not shown — review before submitting" — but 50 is a reasonable upper bound for an admin tool).

Auth: `assertAdmin` inline pattern (matches existing).

### 3. Modify `POST /api/admin/excepciones`

Replace the direct INSERT with a call to the new RPC:

```ts
const { data, error } = await supabase.rpc("crear_excepcion_con_cancelaciones", {
  p_doctor_id:    body.doctor_id    ?? null,
  p_ubicacion_id: body.ubicacion_id ?? null,
  p_fecha_inicio: body.fecha_inicio,
  p_fecha_fin:    body.fecha_fin,
  p_motivo:       body.motivo ?? null,
});
```

Response now includes `citas_canceladas`:
```ts
{ ok: true, excepcion: { id, ... }, citas_canceladas: number }
```

The legacy POST behaviour (no auto-cancel) is no longer reachable from the admin UI. If anyone calls the endpoint directly with the new schema, they get the new behaviour.

### 4. Edge function: doctor notifications

Modify `supabase/functions/procesar_eventos_cita/index.ts`:

- Extend the `CitaDetalle.doctor` shape to include `correo` and `nombre`:
  ```ts
  doctor: { nombre: string | null; correo: string | null } | null;
  ```
- Update `fetchCita` to select `doctor:doctores(nombre, correo)`.
- In `case "confirmada":` — after the patient block, if `cita.doctor?.correo`:
  - Build the same .ics attachment (reuse existing `buildIcs`).
  - Send email via `sendEmail` with:
    - subject: `Nueva cita: ${cita.paciente?.nombre_completo} — ${fechaTxt}`
    - body: HTML/text with paciente nombre, teléfono, servicio, ubicación, motivo.
- In `case "cancelada":` — after patient block, if `cita.doctor?.correo`:
  - Email with:
    - subject: `Cita cancelada: ${paciente_nombre} — ${fechaTxt}`
    - body: paciente info + motivo de cancelación + a note that the slot is now free.
  - No .ics attachment (cancellation doesn't need a calendar update; the original .ics already had a UID so an UPDATE/CANCEL ics could be sent but YAGNI).

The doctor email body templates live inline in the edge function (Spanish only, like the existing patient templates — the edge function does not use next-intl).

## Frontend

### 1. `AdminExcepcionFormModal` — warning panel

State additions:
```ts
const [affected, setAffected] = useState<AffectedCita[] | null>(null);
const [previewLoading, setPreviewLoading] = useState(false);
```

A debounced effect (300ms) re-fetches `/api/admin/excepciones/preview-affected` when scope/doctor/ubicación/fecha_inicio/fecha_fin change. Validation must pass (valid range, required scope fields) before fetching; otherwise `setAffected(null)` to clear the panel.

Render in the modal body, ABOVE the form footer, AFTER the form fields:

```tsx
{previewLoading && (
  <p className="text-xs font-roboto text-gray-400">{t("affected.loading")}</p>
)}
{affected && affected.length > 0 && (
  <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
    <p className="text-sm font-roboto font-semibold text-red-700">
      ⚠️ {t("affected.count", { n: affected.length })}
    </p>
    <ul className="space-y-1 max-h-40 overflow-y-auto">
      {affected.map((c) => (
        <li key={c.id} className="text-xs font-roboto text-red-900 grid grid-cols-[auto,1fr] gap-2">
          <span className="font-medium">{formatShortDateTimeNI(c.fecha_hora_cita, locale)}</span>
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
{affected && affected.length === 0 && (
  <p className="text-xs font-roboto text-gray-500">{t("affected.none")}</p>
)}
```

Toast on submit:
- `affected.length > 0` → `t("toast.creadoConCancelaciones", { n })`
- `affected.length === 0` → existing `t("toast.creado")`

The toast text comes from the server response's `citas_canceladas`, not the client's preview count, to stay authoritative.

### 2. i18n keys

Add under `Dashboard.admin.excepciones`:

```json
"affected": {
  "loading": "Verificando citas afectadas…",
  "none": "Ninguna cita existente se verá afectada por esta excepción.",
  "count": "Esta excepción cancelará {n} cita(s) existente(s).",
  "whatsappReminder": "Al crear la excepción, estas citas se cancelarán automáticamente y se enviará correo al paciente. Recuerda contactarlos también por WhatsApp para confirmar y reagendar si corresponde."
}
```

And under `toast`:
```json
"creadoConCancelaciones": "Excepción creada. {n} cita(s) cancelada(s)."
```

EN equivalents:
```json
"affected": {
  "loading": "Checking affected appointments…",
  "none": "No existing appointments will be affected by this exception.",
  "count": "This exception will cancel {n} existing appointment(s).",
  "whatsappReminder": "When the exception is created, these appointments will be auto-cancelled and the patient will be emailed. Remember to also contact them via WhatsApp to confirm and reschedule if needed."
}
```

```json
"creadoConCancelaciones": "Exception created. {n} appointment(s) cancelled."
```

## Deployment

- SQL migration: `supabase db push` (per-PR norm).
- Edge function: `supabase functions deploy procesar_eventos_cita` (NEW STEP — previous PRs did not touch the edge function so this wasn't needed).

The plan must include the edge function deploy as an explicit step in Task N (similar to how `supabase db push` is treated).

## Error handling

- RPC raises `UNAUTHORIZED` / `FORBIDDEN` / `INVALID_RANGE` (P0001). The POST handler maps these to 401/403/400 respectively with a generic message (admin tool, no need for fancy i18n on internal errors).
- Preview endpoint returns `{ affected: [] }` silently if the parameters are invalid (no error toast — empty state covers it).
- Edge function doctor-email branch wraps `sendEmail` in try/catch; if doctor email fails, the event is still marked processed (don't retry just for the doctor side — patient is the critical path). Failure logged via `console.error`.

## Testing

No automated tests (per CLAUDE.md). Verify with `pnpm build` + manual QA:

1. Open `/admin/excepciones`, click "Nueva excepción". Pick a date range with 0 active citas → no warning shown. Submit → success toast "Excepción creada." (no count).
2. Open form again with a range covering an active cita → warning panel appears with that cita's details, including patient phone. Submit → success toast "Excepción creada. 1 cita(s) cancelada(s)." + patient receives email with the motivo.
3. From a different account, open `/dashboard/citas` for the affected patient → cita shows `cancelado` with the motivo.
4. Create a confirmed cita as a member → doctor receives email with .ics attachment that imports cleanly into Google Calendar.
5. Cancel a cita from `AdminCitaDetalleModal` → both patient AND doctor receive email; doctor email has no .ics (just a notice).

## Out of scope

- Doctor receives `creada` (pending) email — only `confirmada`, matching patient flow.
- Doctor receives `recordatorio_24h` email — possible future enhancement.
- WhatsApp template for doctor notifications — only email, since doctors don't necessarily have WhatsApp Business numbers registered.
- Undo of mass cancellation (admin deletes the exception → restore the cancelled citas). Manual reagend for now.
- Localized doctor email templates — Spanish only, hardcoded in edge function (matches existing patient templates).
- "Cancellation creates a slot block" — not requested; the cancelled cita already frees the slot, and excepciones are the mechanism for permanent blocks.

## Branch + PR

- Branch: `feat/excepcion-side-effects-and-doctor-notif` (already created on top of merged `main`).
- ~7 commits expected.
- Title: `feat(citas): auto-cancel + doctor email notifications`

## Self-review

- ✅ All 4 user-requested items covered (warning, auto-cancel, confirm cancel email already works, doctor email).
- ✅ Item 3 ambiguity resolved with user → existing pipeline confirmed.
- ✅ Edge function deploy step explicitly called out.
- ✅ Auto-cancel uses existing trigger → no double-write of `cita_eventos`.
- ✅ Preview endpoint capped at 50 rows to avoid runaway queries.
- ✅ Edge function doctor branch wrapped in try/catch so patient flow stays critical path.
- ✅ Cancellation email for doctor has no .ics (per-spec decision).
- ✅ SQL migration uses `c.ubicacion_id` directly after correction noted inline.
