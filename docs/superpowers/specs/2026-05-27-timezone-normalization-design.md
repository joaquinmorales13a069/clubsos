# Timezone Normalization + Signup-Familiar Fix — Design

**Branch:** `fix/timezone-normalization` (scope grew mid-brainstorming to include an unrelated signup auth bug; branch name retained)
**Trigger:** Three bugs reported by the user:
1. The wizard allowed booking an appointment with less than 24 hours of notice.
2. An appointment scheduled for May 27 8:00 AM (Nicaragua time) appeared on May 28 in the admin calendar (user testing from Australia / UTC+11).
3. Registering a *familiar* of a *titular* fails at "Completar Registro" with `Error al configurar credenciales: New password should be different from the old password`, leaving a zombie `Pendiente` row in `users` with no empresa, no correo, and wrong `tipo_cuenta`.

**Goal:** (a) all date/time display and validation across the app must operate in Nicaragua time (`America/Managua`, UTC-6, no DST) regardless of the user's browser timezone; (b) the 24h pre-booking cutoff must be enforced server-side as an exact 24-hour window; (c) signup must be idempotent so that retries succeed instead of leaving zombie rows.

---

## Root causes

### Bug A — 24h cutoff
- `crear_cita_atomic` has **no server-side time-minimum check**. The only time-related validation is the doctor's working-hours window.
- Client-side enforcement (in `PasoFecha.tsx`) is **"must be tomorrow or later in NI calendar"**, computed as `nicaraguaCalendarDate(1)` then `setHours(0, 0, 0, 0)` (browser-local midnight, not NI midnight).
- Two failure modes:
  1. At 11:59 PM Nicaragua time, booking "tomorrow 00:01 AM" is ~2 minutes away, not 24h.
  2. The `setHours(0,0,0,0)` browser-local pollution can shift the cutoff by the browser tz offset (up to ~17h for Australia users).

### Bug B — Calendar bucket on wrong day
- `AdminCalendarioCitas` mounts `<FullCalendar>` **without `timeZone="America/Managua"` prop**. FullCalendar defaults to `"local"` and buckets events in the browser's tz.
- A cita stored as `2026-05-27 14:00:00+00` (8:00 AM Nicaragua) is `2026-05-28 01:00:00 AEDT` in Australia → FullCalendar places it in the May-28 cell.

### Broader audit findings
- **17 components** format dates without `timeZone: "America/Managua"`. They render in browser tz → cross-tz users see wrong values.
- **15 components** already pass `timeZone: "America/Managua"` correctly. They show right values today but reinvent the formatting each time (string-literal `"America/Managua"` repeated, locale logic duplicated). They are a regression risk: a future change might drop the option.
- The ad-hoc `nicaraguaCalendarDate()` helper inside `PasoFecha.tsx` mixes hardcoded `-6 * 60 * 60 * 1000` offsets with `Date` constructor side effects. Brittle and hard to reason about.

### Bug C — Signup-familiar credentials retry
- In `app/[locale]/(auth)/signup/actions.ts:206`, `completeSignupAction` calls `supabase.auth.updateUser({ password })` unconditionally on every submit.
- The phone-OTP step (`verifySignupOtpAction`) already creates the auth.users row and the trigger `handle_new_user` inserts a default row in `public.users` with `tipo_cuenta = 'titular'` (the schema default).
- If the **first** "Completar Registro" submission fails at a later step (email already in use, profile update DB error, network blip), the password update **does** succeed and is persisted. On retry with the **same password**, Supabase rejects with `New password should be different from the old password` and the whole action aborts.
- The user is left as a zombie: `auth.users` row exists with a password, `public.users` shows `tipo_cuenta = 'titular'`, `estado = 'pendiente'`, `empresa_id = null`, `titular_id = null`. They cannot retry signup successfully and admin sees them as a broken `Titular Pendiente`.

---

## Architecture

### 1. New utility module `lib/datetime.ts`

Single source of truth for Nicaragua-relative date math and formatting. **All date display + Nicaragua-bound date math in the app must route through this module.**

```ts
export const NICARAGUA_TZ = "America/Managua";

// ── "Now" / today in Nicaragua ────────────────────────────────────────────
// Returns a JS Date pointing to the UTC instant of "now". The caller
// should pass it through one of the format helpers below to render in NI.
export function nowUtc(): Date;

// Returns a YYYY-MM-DD string of today's calendar date in Nicaragua.
export function todayNI(): string;

// Returns a YYYY-MM-DD string of today + n days in Nicaragua's calendar.
export function addDaysNI(yyyymmdd: string, days: number): string;

// ── Formatting (always in Nicaragua tz) ──────────────────────────────────
type Loc = "es" | "en";
export function formatDateNI(input: Date | string, locale: Loc): string;       // "miércoles, 27 de mayo de 2026"
export function formatDateShortNI(input: Date | string, locale: Loc): string;  // "27 may 2026" / "May 27, 2026"
export function formatTimeNI(input: Date | string, locale: Loc): string;       // "08:00"
export function formatDateTimeNI(input: Date | string, locale: Loc): string;   // "miércoles, 27 de mayo de 2026, 8:00"
export function formatRelativeShortNI(input: Date | string, locale: Loc): string; // "27 may, 08:00" (for compact lists)

// ── 24h booking cutoff ───────────────────────────────────────────────────
// Returns true if `citaUtc` is at least 24 hours away from now.
export function isAtLeast24hAway(citaUtc: Date | string): boolean;

// ── Calendar grid helper (for date pickers) ──────────────────────────────
// Converts a YYYY-MM-DD string (NI calendar date) into a JS Date at noon UTC,
// which is the same calendar date in every browser tz (avoids midnight-shift
// bugs in date pickers). Use noon-UTC dates whenever a Date is used purely
// as a calendar-day marker, not a real instant.
export function calendarDateNI(yyyymmdd: string): Date;
export function dateToCalendarNI(d: Date): string; // inverse: Date → YYYY-MM-DD in NI calendar
```

**Implementation notes:**
- All format functions use `Intl.DateTimeFormat(locale, { timeZone: NICARAGUA_TZ, ... })`. No hardcoded `-6 * 60 * 60 * 1000` offset anywhere (defensive even though NI doesn't observe DST).
- `todayNI()` derives via `Intl.DateTimeFormat("en-CA", { timeZone: NICARAGUA_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())` — `en-CA` gives ISO-like `YYYY-MM-DD`.
- `calendarDateNI("2026-05-27")` returns `new Date("2026-05-27T12:00:00.000Z")`. Noon UTC = noon in every browser tz, so the date constructor never spills into adjacent calendar days regardless of where the user is.
- `formatTimeNI` uses `hour: "2-digit", minute: "2-digit", hour12: false`.
- The module exports types (`Loc` etc.) but **NEVER** mutates `Date` objects or relies on the browser tz.

### 2. Server-side 24h cutoff

New migration that **replaces** `crear_cita_atomic` (idempotent `CREATE OR REPLACE`) and inserts a new validation block immediately after the existing `UNAUTHORIZED`/`FORBIDDEN` checks (early-exit before any work). The check:

```sql
IF p_fecha_hora_cita < NOW() + INTERVAL '24 hours' THEN
  RAISE EXCEPTION 'BOOKING_TOO_SOON' USING ERRCODE = 'P0001';
END IF;
```

`NOW()` is timezone-agnostic (UTC instant). `p_fecha_hora_cita` is `TIMESTAMPTZ`. The comparison is correct regardless of doctor's tz.

**Client-side error mapping:** add `BOOKING_TOO_SOON` to `lib/citas/errors.ts` → HTTP 409 → i18n key `Errors.citas.booking_too_soon`.

**i18n values:**
- ES: `"No se puede agendar citas con menos de 24 horas de anticipación."`
- EN: `"Appointments cannot be booked with less than 24 hours of notice."`

### 3. Client-side 24h UX hint

`PasoFecha.tsx` and `PasoHorario.tsx` should not surprise the user by letting them pick a slot and then failing at confirm. UX rules:

- `PasoFecha.tsx`: replace the ad-hoc `nicaraguaCalendarDate()` with `todayNI()` + `addDaysNI()`. The earliest selectable day = the calendar day in Nicaragua that contains `(now + 24h)`. If `now + 24h` is e.g. tomorrow 8 AM NI, then "tomorrow" is selectable but the user is warned that slots before 8 AM are unavailable.
- `PasoHorario.tsx`: when receiving the slot grid from the RPC, additionally filter on `isAtLeast24hAway(slot.hora_inicio)`. Disabled slots show a tooltip "Disponible solo con 24h de anticipación".

### 4. FullCalendar timezone

In `AdminCalendarioCitas.tsx`, add `timeZone="America/Managua"` to the `<FullCalendar>` props. One-line change, fully fixes Bug B.

### 5. Audit migration of the 17 files without explicit tz

Each file must replace its inline `new Date(x).toLocale*` call with the appropriate `format*NI` helper from `lib/datetime.ts`. Files:

```
components/dashboard/miembro/avisos/AvisoDetailModal.tsx
components/dashboard/miembro/avisos/MisAvisos.tsx
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

(The 2 files in `components/ui/{calendar,chart}.tsx` are shadcn primitives — out of scope.)

### 6. Consistency migration of the 15 files already using NI tz

These already render correctly but inline `timeZone: "America/Managua"` literals. Migrate to the helpers for consistency and to prevent regressions. Files:

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

After migration, **a grep for `"America/Managua"` should match only `lib/datetime.ts`** (and possibly the SQL migrations and the brief mention in `AdminCalendarioCitas`'s `<FullCalendar timeZone=...>` prop). This is the verification gate.

### 7. ESLint guard (optional but recommended)

Add an ESLint custom rule or a simple `no-restricted-syntax` rule to forbid `.toLocaleDateString(` / `.toLocaleTimeString(` / `.toLocaleString(` outside `lib/datetime.ts`. This prevents future regressions. Documented in spec but implementation is **out of scope for this PR** (added as a follow-up issue, would require ESLint config changes and possibly a custom plugin).

### 8. Idempotent signup-familiar (fixes Bug C)

Make `completeSignupAction` (in `app/[locale]/(auth)/signup/actions.ts`) tolerate retries so that a failed first attempt does not permanently brick the account.

**Approach:** before calling `supabase.auth.updateUser({ password })`, check whether a password is already set on the user. If yes, **skip the password update** (the password the user typed must match what they used last time, or the user can use "Forgot password" later). If no, set it.

How to detect: the Supabase auth user object includes a `user.app_metadata` flag, but the cleanest signal is `user.user_metadata` plus the presence of `last_sign_in_at` vs. `created_at`. Simpler: query the `auth.users` table via service-role to read `encrypted_password IS NOT NULL`. Cleanest of all: just wrap the password update in a try/catch that specifically swallows the `"New password should be different from the old password"` (and equivalent localized) error message — the password is already what they want.

Chosen implementation (lowest-risk, no new auth API calls):

```ts
// In completeSignupAction, replace the password update block with:
if (formData.password) {
  const { error: pwError } = await supabase.auth.updateUser({
    password: formData.password,
    data: authUpdateData.data,  // metadata always written
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
    // Same-as-previous-password: the password is already what the user typed.
    // Treat as success and continue with the rest of the flow.
  }
} else {
  // No password change requested — still write metadata
  const { error: metaError } = await supabase.auth.updateUser({
    data: authUpdateData.data,
  });
  if (metaError) return { error: t("credentialsError", { message: metaError.message }) };
}
```

This change is **server-side only**, contained to one function. No schema change, no new RPC, no client change. No i18n changes (we use the existing `credentialsError` key — only the bypassed case adds no new toast).

**Companion fix (the zombie row):** add a one-off SQL clean-up note in the PR description (not in the migration) suggesting the admin manually delete the test zombie user shown in the screenshot via the admin UI. No automated migration for this — it is a single test row, not a population.

**Testing notes:**
1. As a new familiar: complete signup normally → expect success.
2. Trigger an intentional retry: type an email that's already used (forces step to fail at the `emailExists` check on line 184) → submit → expect `emailExists` error. Change the email and retry → expect success this time (previously failed because password update was rejected). The fix lets the second attempt continue past the password step.
3. Multi-tab regression: open signup in two tabs after OTP, submit one, then submit the other with the same password → expect both to succeed (idempotent).

---

## Data flow

```
┌─────────────────────┐         ┌──────────────────────┐         ┌────────────────────┐
│ Browser (user tz)   │         │ lib/datetime.ts      │         │ Postgres (UTC)     │
│ - never reads tz    │ ──────▶ │ - reads UTC instants │ ──────▶ │ - TIMESTAMPTZ      │
│   directly          │         │ - formats in NI tz   │         │ - NOW() / cutoff   │
│ - all date strings  │         │ - validates 24h      │         │   check enforced   │
│   come from helpers │         │                      │         │   in RPC           │
└─────────────────────┘         └──────────────────────┘         └────────────────────┘
```

---

## Error handling

- Server raises `BOOKING_TOO_SOON` → mapped to HTTP 409 → toast in client.
- Client UX prevents most cases from reaching the server (slot picker disables sub-24h options).
- `lib/datetime.ts` helpers never throw on invalid input; they return `"—"` for `null` / undefined and `"Invalid date"` for unparseable strings. (Defensive — the existing inline code mostly throws.)

---

## Testing

No automated test suite per CLAUDE.md. Verification = `pnpm build` (type-check) + manual QA from a non-NI browser tz (use browser devtools "Sensors → Location" or change OS tz to Pacific/Auckland).

**Manual smoke checks:**
- From Australia tz: book a cita for tomorrow 8 AM NI → verify the booking succeeds.
- Try to book a cita for now+1h → expect `BOOKING_TOO_SOON` toast.
- Open admin calendar in Australia tz with a cita at 8 AM NI → verify it appears on the correct NI day cell.
- Open `CitaCard`, `ProximaCitaCard`, `AvisoDetailModal`, `CampanaUnificada` from Australia tz → verify all dates render in NI time.

---

## Branch + PR

- **Branch:** `fix/timezone-normalization` (scope grew to also include Bug C — name kept for git continuity).
- **Single PR** with ~6-7 commits (one per logical chunk: `lib/datetime.ts`, 24h RPC migration, FullCalendar fix, audit migration of the 17 files without tz, refactor of the 15 files already using tz, signup-familiar idempotent fix).
- **Migration:** `supabase/migrations/20260528000000_citas_24h_cutoff.sql`.
- **Suggested PR title:** `fix: timezone normalization + 24h cutoff + signup retry idempotency`.

---

## Out of scope

- Refactoring `<input type="date">` in reports/forms (native pickers, unambiguous YYYY-MM-DD).
- Storing or displaying user-preferred timezone (system always uses NI).
- Implementing the ESLint guard (filed as follow-up).
- Translating the `nicaraguaCalendarDate` helper inside `PasoFecha.tsx` beyond replacing its callsite (the helper itself gets deleted).
- DST handling (Nicaragua does not observe DST; the helpers use IANA tz which handles it anyway).
- Automated cleanup of pre-existing zombie `Pendiente` rows from prior failed signup attempts (manual admin task; one-off, not worth a migration).
- Broader refactor of the multi-step signup wizard (out of scope; we only fix the idempotency bug in `completeSignupAction`).

---

## Self-review checklist

- ✅ All 17 + 15 + 1 (PasoFecha helper) callsites identified and listed.
- ✅ The SQL migration uses `CREATE OR REPLACE` (idempotent) and an explicit `BEGIN/COMMIT`.
- ✅ The new `BOOKING_TOO_SOON` error code is mapped in 3 places: SQL, `lib/citas/errors.ts`, both i18n files.
- ✅ The FullCalendar fix is a one-line prop addition; no event remapping needed.
- ✅ The data flow diagram makes the layering explicit: browser → helpers → DB.
- ✅ The verification gate (`grep -r "America/Managua"` only matches `lib/datetime.ts` + 2 controlled exceptions) is concrete and falsifiable.
- ✅ The scope statement (in/out) is explicit.
- ✅ Bug C fix is server-side only, contained to one function in one file. The detection list of error-message substrings is explicit and uses English fallbacks because Supabase Auth does not localize.
- ✅ Bug C testing notes include the retry scenario that actually reproduces the bug.
