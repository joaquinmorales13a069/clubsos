# empresa_admin Edit Restrictions + Nicaragua DateTime Format — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent empresa_admin from editing another empresa_admin's personal data (only estado toggle allowed) and from deactivating their own account; update the Topbar clock to display dates in Nicaraguan format (`"Martes 12 de Mayo del 2026 01:00 PM"`).

**Architecture:** Two independent UI-only changes. Change 1 threads `currentUserId` from `EmpresaUsuarios` into `EditarUsuarioModal`, where two derived flags (`isSelf`, `isTargetAdmin`) gate field visibility and shape the Supabase patch. Change 2 replaces `Intl.DateTimeFormat.format()` with `formatToParts()` in `DateTimeDisplay` to inject `"del"` before the year. No migrations or RLS changes required.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Supabase browser client · next-intl · Tailwind CSS v4

---

## File Map

| File | Change |
|---|---|
| *(git)* | Create feature branch |
| `messages/es.json` | Add `estadoSelfNote` key |
| `messages/en.json` | Add `estadoSelfNote` key |
| `components/dashboard/empresa/EmpresaUsuarios.tsx` | Fetch `currentUserId`, pass to modal |
| `components/dashboard/empresa/EditarUsuarioModal.tsx` | New prop, derived flags, conditional render, conditional patch |
| `components/dashboard/DateTimeDisplay.tsx` | Nicaragua `formatToParts()` logic |

---

## Task 1: Create feature branch

**Files:** *(git only)*

- [ ] **Step 1.1: Create and switch to branch**

```bash
git checkout -b feat/empresa-admin-restrictions-datetime
```

Expected: `Switched to a new branch 'feat/empresa-admin-restrictions-datetime'`

---

## Task 2: Add i18n key `estadoSelfNote`

**Files:**
- Modify: `messages/es.json` (line 602 — after `estadoPendienteNote`)
- Modify: `messages/en.json` (line 602 — after `estadoPendienteNote`)

- [ ] **Step 2.1: Add key to `messages/es.json`**

Inside the `Dashboard.empresa.gestionarUsuarios` object, after the `"estadoPendienteNote"` line (line 602), add:

```json
"estadoSelfNote": "No puedes desactivar tu propia cuenta.",
```

The block should look like:

```json
"estadoPendienteNote": "Este usuario está pendiente de activación. Al guardar, el estado cambiará a activo o inactivo según tu selección.",
"estadoSelfNote": "No puedes desactivar tu propia cuenta.",
"sectionInfo": "Información de cuenta",
```

- [ ] **Step 2.2: Add key to `messages/en.json`**

Same position in `messages/en.json` (line 602), after `"estadoPendienteNote"`:

```json
"estadoSelfNote": "You cannot deactivate your own account.",
```

The block should look like:

```json
"estadoPendienteNote": "This user is pending activation. Saving will change the status to active or inactive based on your selection.",
"estadoSelfNote": "You cannot deactivate your own account.",
"sectionInfo": "Account information",
```

- [ ] **Step 2.3: Commit**

```bash
git add messages/es.json messages/en.json
git commit -m "feat(i18n): add estadoSelfNote key for empresa_admin self-deactivation block"
```

---

## Task 3: Fetch `currentUserId` in `EmpresaUsuarios`

**Files:**
- Modify: `components/dashboard/empresa/EmpresaUsuarios.tsx`

- [ ] **Step 3.1: Add `currentUserId` state**

In the `// ── UI state` block (around line 103), add one new line:

```ts
const [currentUserId, setCurrentUserId] = useState<string | null>(null);
```

The state block should look like:

```ts
// ── UI state ─────────────────────────────────────────────────────────────────
const [search, setSearch] = useState("");
const [page,   setPage]   = useState(0);
const [currentUserId, setCurrentUserId] = useState<string | null>(null);
```

- [ ] **Step 3.2: Add `useEffect` to fetch the authenticated user's ID**

After the existing fetch `useEffect` (which ends around line 126), add:

```ts
useEffect(() => {
  const supabase = createClient();
  supabase.auth.getUser().then(({ data }) => {
    setCurrentUserId(data.user?.id ?? null);
  });
}, []);
```

- [ ] **Step 3.3: Pass `currentUserId` to `EditarUsuarioModal`**

Find the `<EditarUsuarioModal` usage at the bottom of the file (around line 409) and add the new prop:

```tsx
<EditarUsuarioModal
  open={modalOpen}
  user={selectedUser}
  onClose={() => setModalOpen(false)}
  onSaved={handleSaved}
  currentUserId={currentUserId}
/>
```

- [ ] **Step 3.4: Verify type-check passes**

```bash
pnpm build 2>&1 | grep -E "error TS|✓|Failed"
```

Expected: no TypeScript errors (may warn about the new prop not matching the interface yet — that will be fixed in Task 4).

- [ ] **Step 3.5: Commit**

```bash
git add components/dashboard/empresa/EmpresaUsuarios.tsx
git commit -m "feat(empresa-usuarios): fetch and forward currentUserId to EditarUsuarioModal"
```

---

## Task 4: Add edit restrictions to `EditarUsuarioModal`

**Files:**
- Modify: `components/dashboard/empresa/EditarUsuarioModal.tsx`

- [ ] **Step 4.1: Add `currentUserId` to the `Props` interface**

Find the `interface Props` block (around line 92) and add the new field:

```ts
interface Props {
  open:          boolean;
  user:          UsuarioEmpresa | null;
  onClose:       () => void;
  onSaved:       (updated: UsuarioEmpresa) => void;
  currentUserId: string | null;
}
```

- [ ] **Step 4.2: Destructure `currentUserId` from props**

Find the function signature (around line 116):

```ts
export default function EditarUsuarioModal({ open, user, onClose, onSaved }: Props) {
```

Replace with:

```ts
export default function EditarUsuarioModal({ open, user, onClose, onSaved, currentUserId }: Props) {
```

- [ ] **Step 4.3: Derive `isSelf` and `isTargetAdmin` flags**

After `if (!user) return null;` (around line 138), add the two derived constants:

```ts
const isSelf        = user.id === currentUserId;
const isTargetAdmin = user.rol === "empresa_admin";
```

- [ ] **Step 4.4: Replace the editable section with conditional rendering**

Find the `{/* ── Editable fields ───────────────────────────────────────────── */}` section (lines 249–326) and replace the entire `<section>` block with the following:

```tsx
{/* ── Editable / read-only fields ─────────────────────────────── */}
<section className="space-y-4">
  <h4 className="text-xs font-poppins font-semibold text-gray-500 uppercase tracking-wider">
    {t("sectionEditar")}
  </h4>

  {(isTargetAdmin && !isSelf) ? (
    /* Other empresa_admin — personal data is read-only */
    <div className="space-y-3 bg-gray-50 rounded-xl p-4">
      <ReadField label={t("fieldNombre")}    value={user.nombre_completo} />
      <ReadField label={t("fieldTelefono")}  value={user.telefono} />
      <ReadField label={t("fieldEmail")}     value={user.email} />
      <ReadField label={t("fieldDocumento")} value={user.documento_identidad} />
    </div>
  ) : (
    /* Self or miembro — full edit */
    <>
      <InputField
        label={t("fieldNombre")}
        value={nombre}
        onChange={setNombre}
        icon={User}
      />
      <InputField
        label={t("fieldTelefono")}
        value={telefono}
        onChange={setTelefono}
        type="tel"
        icon={Phone}
      />
      <InputField
        label={t("fieldEmail")}
        value={email}
        onChange={setEmail}
        type="email"
        icon={Mail}
        note={t("emailNote")}
      />
      <InputField
        label={t("fieldDocumento")}
        value={documento}
        onChange={(v) => setDocumento(v.replace(/[^a-zA-Z0-9]/g, ""))}
        icon={FileText}
      />
    </>
  )}

  {/* ── Estado toggle (activo ↔ inactivo) ────────────────────── */}
  <div className="space-y-2">
    <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
      {t("fieldEstado")}
    </label>
    <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
      <button
        type="button"
        onClick={() => setEstado("activo")}
        disabled={isSelf}
        className={cn(
          "px-4 py-2 text-xs font-semibold font-roboto transition-colors",
          isSelf && "opacity-50 cursor-not-allowed",
          estado === "activo"
            ? "bg-emerald-600 text-white"
            : "bg-white text-gray-500 hover:bg-gray-50",
        )}
      >
        {t("estadoToggleActivo")}
      </button>
      <button
        type="button"
        onClick={() => setEstado("inactivo")}
        disabled={isSelf}
        className={cn(
          "px-4 py-2 text-xs font-semibold font-roboto transition-colors border-l border-gray-200",
          isSelf && "opacity-50 cursor-not-allowed",
          estado === "inactivo"
            ? "bg-red-500 text-white"
            : "bg-white text-gray-500 hover:bg-gray-50",
        )}
      >
        {t("estadoToggleInactivo")}
      </button>
    </div>

    {/* Self-deactivation block note */}
    {isSelf && (
      <div className="flex items-start gap-1.5 text-[11px] font-roboto text-amber-700 bg-amber-50 px-3 py-2 rounded-xl">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{t("estadoSelfNote")}</span>
      </div>
    )}

    {/* Pendiente warning */}
    {user.estado === "pendiente" && (
      <div className="flex items-start gap-1.5 text-[11px] font-roboto text-amber-700 bg-amber-50 px-3 py-2 rounded-xl">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{t("estadoPendienteNote")}</span>
      </div>
    )}
  </div>
</section>
```

- [ ] **Step 4.5: Update the Supabase patch in `handleSave`**

Find the `const patch = {` block (around line 152) and replace it with a conditional patch:

```ts
const patch = isSelf
  ? {
      nombre_completo:     nombre.trim() || null,
      telefono:            telefono.trim() || null,
      email:               email.trim() || null,
      documento_identidad: documento.trim() || null,
    }
  : isTargetAdmin
    ? { estado }
    : {
        nombre_completo:     nombre.trim() || null,
        telefono:            telefono.trim() || null,
        email:               email.trim() || null,
        documento_identidad: documento.trim() || null,
        estado,
      };
```

Also update the `updated` object built after a successful save (around line 170) to reflect the patch:

```ts
const updated: UsuarioEmpresa = {
  id:          currentUser.id,
  rol:         currentUser.rol,
  tipo_cuenta: currentUser.tipo_cuenta,
  created_at:  currentUser.created_at,
  nombre_completo:     isSelf || !isTargetAdmin ? nombre.trim() || null : currentUser.nombre_completo,
  telefono:            isSelf || !isTargetAdmin ? telefono.trim() || null : currentUser.telefono,
  email:               isSelf || !isTargetAdmin ? email.trim() || null : currentUser.email,
  documento_identidad: isSelf || !isTargetAdmin ? documento.trim() || null : currentUser.documento_identidad,
  estado:              isSelf ? currentUser.estado : estado,
};
```

- [ ] **Step 4.6: Update the Save button's `disabled` condition**

Find the Save button in the footer (around line 344). Update the `disabled` condition so it doesn't require `nombre` when only editing estado (i.e., `isTargetAdmin && !isSelf`):

```tsx
disabled={saving || ((!isTargetAdmin || isSelf) && !nombre.trim())}
```

The full button should look like:

```tsx
<button
  type="button"
  onClick={handleSave}
  disabled={saving || ((!isTargetAdmin || isSelf) && !nombre.trim())}
  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
             bg-secondary text-white text-sm font-semibold font-roboto
             hover:bg-secondary/90 disabled:opacity-50 transition-colors"
>
  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
  {saving ? t("guardandoBtn") : t("guardarBtn")}
</button>
```

- [ ] **Step 4.7: Verify type-check passes**

```bash
pnpm build 2>&1 | grep -E "error TS|✓|Failed"
```

Expected: no TypeScript errors.

- [ ] **Step 4.8: Commit**

```bash
git add components/dashboard/empresa/EditarUsuarioModal.tsx
git commit -m "feat(empresa-usuarios): restrict empresa_admin edit — read-only for other admins, no self-deactivation"
```

---

## Task 5: Nicaragua datetime format in `DateTimeDisplay`

**Files:**
- Modify: `components/dashboard/DateTimeDisplay.tsx`

- [ ] **Step 5.1: Replace the format logic**

Find the `const formatOptions` block and the `Intl.DateTimeFormat` call (lines 32–45) and replace both with the following helper functions and a single conditional call:

```ts
function formatNicaragua(date: Date): string {
  const parts = new Intl.DateTimeFormat("es-NI", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
    year:    "numeric",
    hour:    "2-digit",
    minute:  "2-digit",
    hour12:  true,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const period = get("dayPeriod").toUpperCase().replace(/[.\s]/g, "");

  return `${cap(get("weekday"))} ${get("day")} de ${cap(get("month"))} del ${get("year")} ${get("hour")}:${get("minute")} ${period}`;
}

function formatEnglish(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
    year:    "numeric",
    hour:    "2-digit",
    minute:  "2-digit",
    hour12:  true,
  }).format(date);
}

const formattedDateTime = locale === "es" ? formatNicaragua(time) : formatEnglish(time);
```

The two helper functions go **inside** the component body, before the `return` statement (they can also live outside at module scope — either works since they are pure functions with no hooks or state).

After this change the full component body (from after the `if (!mounted)` guard) should look like:

```ts
function formatNicaragua(date: Date): string {
  const parts = new Intl.DateTimeFormat("es-NI", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
    year:    "numeric",
    hour:    "2-digit",
    minute:  "2-digit",
    hour12:  true,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const period = get("dayPeriod").toUpperCase().replace(/[.\s]/g, "");

  return `${cap(get("weekday"))} ${get("day")} de ${cap(get("month"))} del ${get("year")} ${get("hour")}:${get("minute")} ${period}`;
}

function formatEnglish(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
    year:    "numeric",
    hour:    "2-digit",
    minute:  "2-digit",
    hour12:  true,
  }).format(date);
}

const formattedDateTime = locale === "es" ? formatNicaragua(time) : formatEnglish(time);

return (
  <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 hover:bg-white backdrop-blur-md border border-gray-200 shadow-sm transition-all group">
    <Clock className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
    <span className="text-sm font-poppins font-medium text-gray-700 capitalize">
      {formattedDateTime}
    </span>
  </div>
);
```

> **Note:** Remove `capitalize` from the `<span>` className if you prefer — the helper already capitalizes weekday and month explicitly. Keeping it is harmless.

- [ ] **Step 5.2: Verify type-check passes**

```bash
pnpm build 2>&1 | grep -E "error TS|✓|Failed"
```

Expected: no TypeScript errors.

- [ ] **Step 5.3: Commit**

```bash
git add components/dashboard/DateTimeDisplay.tsx
git commit -m "feat(topbar): display datetime in Nicaragua format using formatToParts"
```

---

## Task 6: Manual verification

No automated test suite exists. Verify in the browser by running the dev server:

```bash
pnpm dev
```

**Check 1 — Topbar clock (any page, locale `es`)**
- Expected: `"Martes 12 de Mayo del 2026 01:00 PM"` (weekday and month capitalized, `"del"` before year, 12-hour period in uppercase, no timezone suffix).

**Check 2 — empresa_admin modal: viewing a miembro**
1. Log in as an empresa_admin.
2. Navigate to `/es/dashboard/empresa/usuarios`.
3. Click "Editar" on a user with `rol = miembro`.
4. Expected: all fields (nombre, telefono, email, documento) are editable; estado toggle is active.

**Check 3 — empresa_admin modal: viewing another empresa_admin**
1. Click "Editar" on a user with `rol = empresa_admin` that is NOT the logged-in user.
2. Expected: personal data fields (nombre, telefono, email, documento) are **read-only** (shown as `ReadField`); estado toggle is active and works.

**Check 4 — empresa_admin modal: viewing own account**
1. Click "Editar" on the logged-in user's own row.
2. Expected: all personal info fields are editable; estado toggle buttons are **disabled** (grayed out, `cursor-not-allowed`); amber note `"No puedes desactivar tu propia cuenta."` is visible below the toggle.

**Check 5 — Topbar clock locale `en`**
- Switch to `/en/...` and verify the clock shows standard US format (e.g., `"Tuesday, May 12, 2026, 01:00 PM"`).
