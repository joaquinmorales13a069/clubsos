# Design Spec: empresa_admin Edit Restrictions + Nicaragua DateTime Format

**Date:** 2026-05-12  
**Status:** Approved

---

## Overview

Two independent UI changes:

1. **empresa_admin edit restrictions** — an empresa_admin may only edit full profile info for miembros. When viewing another empresa_admin they can only toggle estado. When viewing their own account they can edit full info but cannot deactivate themselves.
2. **Nicaragua datetime format** — the Topbar clock displays dates in Nicaraguan Spanish format: `"Martes 12 de Mayo del 2026 01:00 PM"`.

---

## Change 1: empresa_admin Edit Restrictions

### Files affected

- `components/dashboard/empresa/EmpresaUsuarios.tsx`
- `components/dashboard/empresa/EditarUsuarioModal.tsx`

### Behavior matrix

| Viewer role | Target user | Edit personal info | Toggle estado |
|---|---|---|---|
| empresa_admin | miembro | ✅ full | ✅ |
| empresa_admin | otro empresa_admin | ❌ read-only | ✅ |
| empresa_admin | sí mismo | ✅ full | ❌ disabled |

### EmpresaUsuarios changes

- Fetch `currentUserId` via `supabase.auth.getUser()` in the existing mount `useEffect`, stored as `currentUserId: string | null` in state.
- Pass `currentUserId` as a new prop to `EditarUsuarioModal`.

### EditarUsuarioModal changes

**New prop:** `currentUserId: string | null`

**Derived flags (computed from props, not state):**
```ts
const isSelf        = user.id === currentUserId;
const isTargetAdmin = user.rol === "empresa_admin";
```

**Rendering rules:**

- **isSelf (`isSelf === true`):**
  - All `InputField` components render normally (nombre, telefono, email, documento).
  - The estado toggle is rendered with `disabled` on both buttons.
  - A note (same `Info` + amber style used elsewhere) reads from i18n key `estadoSelfNote`.
  - `handleSave` patch includes all editable fields except `estado` (estado is excluded from the patch object).

- **isTargetAdmin && !isSelf:**
  - The "Editar" section replaces all `InputField` components with `ReadField` (already exists in the file).
  - The estado toggle remains fully active.
  - `handleSave` patch contains only `{ estado }`.

- **miembro (default):**
  - No changes — current behavior is preserved.

**Patch construction:**
```ts
const patch = isSelf
  ? { nombre_completo, telefono, email, documento_identidad }       // no estado
  : isTargetAdmin
    ? { estado }                                                      // estado only
    : { nombre_completo, telefono, email, documento_identidad, estado }; // full
```

This ensures that even if a UI bug occurs, the wrong fields are never sent to Supabase.

### i18n keys required

Add to both `messages/es.json` and `messages/en.json` under `Dashboard.empresa.gestionarUsuarios`:

| Key | es | en |
|---|---|---|
| `estadoSelfNote` | "No puedes desactivar tu propia cuenta." | "You cannot deactivate your own account." |

### Out of scope

RLS-level column restrictions are not included. The existing `users_empresa_admin_update` policy already scopes updates to the empresa; the role-based restriction is a product-level rule enforced at the UI layer.

---

## Change 2: Nicaragua DateTime Format

### File affected

- `components/dashboard/DateTimeDisplay.tsx`

### Target format

```
Martes 12 de Mayo del 2026 01:00 PM
```

### Implementation

`Intl.DateTimeFormat` with locale `"es-NI"` does not natively produce `"del"` before the year. Use `formatToParts()` to reconstruct the string:

```ts
const parts = new Intl.DateTimeFormat("es-NI", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
}).formatToParts(time);

// Extract named parts
const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const formatted = `${capitalize(get("weekday"))} ${get("day")} de ${capitalize(get("month"))} del ${get("year")} ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
```

### English locale

When `locale === "en"`, use a standard US format via `Intl.DateTimeFormat("en-US", ...)` without `formatToParts`. Remove `timeZoneName` from the options in both locales.

### Notes

- `timeZoneName: "short"` is removed from the format options in both locales (was previously shown).
- `es-NI` correctly uses Nicaragua timezone when the browser is set to `America/Managua`; the component reads the local system clock so no explicit `timeZone` option is needed.
- Capitalization is applied manually because `es-NI` returns weekday and month names in lowercase.

---

## No database migrations required

Neither change requires schema modifications or new RLS policies.
