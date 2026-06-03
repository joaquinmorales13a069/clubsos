# Pagadito Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Pagadito as the primary payment gateway for appointments excluded from contract coverage, replacing the current manual link-paste flow.

**Architecture:** 100% Next.js. TypeScript client over Pagadito Connect (REST v2, JSON) with HTTP Basic Auth. Return URL as primary reconciliation path + `pg_cron` every 2 min as fallback. Feature flag (`PAGADITO_UID` empty → init returns 503, wizard hides `link_pago`).

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Supabase (Postgres + RPC + pg_cron + pg_net) · sonner toasts · next-intl

**Spec:** `docs/superpowers/specs/2026-06-01-pagadito-integration-design.md`

---

## Project Conventions

- **No unit test framework.** Verification per task is `pnpm build` (type-check via tsc) + `pnpm lint` (eslint). Manual smoke tests via dev server (`pnpm dev`) + curl for routes. The Pagadito client's smoke script (`scripts/pagadito-smoke.ts`) is the integration test against sandbox.
- **Migrations:** filename pattern `YYYYMMDDHHMMSS_short_description.sql`, apply with `supabase db push`.
- **i18n:** every user-facing string in `messages/es.json` AND `messages/en.json` — both files updated in the same commit.
- **Toasts:** `sonner` only (`toast.success/error/info`). No inline JSX success/error markup.
- **Route handler auth:** every protected route checks `auth.getUser()` + role lookup before any data access.
- **Commit style:** matches recent history (`feat(scope):`, `fix(scope):`, `docs(scope):`, etc.).

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260601130000_pagadito_integration.sql` | enum `estado_pago += 'iniciado'`, columns + indexes on `pagos` |
| `supabase/migrations/20260601130100_confirmar_cita_por_pago_rpc.sql` | atomic RPC: pago → verificado + cita → confirmado + cita_eventos |
| `supabase/migrations/20260601130200_pagadito_pg_cron.sql` | scheduled reconcile (separate PR) |
| `lib/pagadito/types.ts` | `PagaditoCurrency`, `PagaditoDetail`, `ExecTransInput`, `GetStatusResult` |
| `lib/pagadito/config.ts` | reads env, exposes endpoints sandbox/prod, feature-flag check |
| `lib/pagadito/errors.ts` | `PagaditoError` class + code-to-i18n mapping |
| `lib/pagadito/client.ts` | `PagaditoClient` with `execTrans/getStatus` over Pagadito Connect, Basic Auth per request |
| `scripts/pagadito-smoke.ts` | manual end-to-end smoke: execTrans → getStatus |
| `app/api/citas/[id]/pagadito/init/route.ts` | POST — member-owned cita, generates link |
| `app/api/pagadito/return/route.ts` | GET — return URL handler, idempotent |
| `app/api/internal/pagadito/reconcile/route.ts` | POST — cron-called, batch reconcile |
| `components/dashboard/miembro/citas/steps/PasoPagaditoRedirect.tsx` | wizard step: calls init, redirects browser |

**Modified files:**

| Path | Why |
|---|---|
| `components/dashboard/miembro/citas/types.ts` | add `'pagadito_redirect'` to `WizardStep` |
| `components/dashboard/miembro/citas/MisCitas.tsx` | wire new step (mirror `transferencia` pattern) |
| `components/dashboard/miembro/citas/steps/PasoConfirmar.tsx` | add `onPagaditoRequired(citaId)` prop + branch |
| `app/[locale]/(dashboard)/dashboard/citas/[id]/page.tsx` | banner/toast for `?pago=ok\|rechazado\|pendiente\|desconocido` |
| `messages/es.json` + `messages/en.json` | Pagadito wizard + retorno + error keys |
| `CLAUDE.md` | document new env vars + feature flag behavior |

---

## Phase A — Schema (PR 1)

### Task 1: Migration — `pagadito_integration` schema

**Files:**
- Create: `supabase/migrations/20260601130000_pagadito_integration.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Pagadito integration: extend estado_pago enum and add tracking columns to pagos.
-- Spec: docs/superpowers/specs/2026-06-01-pagadito-integration-design.md

BEGIN;

-- 1. Extend estado_pago enum with 'iniciado' (link issued, awaiting completion).
--    ADD VALUE cannot run in the same tx as DDL on tables that USE the type in some
--    PG versions; if `supabase db push` complains, split this into its own migration.
ALTER TYPE public.estado_pago ADD VALUE IF NOT EXISTS 'iniciado' BEFORE 'verificado';

-- 2. Pagadito tracking columns on pagos.
ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS pagadito_token   TEXT,
  ADD COLUMN IF NOT EXISTS pagadito_ern     TEXT,
  ADD COLUMN IF NOT EXISTS pagadito_estado  TEXT,
  ADD COLUMN IF NOT EXISTS pagadito_payload JSONB,
  ADD COLUMN IF NOT EXISTS iniciado_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.pagos.pagadito_token   IS 'Token returned by Pagadito exec-trans (opaque, used by return URL).';
COMMENT ON COLUMN public.pagos.pagadito_ern     IS 'External Reference Number we send to Pagadito. Unique per transaction.';
COMMENT ON COLUMN public.pagos.pagadito_estado  IS 'Raw last-known Pagadito transaction status (COMPLETED, EXPIRED, VERIFYING, FAILED, ...).';
COMMENT ON COLUMN public.pagos.pagadito_payload IS 'Snapshot of the last get-status response for audit.';
COMMENT ON COLUMN public.pagos.iniciado_at      IS 'When exec-trans was called. Used by the reconcile cron.';

-- 3. Indexes.
--    Unique partial index prevents ERN collisions from concurrent init calls.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_pagadito_ern
  ON public.pagos (pagadito_ern) WHERE pagadito_ern IS NOT NULL;

--    Partial index over only 'iniciado' rows keeps the reconcile cron query fast.
CREATE INDEX IF NOT EXISTS idx_pagos_estado_iniciado_at
  ON public.pagos (iniciado_at)
  WHERE estado = 'iniciado';

COMMIT;
```

- [ ] **Step 2: Type-check syntax with a dry parse**

Run: `psql --no-psqlrc -f supabase/migrations/20260601130000_pagadito_integration.sql --set ON_ERROR_STOP=on -d postgres -h localhost -p 54322 -U postgres` (against local supabase if available)
OR just inspect visually. Skip if local supabase isn't running — the next task applies it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260601130000_pagadito_integration.sql
git commit -m "feat(pagadito): add schema migration for tracking columns

Extends estado_pago enum with 'iniciado' and adds pagadito_token,
pagadito_ern, pagadito_estado, pagadito_payload, iniciado_at to pagos
with supporting indexes."
```

---

### Task 2: Migration — `confirmar_cita_por_pago` RPC

**Files:**
- Create: `supabase/migrations/20260601130100_confirmar_cita_por_pago_rpc.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Atomic RPC: mark pago verificado, advance cita to confirmado, enqueue cita_eventos.
-- Called by:
--   * GET /api/pagadito/return  (when get-status reports completed)
--   * POST /api/internal/pagadito/reconcile  (cron, same condition)
-- Idempotent: if pago is already 'verificado', no-op.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirmar_cita_por_pago(
  p_pago_id          UUID,
  p_pagadito_payload JSONB DEFAULT NULL,
  p_reference        TEXT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago        RECORD;
  v_cita        RECORD;
  v_new_estado  public.estado_sync;
BEGIN
  -- Lock the pago row to serialize concurrent return URL + cron calls.
  SELECT id, cita_id, estado, metodo
    INTO v_pago
    FROM public.pagos
   WHERE id = p_pago_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAGO_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: already verified → no-op.
  IF v_pago.estado = 'verificado' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  -- Mark pago verificado.
  UPDATE public.pagos
     SET estado           = 'verificado',
         pagadito_estado  = COALESCE(p_pagadito_payload->>'code', pagadito_estado),
         pagadito_payload = COALESCE(p_pagadito_payload, pagadito_payload),
         referencia       = COALESCE(p_reference, referencia),
         verificado_at    = NOW()
   WHERE id = p_pago_id;

  -- Advance cita to confirmado ONLY if it's in a transitionable state.
  -- If the member cancelled while paying, leave the cita cancelado and flag for refund.
  SELECT id, estado_sync INTO v_cita
    FROM public.citas
   WHERE id = v_pago.cita_id
   FOR UPDATE;

  IF v_cita.estado_sync IN ('pendiente_pago', 'pendiente_admin', 'pendiente') THEN
    UPDATE public.citas
       SET estado_sync = 'confirmado'
     WHERE id = v_cita.id;
    v_new_estado := 'confirmado';

    -- Enqueue notification event so procesar_eventos_cita dispatches WhatsApp/email.
    INSERT INTO public.cita_eventos (cita_id, evento, payload)
    VALUES (v_cita.id, 'confirmada', jsonb_build_object('source', 'pagadito'));
  ELSE
    -- Cita is in a terminal/non-transitionable state (cancelado, rechazado, completado).
    -- Money was charged anyway — admin must process refund manually.
    v_new_estado := v_cita.estado_sync;
    INSERT INTO public.cita_eventos (cita_id, evento, payload)
    VALUES (
      v_cita.id,
      'pago_sin_cita_activa',
      jsonb_build_object('pago_id', p_pago_id, 'cita_estado', v_cita.estado_sync)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'cita_estado', v_new_estado);
END;
$$;

-- Only service_role and the route handlers (which use service_role for internal endpoints,
-- or anon for the return URL which doesn't have a session) need to call this.
REVOKE ALL ON FUNCTION public.confirmar_cita_por_pago(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_cita_por_pago(UUID, JSONB, TEXT) TO service_role;

COMMIT;
```

- [ ] **Step 2: Verify the `cita_eventos` schema accepts `'pago_sin_cita_activa'` event**

Run: `grep -rn "evento\|enum.*evento\|CREATE TYPE.*evento" supabase/migrations/*citas_native* supabase/migrations/*cita_eventos* 2>/dev/null | head -10`

Expected: `evento` is a TEXT column (no enum constraint), OR an enum that needs extending. If it's an enum, add `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'pago_sin_cita_activa' BEFORE …;` and also `'confirmada'` if missing.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260601130100_confirmar_cita_por_pago_rpc.sql
git commit -m "feat(pagadito): add confirmar_cita_por_pago RPC

Atomically marks pago as verificado, advances cita to confirmado when
in a transitionable state, and enqueues cita_eventos for notification
dispatch. Idempotent on repeat calls."
```

---

### Task 3: Apply migrations + sanity check

- [ ] **Step 1: Push migrations to Supabase**

Run: `supabase db push`
Expected: Both migrations applied without error.

- [ ] **Step 2: Verify enum was extended**

Run via Supabase SQL editor or psql:
```sql
SELECT unnest(enum_range(NULL::public.estado_pago));
```
Expected: returns `pendiente`, `iniciado`, `verificado`, `rechazado` (order matters: `iniciado` BEFORE `verificado`).

- [ ] **Step 3: Verify new columns exist on `pagos`**

```sql
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'pagos'
   AND column_name IN ('pagadito_token','pagadito_ern','pagadito_estado','pagadito_payload','iniciado_at');
```
Expected: 5 rows.

- [ ] **Step 4: Verify RPC is callable by service_role only**

```sql
SELECT proname, prosrc IS NOT NULL AS exists,
       pg_get_function_identity_arguments(oid) AS args
  FROM pg_proc
 WHERE proname = 'confirmar_cita_por_pago';
```
Expected: 1 row, args `p_pago_id uuid, p_pagadito_payload jsonb, p_reference text`.

- [ ] **Step 5: No commit (verification only).**

---

## Phase B — Pagadito Client + Smoke Script (PR 2 part 1)

### Task 4: `lib/pagadito/types.ts`

**Files:**
- Create: `lib/pagadito/types.ts`

- [ ] **Step 1: Write the file**

```ts
/**
 * Pagadito Connect client public types.
 *
 * Currencies supported by Pagadito per the official 2023 docs. The merchant
 * account decides which are actually accepted — runtime errors map to
 * `currency_not_enabled` (PG3008).
 */
export type PagaditoCurrency =
  | "NIO" // Nicaragua
  | "USD" // Dólar
  | "HNL" // Honduras
  | "GTQ" // Guatemala
  | "CRC" // Costa Rica
  | "DOP" // República Dominicana
  | "PAB"; // Panamá

/** country_code soportado por Connect. Default "SV" si se omite. */
export type PagaditoCountry = "SV" | "GT";

/** Custom params keys aceptadas (param1..param5). Deben habilitarse en panel del comercio. */
export type PagaditoCustomParamKey = "param1" | "param2" | "param3" | "param4" | "param5";

export interface PagaditoDetail {
  quantity:     number;
  description:  string;
  /** Per-unit price. Sum of (price * quantity) over details MUST equal ExecTransInput.amount. */
  price:        number;
  url_product?: string;
}

export interface ExecTransInput {
  /** External Reference Number — unique per transaction. Pagadito returns PG3018 on dup. */
  ern:                  string;
  amount:               number;
  currency:             PagaditoCurrency;
  details:              PagaditoDetail[];
  /** Defaults to "SV" if omitted. */
  countryCode?:         PagaditoCountry;
  /** If true, transaction is allowed to live past the default 10-minute expiry. */
  extendedExpiration?:  boolean;
  /** Custom params echoed back via get-status. Must be enabled in merchant panel. */
  customParams?:        Partial<Record<PagaditoCustomParamKey, string>>;
}

export interface ExecTransResult {
  /** Checkout URL the merchant must redirect the buyer to. */
  url:   string;
  /** Opaque transaction token; persist as pagos.pagadito_token. */
  token: string;
}

/** Internal coarse-grained status, derived from Pagadito's data.status string. */
export type PagaditoStatus = "completed" | "pending" | "failed" | "cancelled";

/** Raw Pagadito transaction status string (data.status field). */
export type PagaditoRawStatus =
  | "REGISTERED" | "COMPLETED" | "VERIFYING" | "REVOKED"
  | "FAILED" | "CANCELED" | "EXPIRED" | "PENDING" | "UNCOLLECTABLE";

export interface GetStatusResult {
  /** Pagadito response code (PG1003 on success, PGxxxx on errors). */
  code:        string;
  /** Coarse-grained mapping for the route handlers / cron. */
  status:      PagaditoStatus;
  /** Raw status string from Pagadito (stored in pagos.pagadito_estado). */
  rawStatus:   PagaditoRawStatus | string;
  /** Bank authorization reference, present on success. */
  reference?:  string;
  /** Transaction date as reported by Pagadito. */
  dateTrans?:  string;
  /** Full response payload for audit (stored in pagos.pagadito_payload). */
  raw:         unknown;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: no errors related to `lib/pagadito/types.ts`. (Other files may still error — that's fine, they'll be added next.)

- [ ] **Step 3: Commit**

```bash
git add lib/pagadito/types.ts
git commit -m "feat(pagadito): add client public types"
```

---

### Task 5: `lib/pagadito/config.ts`

**Files:**
- Create: `lib/pagadito/config.ts`

- [ ] **Step 1: Write the file**

```ts
/**
 * Pagadito configuration loaded from environment variables.
 *
 * Feature flag: when PAGADITO_UID is empty, `isConfigured` is false and
 * route handlers should return 503 / the wizard should hide link_pago.
 */
type PagaditoEnv = "sandbox" | "production";

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

function required(key: string): string {
  const v = env(key);
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

const PAGADITO_ENV: PagaditoEnv =
  (env("PAGADITO_ENV") as PagaditoEnv | undefined) ?? "sandbox";

// Pagadito Connect base URLs (REST v2, JSON). Confirmed against official 2023 docs.
// Endpoints derived: `${baseUrl}/api/v2/exec-trans` and `${baseUrl}/api/v2/get-status`.
const BASE_URLS: Record<PagaditoEnv, string> = {
  sandbox:    "https://sandbox-connect.pagadito.com",
  production: "https://connect.pagadito.com",
};

export const PAGADITO = {
  env:             PAGADITO_ENV,
  baseUrl:         BASE_URLS[PAGADITO_ENV],
  execTransUrl:    `${BASE_URLS[PAGADITO_ENV]}/api/v2/exec-trans`,
  getStatusUrl:    `${BASE_URLS[PAGADITO_ENV]}/api/v2/get-status`,
  /** True when minimum env is set; routes/wizard should gate on this. */
  isConfigured:    Boolean(env("PAGADITO_UID") && env("PAGADITO_WSK")),
  /** Lazy accessors — throw at call-time, not at module load. */
  get uid()             { return required("PAGADITO_UID"); },
  get wsk()             { return required("PAGADITO_WSK"); },
  /** Configured in panel del comercio. Kept here as source-of-truth only. */
  get returnUrl()       { return required("PAGADITO_RETURN_URL"); },
  get reconcileSecret() { return required("PAGADITO_RECONCILE_SECRET"); },
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: `lib/pagadito/config.ts` compiles. The lazy getters mean missing env vars at load time don't crash the build.

- [ ] **Step 3: Commit**

```bash
git add lib/pagadito/config.ts
git commit -m "feat(pagadito): add config with sandbox/prod endpoints and feature flag"
```

---

### Task 6: `lib/pagadito/errors.ts`

**Files:**
- Create: `lib/pagadito/errors.ts`

- [ ] **Step 1: Write the file**

```ts
/**
 * Pagadito Connect response codes (per official 2023 docs).
 * PG1xxx = success, PG2xxx = data validation, PG3xxx = service/business errors.
 */
export class PagaditoError extends Error {
  constructor(
    public code:       string,   // "PG2001", "PG3007", "PG3018", …
    public i18nKey:    string,   // "invalid_credentials", "invalid_amount", …
    public httpStatus: number,   // 400, 502, …
    message:           string,
  ) {
    super(message);
    this.name = "PagaditoError";
  }
}

type Mapping = { i18nKey: string; status: number };

/**
 * Subset of Pagadito codes we map. Full list in the official docs PDF
 * (section "Listado de respuestas de APIPG, WSPG y Connect"). Codes not
 * mapped here fall through to FALLBACK.
 */
const CODE_MAP: Record<string, Mapping> = {
  // Success (treated as 200 — the client checks for these before throwing)
  PG1002: { i18nKey: "transaction_registered", status: 200 },  // exec-trans OK
  PG1003: { i18nKey: "transaction_status",     status: 200 },  // get-status OK

  // Data validation errors (400: caller / our side has bad data)
  PG2001: { i18nKey: "incomplete_data",        status: 400 },
  PG2002: { i18nKey: "invalid_format",         status: 400 },
  PG2003: { i18nKey: "invalid_custom_params",  status: 400 },

  // Service / business errors (mostly 502: Pagadito's side or merchant config)
  PG3001: { i18nKey: "connection_failed",      status: 502 },
  PG3002: { i18nKey: "generic",                status: 502 },
  PG3003: { i18nKey: "unregistered_tx",        status: 502 },
  PG3004: { i18nKey: "amount_mismatch",        status: 400 },
  PG3005: { i18nKey: "connection_disabled",    status: 502 },
  PG3006: { i18nKey: "amount_exceeded_max",    status: 400 },
  PG3007: { i18nKey: "invalid_credentials",    status: 502 },  // "Denied access"
  PG3008: { i18nKey: "currency_not_enabled",   status: 502 },
  PG3009: { i18nKey: "amount_below_min",       status: 400 },
  PG3017: { i18nKey: "tx_not_owned",           status: 502 },
  PG3018: { i18nKey: "ern_duplicate",          status: 502 },  // already-sent ERN
  PG3023: { i18nKey: "invalid_custom_params",  status: 400 },
  PG3024: { i18nKey: "permission_denied",      status: 502 },
  PG3025: { i18nKey: "xss_detected",           status: 400 },
};

const FALLBACK: Mapping = { i18nKey: "generic", status: 502 };

export function mapPagaditoCode(code: string): Mapping {
  return CODE_MAP[code] ?? FALLBACK;
}

export function pagaditoErrorFromCode(code: string, message: string): PagaditoError {
  const m = mapPagaditoCode(code);
  return new PagaditoError(code, m.i18nKey, m.status, message);
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add lib/pagadito/errors.ts
git commit -m "feat(pagadito): add error class and code-to-i18n mapping"
```

---

### Task 7: `lib/pagadito/client.ts`

**Wire format:** Pagadito Connect (REST v2). Both endpoints are `POST` with `Content-Type: application/json`, body as JSON, HTTP Basic Auth on every request. Response is JSON with shape `{ code, data, message }`. Field names below are taken verbatim from the official 2023 docs PDF.

**Files:**
- Create: `lib/pagadito/client.ts`

- [ ] **Step 1: Write the file**

```ts
import { PAGADITO } from "./config";
import { pagaditoErrorFromCode, PagaditoError } from "./errors";
import type {
  ExecTransInput,
  ExecTransResult,
  GetStatusResult,
  PagaditoStatus,
  PagaditoRawStatus,
} from "./types";

/** Raw Pagadito Connect response envelope: { code, data, message }. */
interface RawResponse<T = unknown> {
  code:    string;
  data?:   T;
  message: string;
}

interface ExecTransData {
  url?:   string;
  token?: string;
}

interface GetStatusData {
  status?:     string;  // "COMPLETED" | "EXPIRED" | "VERIFYING" | ...
  reference?:  string;
  date_trans?: string;
}

export class PagaditoClient {
  /**
   * exec-trans — register a transaction. Returns the checkout URL + token.
   * POST {baseUrl}/api/v2/exec-trans with Basic Auth.
   */
  async execTrans(input: ExecTransInput): Promise<ExecTransResult> {
    this.validateExecTrans(input);

    const body = {
      ern:                 input.ern,
      amount:              Number(input.amount.toFixed(2)),
      currency:            input.currency,
      country_code:        input.countryCode ?? "SV",
      extended_expiration: input.extendedExpiration ?? false,
      details:             input.details.map((d) => ({
        quantity:    d.quantity,
        description: d.description,
        price:       Number(d.price.toFixed(2)),
        ...(d.url_product ? { url_product: d.url_product } : {}),
      })),
      ...(input.customParams ? { custom_params: input.customParams } : {}),
    };

    const res = await this.callRaw<ExecTransData>(PAGADITO.execTransUrl, body, "exec-trans");

    // PG1002 = "Transaction register successful." per docs.
    if (res.code !== "PG1002") {
      throw pagaditoErrorFromCode(res.code, res.message);
    }
    if (!res.data?.url || !res.data?.token) {
      throw pagaditoErrorFromCode(res.code, "exec-trans: missing data.url / data.token");
    }
    return { url: res.data.url, token: res.data.token };
  }

  /**
   * get-status — query a transaction by its token.
   * POST {baseUrl}/api/v2/get-status with Basic Auth. Idempotent.
   */
  async getStatus(
    transactionToken: string,
    countryCode: "SV" | "GT" = "SV",
  ): Promise<GetStatusResult> {
    const res = await this.callRaw<GetStatusData>(
      PAGADITO.getStatusUrl,
      { token: transactionToken, country_code: countryCode },
      "get-status",
    );

    // PG1003 = "Transaction status." per docs.
    if (res.code !== "PG1003") {
      throw pagaditoErrorFromCode(res.code, res.message);
    }

    const rawStatus = (res.data?.status ?? "PENDING") as PagaditoRawStatus;
    return {
      code:      res.code,
      status:    this.rawStatusToStatus(rawStatus),
      rawStatus,
      reference: res.data?.reference,
      dateTrans: res.data?.date_trans,
      raw:       res,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────────────

  /** Map Pagadito's raw status string to our coarse-grained enum. */
  private rawStatusToStatus(raw: string): PagaditoStatus {
    switch (raw) {
      case "COMPLETED":      return "completed";
      case "FAILED":
      case "REVOKED":
      case "UNCOLLECTABLE":  return "failed";
      case "CANCELED":
      case "EXPIRED":        return "cancelled";
      case "REGISTERED":
      case "VERIFYING":
      case "PENDING":        return "pending";
      default:               return "pending";  // unknown → conservative
    }
  }

  private validateExecTrans(input: ExecTransInput): void {
    if (!input.ern || input.ern.length === 0)
      throw new PagaditoError("LOCAL_VALIDATION", "invalid_ern", 400, "ern required");
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      throw new PagaditoError("LOCAL_VALIDATION", "invalid_amount", 400, "amount must be > 0");
    if (input.details.length === 0)
      throw new PagaditoError("LOCAL_VALIDATION", "invalid_amount", 400, "details required");
    const sum = input.details.reduce((a, d) => a + d.price * d.quantity, 0);
    // Allow 1¢ rounding tolerance.
    if (Math.abs(sum - input.amount) > 0.01)
      throw new PagaditoError("LOCAL_VALIDATION", "invalid_amount", 400,
        `details sum (${sum}) does not match amount (${input.amount})`);
  }

  private buildAuthHeader(): string {
    // Basic Auth: base64(UID:WSK). Pagadito accepts the same credentials on every request.
    const credentials = Buffer.from(`${PAGADITO.uid}:${PAGADITO.wsk}`).toString("base64");
    return `Basic ${credentials}`;
  }

  private async callRaw<T>(
    url:     string,
    body:    Record<string, unknown>,
    opName:  string,
  ): Promise<RawResponse<T>> {
    const startedAt = Date.now();
    console.info(`[pagadito] ${opName} starting`);

    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": this.buildAuthHeader(),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new PagaditoError("HTTP_ERROR", "generic", 502,
        `Pagadito HTTP ${res.status}: ${await res.text().catch(() => "(no body)")}`);
    }

    const json = (await res.json()) as RawResponse<T>;
    const elapsed = Date.now() - startedAt;
    console.info(`[pagadito] ${opName} ok code=${json.code} elapsed=${elapsed}ms`);
    return json;
  }
}

// Singleton — no mutable state; safe across concurrent requests within one Next.js worker.
export const pagadito = new PagaditoClient();
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: compiles.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors in `lib/pagadito/`.

- [ ] **Step 4: Commit**

```bash
git add lib/pagadito/client.ts
git commit -m "feat(pagadito): add Connect client with execTrans/getStatus

POST JSON requests with HTTP Basic Auth on every call. Maps Pagadito's
raw data.status string (COMPLETED, EXPIRED, VERIFYING, ...) to a
coarse-grained internal enum. Runtime validation of exec-trans inputs."
```

---

### Task 8: Smoke script

**Files:**
- Create: `scripts/pagadito-smoke.ts`

- [ ] **Step 1: Write the script**

```ts
/**
 * Manual end-to-end smoke test of the Pagadito Connect client.
 *
 * Usage:
 *   PAGADITO_ENV=sandbox \
 *   PAGADITO_UID=<sandbox uid> \
 *   PAGADITO_WSK=<sandbox wsk> \
 *   PAGADITO_RETURN_URL=https://example.com/return \
 *   PAGADITO_RECONCILE_SECRET=dummy \
 *   pnpm tsx scripts/pagadito-smoke.ts
 *
 * Exits 0 on success, 1 on failure.
 */
import { pagadito } from "../lib/pagadito/client";
import { PAGADITO } from "../lib/pagadito/config";

async function main() {
  console.log(`[smoke] env=${PAGADITO.env} baseUrl=${PAGADITO.baseUrl}`);

  if (!PAGADITO.isConfigured) {
    console.error("[smoke] PAGADITO_UID / PAGADITO_WSK not set");
    process.exit(1);
  }

  // 1. exec-trans
  const ern = `SMOKE-${Date.now()}`;
  console.log(`[smoke] step 1: exec-trans ern=${ern} amount=1.00 NIO country=SV`);
  const trans = await pagadito.execTrans({
    ern,
    amount:      1.0,
    currency:    "NIO",
    countryCode: "SV",
    details:     [{ quantity: 1, description: "Smoke test", price: 1.0 }],
  });
  console.log(`[smoke] checkout url=${trans.url}`);
  console.log(`[smoke] transaction token=${trans.token}`);

  // 2. get-status (will be REGISTERED/PENDING until a human pays in sandbox)
  console.log("[smoke] step 2: get-status");
  const status = await pagadito.getStatus(trans.token, "SV");
  console.log(`[smoke] code=${status.code} rawStatus=${status.rawStatus} status=${status.status} ref=${status.reference ?? "-"}`);

  console.log("[smoke] OK");
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: no new errors. (`tsx` is installed transitively via Next; if `pnpm tsx` fails to resolve, the next step adds it.)

- [ ] **Step 3: Install tsx if missing**

Run: `pnpm tsx --version 2>&1 || pnpm add -D tsx`
Expected: tsx version printed, or installed.

- [ ] **Step 4: Smoke-test the smoke script's startup error path** (no credentials)

Run: `PAGADITO_UID= PAGADITO_WSK= pnpm tsx scripts/pagadito-smoke.ts`
Expected: exits 1 with `[smoke] PAGADITO_UID / PAGADITO_WSK not set`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pagadito-smoke.ts package.json pnpm-lock.yaml
git commit -m "feat(pagadito): add manual smoke script

Runs exec-trans -> get-status against the configured Pagadito Connect
environment. Used to validate credentials, Basic Auth, and the
country/currency combination before integrating into the wizard."
```

---

## Phase C — Route Handlers (PR 2 part 2)

### Task 9: `POST /api/citas/[id]/pagadito/init`

**Files:**
- Create: `app/api/citas/[id]/pagadito/init/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { pagadito } from "@/lib/pagadito/client";
import { PAGADITO } from "@/lib/pagadito/config";
import { PagaditoError } from "@/lib/pagadito/errors";
import { logAction } from "@/utils/audit";

const REUSE_WINDOW_MS = 30 * 60 * 1000; // 30 min: reuse existing link if still fresh

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Feature flag: Pagadito not configured → 503 (wizard falls back / hides option).
  if (!PAGADITO.isConfigured) {
    return NextResponse.json(
      { error: "pagadito_not_configured", i18nKey: "pagadito_not_configured" },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: citaId } = await params;

  // 1. Load cita + pago + servicio (single round-trip).
  const { data: cita, error: citaErr } = await supabase
    .from("citas")
    .select(`
      id, paciente_id, estado_sync, servicio_asociado,
      servicio:servicios!citas_servicio_id_fkey(nombre, precio),
      pago:pagos(id, metodo, estado, monto, link_url, pagadito_token, iniciado_at)
    `)
    .eq("id", citaId)
    .single();

  if (citaErr || !cita) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (cita.paciente_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pago = Array.isArray(cita.pago) ? cita.pago[0] : cita.pago;
  const servicio = Array.isArray(cita.servicio) ? cita.servicio[0] : cita.servicio;

  if (!pago) return NextResponse.json({ error: "No payment record", i18nKey: "no_pago" }, { status: 400 });
  if (pago.metodo !== "link_pago")
    return NextResponse.json({ error: "Wrong method", i18nKey: "wrong_method" }, { status: 400 });
  if (pago.estado === "verificado")
    return NextResponse.json({ error: "Already paid", i18nKey: "already_paid" }, { status: 409 });

  // 2. Idempotency: reuse fresh link if still within the reuse window.
  if (
    pago.estado === "iniciado" &&
    pago.iniciado_at &&
    pago.link_url &&
    Date.now() - new Date(pago.iniciado_at).getTime() < REUSE_WINDOW_MS
  ) {
    return NextResponse.json({ redirect_url: pago.link_url });
  }

  // 3. Resolve amount.
  const amount = Number(pago.monto ?? servicio?.precio ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Invalid amount", i18nKey: "invalid_amount" },
      { status: 400 },
    );
  }

  // 4. Generate unique ERN (cita_id + epoch allows retries on same cita).
  const ern = `${citaId}:${Math.floor(Date.now() / 1000)}`;
  const description = servicio?.nombre ?? cita.servicio_asociado ?? "Consulta médica";

  // 5. Call Pagadito.
  // - countryCode "SV" + currency "NIO": SV is the default entorno; Pagadito converts to USD at checkout.
  // - No customParams in MVP: param1..param5 must be enabled in the merchant panel first.
  let result;
  try {
    result = await pagadito.execTrans({
      ern,
      amount,
      currency:    "NIO",
      countryCode: "SV",
      details:     [{ quantity: 1, description, price: amount }],
    });
  } catch (err) {
    if (err instanceof PagaditoError) {
      return NextResponse.json(
        { error: err.code, i18nKey: err.i18nKey },
        { status: err.httpStatus },
      );
    }
    console.error("[pagadito/init] unexpected error:", err);
    return NextResponse.json({ error: "generic", i18nKey: "generic" }, { status: 502 });
  }

  // 6. Persist.
  const { error: updateErr } = await supabase
    .from("pagos")
    .update({
      estado:         "iniciado",
      link_url:       result.url,
      pagadito_token: result.token,
      pagadito_ern:   ern,
      iniciado_at:    new Date().toISOString(),
    })
    .eq("id", pago.id);

  if (updateErr) {
    console.error("[pagadito/init] pagos update failed:", updateErr);
    // The transaction is already registered at Pagadito — return the URL anyway
    // so the member can pay; the cron will reconcile.
  }

  await logAction(supabase, {
    actorId:      user.id,
    actorRol:     "miembro",
    accion:       "pago.pagadito.init",
    entidad:      "pagos",
    entidadId:    pago.id,
    datosDespues: { ern, amount, currency: "NIO" },
  });

  return NextResponse.json({ redirect_url: result.url });
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: compiles.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/citas/[id]/pagadito/init/route.ts
git commit -m "feat(pagadito): add POST /api/citas/[id]/pagadito/init

Auth-guarded, idempotent within 30min window, validates ownership and
state, calls exec-trans, persists token + ERN, returns checkout URL."
```

---

### Task 10: `GET /api/pagadito/return`

**Files:**
- Create: `app/api/pagadito/return/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient as createBrowserSafeClient } from "@supabase/supabase-js";
import { pagadito } from "@/lib/pagadito/client";
import { PAGADITO } from "@/lib/pagadito/config";

/**
 * Return URL handler — Pagadito redirects the buyer's browser here with ?token=…
 * after the payment attempt completes. Validates the transaction via get-status
 * and redirects to the cita detail page with a status query param.
 *
 * No session is guaranteed (member may have used a different device). Uses the
 * service role key to read/update pagos. Token is opaque + non-enumerable.
 */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createBrowserSafeClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function redirectWithStatus(
  req: NextRequest,
  citaId: string | null,
  locale: string,
  status: "ok" | "rechazado" | "pendiente" | "desconocido" | "error",
) {
  const path = citaId
    ? `/${locale}/dashboard/citas/${citaId}?pago=${status}`
    : `/${locale}/dashboard/citas?pago=${status}`;
  return NextResponse.redirect(new URL(path, req.url));
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  // Pagadito injects ?token={value}&ern={ern_value} via the return URL template
  // configured in the merchant panel.
  const transactionToken = url.searchParams.get("token");
  const queryErn         = url.searchParams.get("ern");
  const locale           = url.searchParams.get("locale") ?? "es";

  if (!PAGADITO.isConfigured) {
    return redirectWithStatus(req, null, locale, "error");
  }
  if (!transactionToken) {
    return redirectWithStatus(req, null, locale, "error");
  }

  const supabase = serviceClient();

  // Primary lookup: opaque token.
  let { data: pago } = await supabase
    .from("pagos")
    .select("id, cita_id, estado, pagadito_ern")
    .eq("pagadito_token", transactionToken)
    .maybeSingle();

  // Fallback lookup by ERN: rescues the rare case where the post-execTrans
  // UPDATE on pagos failed and pagadito_token never got persisted.
  if (!pago && queryErn) {
    const { data: byErn } = await supabase
      .from("pagos")
      .select("id, cita_id, estado, pagadito_ern")
      .eq("pagadito_ern", queryErn)
      .maybeSingle();
    pago = byErn ?? null;
    if (pago) console.warn(`[pagadito/return] recovered pago ${pago.id} by ERN fallback`);
  }

  if (!pago) return redirectWithStatus(req, null, locale, "desconocido");

  // Cross-validation: log discrepancy but trust the token (it's the canonical key).
  if (queryErn && pago.pagadito_ern && pago.pagadito_ern !== queryErn) {
    console.warn(
      `[pagadito/return] ERN mismatch for pago=${pago.id} ` +
      `db='${pago.pagadito_ern}' query='${queryErn}'`,
    );
  }

  // Idempotent fast-path: already verified.
  if (pago.estado === "verificado") return redirectWithStatus(req, pago.cita_id, locale, "ok");

  let result;
  try {
    result = await pagadito.getStatus(transactionToken);
  } catch (err) {
    console.error("[pagadito/return] get-status failed:", err);
    // Don't mark anything — let the cron retry.
    return redirectWithStatus(req, pago.cita_id, locale, "pendiente");
  }

  if (result.status === "completed") {
    const { error } = await supabase.rpc("confirmar_cita_por_pago", {
      p_pago_id:          pago.id,
      p_pagadito_payload: result.raw as object,
      p_reference:        result.reference ?? null,
    });
    if (error) {
      console.error("[pagadito/return] RPC failed:", error);
      return redirectWithStatus(req, pago.cita_id, locale, "pendiente");
    }
    return redirectWithStatus(req, pago.cita_id, locale, "ok");
  }

  if (result.status === "failed" || result.status === "cancelled") {
    await supabase
      .from("pagos")
      .update({
        estado:          "rechazado",
        pagadito_estado: result.code,
        pagadito_payload: result.raw as object,
      })
      .eq("id", pago.id);
    return redirectWithStatus(req, pago.cita_id, locale, "rechazado");
  }

  // status === 'pending' — leave for the cron to reconcile.
  return redirectWithStatus(req, pago.cita_id, locale, "pendiente");
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: compiles.

- [ ] **Step 3: Manual smoke** (only if local dev server is running)

```bash
# Hit the route with a fake token; expect a redirect to ?pago=desconocido
curl -i "http://localhost:3000/api/pagadito/return?token=FAKE_DOES_NOT_EXIST" 2>&1 | head -20
```
Expected: `HTTP/1.1 307 Temporary Redirect` with `location:` containing `?pago=desconocido`.

- [ ] **Step 4: Commit**

```bash
git add app/api/pagadito/return/route.ts
git commit -m "feat(pagadito): add GET /api/pagadito/return handler

Service-role client looks up pago by opaque token, calls get-status, and
either invokes confirmar_cita_por_pago RPC, marks rechazado, or defers
to the cron. Idempotent."
```

---

### Task 11: `POST /api/internal/pagadito/reconcile`

**Files:**
- Create: `app/api/internal/pagadito/reconcile/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient as createBrowserSafeClient } from "@supabase/supabase-js";
import { pagadito } from "@/lib/pagadito/client";
import { PAGADITO } from "@/lib/pagadito/config";

const BATCH_LIMIT = 100;
// Don't reconcile transactions younger than 1 min — let the return URL handler win.
// Pagadito itself marks transactions EXPIRED at 10 min by default, so we don't need
// our own hard expiry; the next cron cycle will see EXPIRED and mark rechazado.
const MIN_AGE_MS  = 1 * 60 * 1000;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createBrowserSafeClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: NextRequest) {
  // Auth: shared secret with pg_cron.
  const headerSecret = req.headers.get("x-cron-secret");
  if (!PAGADITO.isConfigured || headerSecret !== PAGADITO.reconcileSecret) {
    return new NextResponse(null, { status: 401 });
  }

  const supabase = serviceClient();
  const cutoff = new Date(Date.now() - MIN_AGE_MS).toISOString();

  const { data: pendientes, error } = await supabase
    .from("pagos")
    .select("id, cita_id, pagadito_token, iniciado_at")
    .eq("estado", "iniciado")
    .lt("iniciado_at", cutoff)
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[pagadito/reconcile] query failed:", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const results = { scanned: pendientes?.length ?? 0, confirmados: 0, rechazados: 0, errores: 0 };

  for (const pago of pendientes ?? []) {
    if (!pago.pagadito_token) {
      results.errores++;
      continue;
    }

    try {
      const r = await pagadito.getStatus(pago.pagadito_token);
      if (r.status === "completed") {
        const { error: rpcErr } = await supabase.rpc("confirmar_cita_por_pago", {
          p_pago_id:          pago.id,
          p_pagadito_payload: r.raw as object,
          p_reference:        r.reference ?? null,
        });
        if (rpcErr) {
          console.error(`[pagadito/reconcile] RPC failed for ${pago.id}:`, rpcErr);
          results.errores++;
        } else {
          results.confirmados++;
        }
      } else if (r.status === "failed" || r.status === "cancelled") {
        // Includes EXPIRED (Pagadito's 10-min auto-expiry), CANCELED, FAILED, REVOKED, UNCOLLECTABLE.
        await supabase
          .from("pagos")
          .update({
            estado:           "rechazado",
            pagadito_estado:  r.rawStatus,
            pagadito_payload: r.raw as object,
          })
          .eq("id", pago.id);
        results.rechazados++;
      }
      // status === 'pending' (REGISTERED / VERIFYING / PENDING) → no-op, next cycle.
    } catch (err) {
      results.errores++;
      console.error(`[pagadito/reconcile] ${pago.id}:`, err);
    }
  }

  console.info(`[pagadito/reconcile] done:`, results);
  return NextResponse.json(results);
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: compiles.

- [ ] **Step 3: Manual auth-check smoke** (dev server)

```bash
# Without header → 401
curl -i -X POST "http://localhost:3000/api/internal/pagadito/reconcile" | head -5
# With wrong header → 401
curl -i -X POST -H "x-cron-secret: wrong" "http://localhost:3000/api/internal/pagadito/reconcile" | head -5
```
Expected: both return `HTTP/1.1 401`.

- [ ] **Step 4: Commit**

```bash
git add app/api/internal/pagadito/reconcile/route.ts
git commit -m "feat(pagadito): add reconcile endpoint for pg_cron

Batch-reconciles pagos in 'iniciado' older than 1min via get-status.
Pagadito's EXPIRED state (auto at 10min) flows through the
failed/cancelled branch — no separate hard expiry. Guarded by
x-cron-secret header shared with pg_cron."
```

---

## Phase D — Wizard UX + i18n (PR 2 part 3)

### Task 12: i18n keys

**Files:**
- Modify: `messages/es.json`
- Modify: `messages/en.json`

- [ ] **Step 1: Locate the existing `Dashboard.miembro.citas.wizard` block in both files**

Run: `grep -n "wizard" messages/es.json | head -5`
Note the line numbers — you'll insert a new `pagadito` child object alongside `pago`, `transferencia`, etc.

- [ ] **Step 2: Add Spanish keys** to `messages/es.json` under `Dashboard.miembro.citas.wizard`

```json
"pagadito": {
  "creando_cita":   "Reservando tu cita...",
  "generando_link": "Generando enlace de pago seguro...",
  "redirigiendo":   "Te llevamos a Pagadito...",
  "errors": {
    "pagadito_not_configured": "Pagos en línea no disponibles. Contacta a soporte.",
    "invalid_credentials":  "Servicio de pagos no disponible. Intenta más tarde.",
    "invalid_amount":       "Monto inválido. Contacta a soporte.",
    "currency_not_enabled": "Moneda no habilitada. Contacta a soporte.",
    "wrong_method":         "Método de pago incorrecto para Pagadito.",
    "already_paid":         "Este pago ya fue verificado.",
    "no_pago":              "No encontramos el registro de pago.",
    "generic":              "No pudimos generar el enlace. Reintenta."
  },
  "retorno": {
    "ok":          "¡Pago confirmado! Tu cita está agendada.",
    "pendiente":   "Estamos verificando tu pago. Te avisaremos por WhatsApp.",
    "rechazado":   "El pago no se completó. Puedes reintentar.",
    "desconocido": "No encontramos esta transacción. Contacta a soporte.",
    "error":       "Hubo un problema procesando tu pago."
  },
  "reintentar":     "Reintentar pago",
  "cambiar_metodo": "Cambiar método de pago"
}
```

- [ ] **Step 3: Add English keys** to `messages/en.json` under the same path

```json
"pagadito": {
  "creando_cita":   "Reserving your appointment...",
  "generando_link": "Generating secure payment link...",
  "redirigiendo":   "Taking you to Pagadito...",
  "errors": {
    "pagadito_not_configured": "Online payments unavailable. Contact support.",
    "invalid_credentials":  "Payment service unavailable. Try again later.",
    "invalid_amount":       "Invalid amount. Contact support.",
    "currency_not_enabled": "Currency not enabled. Contact support.",
    "wrong_method":         "Wrong payment method for Pagadito.",
    "already_paid":         "This payment has already been verified.",
    "no_pago":              "Payment record not found.",
    "generic":              "Could not generate the link. Please retry."
  },
  "retorno": {
    "ok":          "Payment confirmed! Your appointment is scheduled.",
    "pendiente":   "We're verifying your payment. We'll notify you via WhatsApp.",
    "rechazado":   "Payment was not completed. You can retry.",
    "desconocido": "Transaction not found. Contact support.",
    "error":       "There was a problem processing your payment."
  },
  "reintentar":     "Retry payment",
  "cambiar_metodo": "Change payment method"
}
```

- [ ] **Step 4: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 5: Type-check** (next-intl validates keys at build)

Run: `pnpm build`
Expected: compiles.

- [ ] **Step 6: Commit**

```bash
git add messages/es.json messages/en.json
git commit -m "feat(pagadito): add wizard i18n keys (es + en)"
```

---

### Task 13: Add `pagadito_redirect` step to WizardState

**Files:**
- Modify: `components/dashboard/miembro/citas/types.ts`

- [ ] **Step 1: Add the new step to `WizardStep` union**

Edit `components/dashboard/miembro/citas/types.ts` lines 3-12:

```ts
export type WizardStep =
  | "ubicacion"
  | "servicio"
  | "doctor"
  | "fecha"
  | "horario"
  | "paciente"
  | "pago"
  | "transferencia"
  | "pagadito_redirect"
  | "confirmar";
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: compiles. (`pagadito_redirect` isn't used yet, but the union is now wider.)

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/miembro/citas/types.ts
git commit -m "feat(pagadito): add pagadito_redirect to WizardStep union"
```

---

### Task 14: `PasoPagaditoRedirect` component

**Files:**
- Create: `components/dashboard/miembro/citas/steps/PasoPagaditoRedirect.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, AlertCircle } from "lucide-react";

interface PasoPagaditoRedirectProps {
  citaId:           string;
  onChangeMetodo:   () => void;  // back to PasoPago
}

type Status = "generando_link" | "redirigiendo" | "error";

export default function PasoPagaditoRedirect({ citaId, onChangeMetodo }: PasoPagaditoRedirectProps) {
  const t = useTranslations("Dashboard.miembro.citas.wizard.pagadito");
  const [status, setStatus]     = useState<Status>("generando_link");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function generate(): Promise<void> {
    setStatus("generando_link");
    setErrorMsg("");

    const res = await fetch(`/api/citas/${citaId}/pagadito/init`, { method: "POST" });
    const body = await res.json().catch(() => ({}));

    if (!res.ok || !body.redirect_url) {
      const key = (body.i18nKey as string | undefined) ?? "generic";
      let msg: string;
      try { msg = t(`errors.${key}`); } catch { msg = t("errors.generic"); }
      setErrorMsg(msg);
      setStatus("error");
      return;
    }

    setStatus("redirigiendo");
    // Brief delay so the user sees the redirect state before navigating away.
    setTimeout(() => {
      window.location.href = body.redirect_url as string;
    }, 800);
  }

  useEffect(() => {
    void generate();
    // citaId is set once when this step mounts; no need to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "error") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
          <p className="text-sm font-roboto text-red-900">{errorMsg}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onChangeMetodo}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("cambiar_metodo")}
          </button>
          <button
            type="button"
            onClick={() => void generate()}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90"
          >
            {t("reintentar")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-base font-poppins font-semibold text-gray-900">
        {status === "generando_link" ? t("generando_link") : t("redirigiendo")}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `pnpm build && pnpm lint`
Expected: compiles, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/miembro/citas/steps/PasoPagaditoRedirect.tsx
git commit -m "feat(pagadito): add PasoPagaditoRedirect wizard step

Mount-time effect calls /api/citas/[id]/pagadito/init and redirects to
the checkout URL. Renders error state with retry/change-method options."
```

---

### Task 15: Modify `PasoConfirmar` to branch to Pagadito

**Files:**
- Modify: `components/dashboard/miembro/citas/steps/PasoConfirmar.tsx`

- [ ] **Step 1: Add the new prop to the interface**

Edit lines 13-20:

```tsx
interface PasoConfirmarProps {
  wizard:      WizardState;
  userProfile: WizardUserProfile;
  onBack: () => void;
  onSuccess: () => void;
  onTransferenciaRequired: (citaId: string) => void;
  onPagaditoRequired:      (citaId: string) => void;
  onSlotTaken: () => void;
}
```

- [ ] **Step 2: Destructure the new prop in the function signature**

Edit lines 34-36:

```tsx
export default function PasoConfirmar({
  wizard, userProfile, onBack, onSuccess,
  onTransferenciaRequired, onPagaditoRequired, onSlotTaken,
}: PasoConfirmarProps) {
```

- [ ] **Step 3: Add the Pagadito branch alongside the transferencia branch**

Edit the success block at lines 128-133:

```tsx
toast.success(tc("success"));
if (wizard.metodo_pago === "transferencia" && j.cita) {
  onTransferenciaRequired(j.cita.id);
} else if (wizard.metodo_pago === "link_pago" && j.cita) {
  onPagaditoRequired(j.cita.id);
} else {
  onSuccess();
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm build`
Expected: fails — `MisCitas.tsx` doesn't pass `onPagaditoRequired`. That's expected; next task fixes it.

- [ ] **Step 5: No commit yet** — wait for Task 16.

---

### Task 16: Wire `pagadito_redirect` step in `MisCitas.tsx`

**Files:**
- Modify: `components/dashboard/miembro/citas/MisCitas.tsx`

- [ ] **Step 1: Add the import for the new step**

Near the other step imports (around line 24-25):

```tsx
import PasoTransferencia    from "./steps/PasoTransferencia";
import PasoConfirmar        from "./steps/PasoConfirmar";
import PasoPagaditoRedirect from "./steps/PasoPagaditoRedirect";
```

- [ ] **Step 2: Pass `onPagaditoRequired` to `PasoConfirmar`**

Edit the `<PasoConfirmar ... />` JSX block (around lines 164-176): add the prop alongside `onTransferenciaRequired`:

```tsx
<PasoConfirmar
  /* …existing props… */
  onTransferenciaRequired={(citaId) =>
    setWizard((w) => ({ ...w, cita_id: citaId, step: "transferencia" }))
  }
  onPagaditoRequired={(citaId) =>
    setWizard((w) => ({ ...w, cita_id: citaId, step: "pagadito_redirect" }))
  }
  /* …existing props… */
/>
```

- [ ] **Step 3: Render `PasoPagaditoRedirect` when on that step**

Below the existing `wizard.step === "transferencia"` block (around lines 177-…), add:

```tsx
{wizard.step === "pagadito_redirect" && wizard.cita_id && (
  <PasoPagaditoRedirect
    citaId={wizard.cita_id}
    onChangeMetodo={() => setWizard((w) => ({ ...w, step: "pago" }))}
  />
)}
```

- [ ] **Step 4: Type-check + lint**

Run: `pnpm build && pnpm lint`
Expected: compiles, no lint errors.

- [ ] **Step 5: Manual smoke** (dev server, no Pagadito credentials yet)

```bash
pnpm dev
```
Open the new-cita wizard, pick `link_pago`, complete confirmation. Expect the wizard to land on `PasoPagaditoRedirect` and show the error state ("Pagos en línea no disponibles") because `PAGADITO_UID` is unset.

- [ ] **Step 6: Commit both Task 15 + Task 16 changes**

```bash
git add components/dashboard/miembro/citas/steps/PasoConfirmar.tsx \
        components/dashboard/miembro/citas/MisCitas.tsx
git commit -m "feat(pagadito): wire PasoPagaditoRedirect into wizard

PasoConfirmar branches to PasoPagaditoRedirect when metodo_pago is
link_pago (mirrors the existing transferencia branch). MisCitas hosts
the new step. Without credentials, the error state with 'cambiar
método' is shown."
```

---

### Task 17: Cita detail banner for `?pago=…`

**Files:**
- Modify: `app/[locale]/(dashboard)/dashboard/citas/[id]/page.tsx`

If this page doesn't exist yet, create it; otherwise add the banner logic to the existing client component (or a new client wrapper inside it).

- [ ] **Step 1: Find or create the detail page**

Run: `ls app/\[locale\]/\(dashboard\)/dashboard/citas/`
If `[id]/page.tsx` exists, read it to understand structure. If not, the simplest is to add a client component `PagoBanner` that renders into the existing list page; this task assumes the detail page exists. If it does NOT exist, defer this task and instead add the banner to `MisCitas.tsx` reading `useSearchParams()`.

- [ ] **Step 2: Add a client-side banner component**

Create `components/dashboard/miembro/citas/PagoBanner.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

type PagoStatus = "ok" | "rechazado" | "pendiente" | "desconocido" | "error";

const STATUSES: PagoStatus[] = ["ok", "rechazado", "pendiente", "desconocido", "error"];

export default function PagoBanner() {
  const t          = useTranslations("Dashboard.miembro.citas.wizard.pagadito.retorno");
  const router     = useRouter();
  const pathname   = usePathname();
  const params     = useSearchParams();

  useEffect(() => {
    const raw = params.get("pago");
    if (!raw) return;
    const status = STATUSES.includes(raw as PagoStatus) ? (raw as PagoStatus) : "error";

    switch (status) {
      case "ok":          toast.success(t("ok")); break;
      case "rechazado":   toast.error(t("rechazado")); break;
      case "pendiente":   toast.info(t("pendiente")); break;
      case "desconocido": toast.error(t("desconocido")); break;
      case "error":       toast.error(t("error")); break;
    }

    // Strip the query param so a refresh doesn't re-fire.
    router.replace(pathname, { scroll: false });
  }, [params, router, pathname, t]);

  return null;
}
```

- [ ] **Step 3: Mount it on the cita detail page (or list page if detail doesn't exist)**

If `app/[locale]/(dashboard)/dashboard/citas/[id]/page.tsx` exists, add `<PagoBanner />` near the top of its render tree.

If it does NOT exist, add it to `components/dashboard/miembro/citas/MisCitas.tsx` near the top of the returned JSX:

```tsx
import PagoBanner from "./PagoBanner";

// inside the component's return:
<PagoBanner />
```

- [ ] **Step 4: Type-check + lint**

Run: `pnpm build && pnpm lint`
Expected: clean.

- [ ] **Step 5: Manual smoke**

```bash
pnpm dev
```
Visit `http://localhost:3000/es/dashboard/citas?pago=ok` — expect green toast.
Visit `…?pago=rechazado` — expect red toast.
Verify the URL is rewritten without the query param after the toast.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/miembro/citas/PagoBanner.tsx \
        app/\[locale\]/\(dashboard\)/dashboard/citas \
        components/dashboard/miembro/citas/MisCitas.tsx
git commit -m "feat(pagadito): show toast banner from ?pago= return param

Mounted on the cita list/detail page. Strips the query param after
firing so a refresh doesn't re-fire the toast."
```

---

## Phase E — Cron Migration + Docs (PR 4)

> Apply this phase AFTER credentials exist in production and you've validated the manual flow end-to-end via the wizard.

### Task 18: Migration — `pg_cron` reconcile schedule

**Files:**
- Create: `supabase/migrations/20260601130200_pagadito_pg_cron.sql`

- [ ] **Step 1: Verify pg_cron and pg_net are installed**

Run via Supabase SQL editor:
```sql
SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net');
```
Expected: both present. If `pg_net` is missing, install via the Supabase Dashboard > Database > Extensions.

- [ ] **Step 2: Set the GUC settings via Dashboard or SQL**

```sql
ALTER DATABASE postgres SET app.settings.next_base_url             = 'https://clubsos.sosmedical.com.ni';
ALTER DATABASE postgres SET app.settings.pagadito_reconcile_secret = 'SAME_VALUE_AS_PAGADITO_RECONCILE_SECRET_ENV';
```
Re-connect to pick up the new settings.

- [ ] **Step 3: Write the migration**

```sql
-- Schedule the Pagadito reconcile endpoint every 2 minutes.
-- The aggressive cadence pairs with Pagadito's 10-minute default expiry so the
-- member sees status updates within minutes of paying/abandoning.
-- Requires:
--   * pg_cron extension
--   * pg_net extension
--   * app.settings.next_base_url and app.settings.pagadito_reconcile_secret set

BEGIN;

SELECT cron.unschedule('pagadito_reconcile')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pagadito_reconcile');

SELECT cron.schedule(
  'pagadito_reconcile',
  '*/2 * * * *',
  $job$
    SELECT net.http_post(
      url     := current_setting('app.settings.next_base_url') || '/api/internal/pagadito/reconcile',
      headers := jsonb_build_object(
        'x-cron-secret', current_setting('app.settings.pagadito_reconcile_secret'),
        'content-type',  'application/json'
      ),
      body    := '{}'::jsonb
    );
  $job$
);

COMMIT;
```

- [ ] **Step 4: Apply**

Run: `supabase db push`
Expected: migration applied.

- [ ] **Step 5: Verify the job is scheduled**

```sql
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'pagadito_reconcile';
```
Expected: 1 row, `schedule='*/2 * * * *'`, `active=true`.

- [ ] **Step 6: Inspect first run after 2 min**

```sql
SELECT runid, job_pid, status, return_message, start_time, end_time
  FROM cron.job_run_details
 WHERE jobname = 'pagadito_reconcile'
 ORDER BY start_time DESC LIMIT 5;
```
Expected: `status='succeeded'`. If `failed`, check `return_message` for hints (most common: GUC unset, base URL wrong, secret mismatch, pg_net not installed).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260601130200_pagadito_pg_cron.sql
git commit -m "feat(pagadito): schedule reconcile endpoint via pg_cron every 2min"
```

---

### Task 19: Update `CLAUDE.md` documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Pagadito env vars to the "Environment Variables" section**

In the `## Environment Variables` block, append after the existing entries:

```
PAGADITO_ENV               # 'sandbox' | 'production' (default sandbox)
PAGADITO_UID               # Pagadito merchant UID (feature flag: empty disables)
PAGADITO_WSK               # Pagadito merchant WSK (secret)
PAGADITO_RETURN_URL        # https://clubsos.sosmedical.com.ni/api/pagadito/return?token={value}&ern={ern_value}
                           # Configured in the merchant panel, not sent per request.
                           # {value} → transaction token, {ern_value} → ERN we sent in exec-trans.
PAGADITO_RECONCILE_SECRET  # shared with pg_cron GUC app.settings.pagadito_reconcile_secret
```

- [ ] **Step 2: Add a new subsection under "External Integrations"**

Insert before the closing of `### External Integrations`:

```markdown
**Pagadito**: Payment gateway used by `link_pago` method. Pagadito Connect
(REST v2, JSON, HTTP Basic Auth) client lives in `lib/pagadito/`. Member flow:
wizard creates cita → calls `POST /api/citas/[id]/pagadito/init` → redirected
to Pagadito checkout → returns via `GET /api/pagadito/return` → RPC
`confirmar_cita_por_pago` advances cita to `confirmado`. A `pg_cron` job calls
`POST /api/internal/pagadito/reconcile` every 2 min as fallback for abandoned
returns; Pagadito itself auto-EXPIREs transactions at 10 min, which the cron
reflects as `rechazado` on the next cycle. Feature flag: when `PAGADITO_UID`
is empty, the init route returns 503 and `PasoPagaditoRedirect` shows the
"unavailable" error state.
```

- [ ] **Step 3: Add the new estado_pago value to the Citas state machine docs**

In the `### Citas (Appointments) State Machine` section, add a note after the existing flow diagram:

```markdown
`pagos.estado` follows: `pendiente → iniciado → verificado | rechazado`.
- `iniciado` = Pagadito link emitted, awaiting completion.
- `verificado` = payment confirmed (via return URL or reconcile cron) when Pagadito reports `COMPLETED`.
- `rechazado` = Pagadito reported `FAILED`, `CANCELED`, `EXPIRED`, `REVOKED`, or `UNCOLLECTABLE`.
```

- [ ] **Step 4: Verify the file still parses**

Run: `wc -l CLAUDE.md`
Expected: line count increased; spot-check the file renders correctly.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(pagadito): document env vars, flow, and estado_pago states"
```

---

## Self-Review (already performed by plan author)

**Spec coverage:**
- Pagadito Connect (REST v2, Basic Auth) → Task 7 (client)
- `link_pago` repurposed → Task 15 (PasoConfirmar branch)
- Multi-currency at client level → Task 4 (types)
- Return URL + cron reconciliation (every 2 min, no own hard expiry) → Tasks 10, 11, 18
- Pagadito 10-min auto-expiry surfaces as `rechazado` via cron → Task 11
- No WhatsApp on this flow → not added anywhere ✓
- Feature flag → Tasks 5, 9
- RPC `confirmar_cita_por_pago` → Task 2
- Idempotency (30 min reuse) → Task 9
- Banner `?pago=…` → Task 17
- i18n keys (es + en) → Task 12
- CLAUDE.md docs → Task 19

**Placeholder scan:** none — all code shown, all paths exact.

**Type consistency:** `PagaditoClient.execTrans` returns `ExecTransResult` (from `types.ts`) which has `{ url, token }`. The route handler reads `result.url` and `result.token` → consistent. `GetStatusResult.rawStatus` flows from client → reconcile route → `pagos.pagadito_estado`. RPC params `p_pago_id, p_pagadito_payload, p_reference` match between SQL definition (Task 2) and TS callers (Tasks 10, 11). ✓

---

## Open verifications (engineer must confirm during implementation)

1. **country_code='SV' + currency='NIO' combination.** The Connect docs only list `SV` and `GT` as supported country codes, but `NIO` is a supported currency. The smoke script in Task 8 validates this against sandbox. If Pagadito returns `PG3008` (currency not supported) or similar on a known-good request, contact developers@pagadito.com to confirm the correct entorno for Nicaraguan merchants.

2. **Custom params habilitation in merchant panel.** MVP does NOT send custom params, so this is informational. If a future iteration wants to echo `cita_id` back via `get-status`, the merchant must first activate `param1..param5` from *Configuración Técnica → Parámetros de Integración → Parámetros Personalizados* in the Pagadito panel.

3. **Return URL configured in merchant panel.** The `PAGADITO_RETURN_URL` env var is documentation only — Pagadito reads the return URL from *Configuración Técnica → Parámetros de Integración → URL de retorno*. Before the first sandbox smoke, set this in the panel to `${app_url}/api/pagadito/return`.

4. **`cita_eventos` event names.** Task 2's RPC inserts events with `evento='confirmada'` and `evento='pago_sin_cita_activa'`. If the column is an enum, both values must already exist or be added in Task 2 (a sub-step is included to check).
