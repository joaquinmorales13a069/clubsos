# MFA Bug Fixes Design

**Date:** 2026-05-14  
**Branch:** fix/ui-bugs  
**Scope:** Two independent MFA bugs — wrong TOTP issuer label and login verification failure for users with stale unverified factors.

---

## Bug 1 — TOTP issuer shows "localhost:3000" in authenticator apps

### Root cause

`supabase.auth.mfa.enroll()` in `MfaSetupModal.tsx` passes `friendlyName: 'ClubSOS'` but not `issuer`. The `friendlyName` is an internal Supabase label only; the TOTP QR code URI's issuer comes from the Supabase project's configured TOTP issuer setting, which defaults to the site URL (`localhost:3000`).

The Supabase JS SDK v2 supports an `issuer` field in the enroll params that overrides the project-level setting.

### Fix

File: `components/mfa/MfaSetupModal.tsx`

```ts
await supabase.auth.mfa.enroll({
  factorType: "totp",
  friendlyName: "ClubSOS",
  issuer: "ClubSOS",  // add
});
```

### Scope

Only affects new enrollments. Existing entries already in authenticator apps will retain the old label — the TOTP codes continue to work (issuer is display metadata only, does not affect code generation). Users who want the correct name must re-enroll.

---

## Bug 2 — Existing users with verified TOTP cannot log in (codes rejected)

### Root cause

`supabase.auth.mfa.listFactors()` returns all factors: both `verified` and `unverified`. Unverified factors accumulate when a user opens the MFA setup modal and closes the browser tab before completing enrollment (the cleanup in `MfaSetupModal.handleClose()` only runs when the user clicks the X button).

Every place in the codebase that reads `listFactors()` uses `totp[0]` without filtering by `status`. If `totp[0]` is an unverified factor, `challengeAndVerify(factorId, code)` fails — even though the user has a valid verified factor later in the array.

The middleware redirects to `/mfa/verificar` whenever `nextLevel === 'aal2'`, which only triggers when the user has at least one verified factor. So these users are confirmed to have a working factor, but the wrong factorId is being used for the challenge.

### Fix — 8 files

#### A. `app/[locale]/mfa/verificar/page.tsx` — critical path + cleanup

Before picking the factorId, delete any unverified factors via service role (admin client does not require AAL2). Then select only the verified factor.

```ts
import { createServiceClient } from "@/utils/supabase/service";

// After listFactors():
const admin = createServiceClient();
const unverified = factors?.totp.filter(f => f.status !== "verified") ?? [];
await Promise.all(
  unverified.map(f => admin.auth.admin.mfa.deleteFactor({ userId: user.id!, id: f.id }))
);

const factorId = factors?.totp.find(f => f.status === "verified")?.id ?? null;
```

#### B. Ajustes pages (3 files)

`app/[locale]/(dashboard)/dashboard/ajustes/page.tsx`  
`app/[locale]/(dashboard)/dashboard/empresa/ajustes/page.tsx`  
`app/[locale]/(dashboard)/dashboard/admin/sistema/page.tsx`

Change both derivations:

```ts
// before
const mfaEnrolled = (mfaFactors?.totp?.length ?? 0) > 0;
const mfaFactorId = mfaFactors?.totp[0]?.id ?? null;

// after
const mfaEnrolled = mfaFactors?.totp.some(f => f.status === "verified") ?? false;
const mfaFactorId = mfaFactors?.totp.find(f => f.status === "verified")?.id ?? null;
```

#### C. Home pages — banner only (3 files)

`app/[locale]/(dashboard)/dashboard/page.tsx`  
`app/[locale]/(dashboard)/dashboard/empresa/page.tsx`  
`app/[locale]/(dashboard)/dashboard/admin/page.tsx`

```ts
// before
const mfaEnrolled = (mfaRes.data?.totp?.length ?? 0) > 0;

// after
const mfaEnrolled = mfaRes.data?.totp.some(f => f.status === "verified") ?? false;
```

#### D. `components/mfa/MfaSection.tsx` — post-enrollment refresh

In `handleEnrolled()`:

```ts
// before
const factor = data?.totp[0];

// after
const factor = data?.totp.find(f => f.status === "verified");
```

### Recovery for currently blocked users

On their next login attempt after deploy:
1. They log in → session at AAL1 → middleware redirects to `/mfa/verificar`
2. `MfaVerificarPage` lists their factors, finds unverified ones, deletes them via service role
3. Picks the verified factor's ID
4. `challengeAndVerify` succeeds → session upgrades to AAL2 → redirected to dashboard

No manual admin intervention required.

---

## Files changed

| File | Change |
|------|--------|
| `components/mfa/MfaSetupModal.tsx` | Add `issuer: "ClubSOS"` to `enroll()` |
| `app/[locale]/mfa/verificar/page.tsx` | Cleanup unverified factors + filter by verified |
| `app/[locale]/(dashboard)/dashboard/ajustes/page.tsx` | Filter by verified for enrolled/factorId |
| `app/[locale]/(dashboard)/dashboard/empresa/ajustes/page.tsx` | Same |
| `app/[locale]/(dashboard)/dashboard/admin/sistema/page.tsx` | Same |
| `app/[locale]/(dashboard)/dashboard/page.tsx` | Filter by verified for enrolled check |
| `app/[locale]/(dashboard)/dashboard/empresa/page.tsx` | Same |
| `app/[locale]/(dashboard)/dashboard/admin/page.tsx` | Same |
| `components/mfa/MfaSection.tsx` | Filter by verified in `handleEnrolled()` |

Total: 9 files, all localized changes with no schema migrations needed.
