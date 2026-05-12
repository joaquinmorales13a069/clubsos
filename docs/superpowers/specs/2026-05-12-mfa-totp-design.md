# MFA TOTP — Design Spec
**Date:** 2026-05-12  
**Status:** Approved  
**Approach:** Supabase Native MFA + Middleware AAL check

---

## 1. Problem & Goals

ClubSOS needs an optional second authentication layer (MFA) for all users (miembro, empresa_admin, admin). Users who have not configured MFA see a persistent banner on their dashboard home. Users who have MFA enabled are challenged with a TOTP code after login before entering the dashboard.

**Goals:**
- MFA is optional (no forced enrollment)
- TOTP only (Google Authenticator, Authy, etc.) — Supabase native, no external cost
- Challenge happens at login time (aal1 → aal2), not on individual actions
- Persistent banner on all three role home pages until MFA is configured
- Enrollment and removal managed from each role's Ajustes page

**Out of scope:** SMS OTP, email OTP, recovery codes UI (Supabase handles backup codes internally), forced MFA for specific roles.

---

## 2. Architecture & Data Flow

Supabase MFA uses Assurance Levels (AAL):
- `aal1` = authenticated with password only
- `aal2` = authenticated with password + TOTP verified this session

```
Login (email + password)
        │
        ▼
   signInWithPassword
        │
  ┌─────┴──────────────────┐
  │ Has TOTP enrolled?     │ No → Enter dashboard (banner shown)
  └─────┬──────────────────┘
        │ Yes
        ▼
  Session at aal1
        │
        ▼
  Middleware: getAuthenticatorAssuranceLevel()
  nextLevel=aal2, currentLevel=aal1?
        │ Yes → redirect /[locale]/mfa/verificar
        │ No  → proceed
        ▼
  User enters 6-digit code
        │
        ▼
  mfa.challengeAndVerify()
        │
        ▼
  Session at aal2 → redirect /[locale]/dashboard
```

The AAL check is server-side in the middleware — there is no client-side window where the dashboard is accessible without completing MFA.

---

## 3. New Files

```
app/[locale]/
  mfa/
    layout.tsx                  — Minimal layout: logo only, no sidebar/topbar
    verificar/
      page.tsx                  — Server Component: fetches factorId, renders MfaVerifyForm

components/
  mfa/
    MfaVerifyForm.tsx           — Client Component: 6-digit OTP input + challenge/verify flow
    MfaSetupModal.tsx           — Client Component: 3-step enrollment modal (QR → scan → verify)
  dashboard/
    MfaBanner.tsx               — Server/Client Component: amber banner with "Configurar" CTA
```

**New dependency:** `qrcode.react` — renders the TOTP QR code in `MfaSetupModal`.

---

## 4. Modified Files

| File | Change |
|---|---|
| `utils/supabase/middleware.ts` | Add AAL check after session refresh, before role-based route protection |
| `app/[locale]/(dashboard)/dashboard/page.tsx` | Call `mfa.listFactors()` → render `<MfaBanner>` (miembro) |
| `app/[locale]/(dashboard)/dashboard/admin/page.tsx` | Call `mfa.listFactors()` → render `<MfaBanner>` (admin) |
| `app/[locale]/(dashboard)/dashboard/empresa/page.tsx` | Call `mfa.listFactors()` → render `<MfaBanner>` (empresa_admin) |
| `app/[locale]/(dashboard)/dashboard/ajustes/page.tsx` | Add MFA management section |
| `app/[locale]/(dashboard)/dashboard/empresa/ajustes/page.tsx` | Add MFA management section |
| `app/[locale]/(dashboard)/dashboard/admin/sistema/page.tsx` | Add MFA management section (path confirmed: `admin/sistema/page.tsx`) |
| `messages/es.json` + `messages/en.json` | Add MFA translation keys |

---

## 5. Middleware Change

Insert between session refresh and role-fetch logic:

```ts
const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
  const mfaUrl = new URL(`/${locale}/mfa/verificar`, req.url);
  return NextResponse.redirect(mfaUrl);
}
```

**Routes excluded from AAL check:**
- `/mfa/verificar` (avoids redirect loop)
- `/login`, `/signup` (already excluded as public routes)
- `/api/*` (API routes have their own auth guards)

`getAuthenticatorAssuranceLevel()` reads from the JWT — no extra DB round-trip.

---

## 6. MFA Challenge Page (`/mfa/verificar`)

A minimal page outside the dashboard layout (no Sidebar, no Topbar).

**Server Component (`page.tsx`):**
- Calls `mfa.listFactors()` to retrieve the enrolled `factorId`
- If no factor found (shouldn't happen due to middleware), redirects to `/dashboard`
- Passes `factorId` to `<MfaVerifyForm>`

**Client Component (`MfaVerifyForm`):**
1. On mount → `mfa.challenge({ factorId })` → receive `challengeId`
2. Renders a 6-digit OTP input (auto-submits on digit 6)
3. On submit → `mfa.verify({ factorId, challengeId, code })`
4. Success → `router.push('/[locale]/dashboard')`
5. Error → `toast.error(...)` + clear input (Supabase rate-limits brute force internally)

**UI:**
```
Logo ClubSOS (centered)
────────────────────────
Verificación en dos pasos
Abre tu app autenticadora e ingresa el código actual.

[ _ ][ _ ][ _ ][ _ ][ _ ][ _ ]

[ Verificar ]

¿Problemas? Contacta soporte
```

---

## 7. Enrollment Flow (`MfaSetupModal`)

Three linear steps, driven from within the modal:

**Step 1 — Generate**
- Call `mfa.enroll({ factorType: 'totp', friendlyName: 'ClubSOS' })`
- Receive `{ factorId, totp: { qr_code, secret, uri } }`

**Step 2 — Scan**
- Render QR code with `qrcode.react` using `totp.uri`
- Show manual secret (`totp.secret`) as fallback for users who cannot scan
- "Ya escaneé" button advances to Step 3

**Step 3 — Verify**
- 6-digit OTP input
- Call `mfa.challengeAndVerify({ factorId, code })`
- Success → session at aal2, modal closes, banner disappears
- Error → toast + retry (remain on Step 3)

**Cleanup on early close:** If modal is closed before Step 3 completes, call `mfa.unenroll({ factorId })` to remove the unverified factor.

---

## 8. MFA Banner (`MfaBanner`)

Shown on all three role home pages while `mfaEnrolled === false`.

**Appearance:** Amber strip, non-dismissible.

```
🔒  Protege tu cuenta con autenticación de dos factores.
    Activa el MFA para mayor seguridad.       [Configurar ahora →]
```

- Tailwind: `bg-amber-50 border border-amber-200 text-amber-800`
- "Configurar ahora" opens `MfaSetupModal`
- On successful enrollment, a state callback hides the banner without page reload

**Integration:** Each home page (`dashboard/page.tsx`, `admin/page.tsx`, `empresa/page.tsx`) calls `mfa.listFactors()` server-side independently and renders `{!mfaEnrolled && <MfaBanner />}`. The layout does not pass this data (App Router layouts cannot pass props to page children). Since `listFactors()` reads from the JWT it adds negligible overhead.

---

## 9. Ajustes — MFA Management Section

Added to the ajustes page for all three roles (miembro, empresa_admin, admin).

**When not enrolled:**
```
Autenticación de dos factores     [Estado: Inactivo]
─────────────────────────────────────────────────
Añade una capa extra de seguridad a tu cuenta.
[ Activar MFA ]  → opens MfaSetupModal
```

**When enrolled:**
```
Autenticación de dos factores     [Estado: Activo ✓]
─────────────────────────────────────────────────
Tu cuenta está protegida con TOTP.
[ Desactivar ]  → confirm dialog → mfa.unenroll()
```

After unenrollment, the page refreshes state and shows the inactive view.

---

## 10. i18n Keys (new)

Both `messages/es.json` and `messages/en.json` must receive keys under `MFA`:

```json
"MFA": {
  "banner": {
    "title": "Protege tu cuenta con autenticación de dos factores",
    "description": "Activa el MFA para mayor seguridad.",
    "cta": "Configurar ahora"
  },
  "verify": {
    "title": "Verificación en dos pasos",
    "description": "Abre tu app autenticadora e ingresa el código actual.",
    "submit": "Verificar",
    "support": "¿Problemas? Contacta soporte",
    "error": "Código incorrecto. Intenta de nuevo."
  },
  "setup": {
    "title": "Configurar autenticación de dos factores",
    "step1Title": "Escanea el código QR",
    "step1Desc": "Usa Google Authenticator, Authy u otra app compatible.",
    "manualSecret": "Clave manual",
    "step2CTA": "Ya escaneé",
    "step3Title": "Ingresa el código de verificación",
    "confirm": "Confirmar",
    "successToast": "MFA activado correctamente",
    "errorToast": "Código incorrecto. Intenta de nuevo."
  },
  "settings": {
    "title": "Autenticación de dos factores",
    "statusActive": "Activo",
    "statusInactive": "Inactivo",
    "enableCTA": "Activar MFA",
    "disableCTA": "Desactivar",
    "enabledDesc": "Tu cuenta está protegida con TOTP.",
    "disabledDesc": "Añade una capa extra de seguridad a tu cuenta.",
    "disableConfirm": "¿Seguro que deseas desactivar el MFA?",
    "disableSuccess": "MFA desactivado."
  }
}
```

---

## 11. Error & Edge Cases

| Case | Handling |
|---|---|
| User reaches `/mfa/verificar` without a session | Middleware redirects to `/login` before AAL check |
| User reaches `/mfa/verificar` but has no factors enrolled | Server Component redirects to `/dashboard` |
| User closes enrollment modal at Step 1 or 2 | `mfa.unenroll(factorId)` called to clean up unverified factor |
| Wrong TOTP code on verify | `toast.error` + clear input; Supabase rate-limits attempts |
| User unenrolls MFA while session is aal2 | Session remains aal2 until next login; on re-login, no challenge |
| Admin ajustes page path | Confirmed: `app/[locale]/(dashboard)/dashboard/admin/sistema/page.tsx` |
