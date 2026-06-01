# Pagadito Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Pagadito as the primary payment gateway for appointments excluded from contract coverage, replacing the current manual link-paste flow.

**Architecture:** 100% Next.js. TypeScript client over WSPG (Pagadito's raw web service). Return URL as primary reconciliation path + `pg_cron` every 10 min as fallback. Feature flag (`PAGADITO_UID` empty → init returns 503, wizard hides `link_pago`).

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
| `supabase/migrations/20260601120000_pagadito_integration.sql` | enum `estado_pago += 'iniciado'`, columns + indexes on `pagos` |
| `supabase/migrations/20260601120100_confirmar_cita_por_pago_rpc.sql` | atomic RPC: pago → verificado + cita → confirmado + cita_eventos |
| `supabase/migrations/20260601120200_pagadito_pg_cron.sql` | scheduled reconcile (separate PR) |
| `lib/pagadito/types.ts` | `PagaditoCurrency`, `PagaditoDetail`, `ExecTransInput`, `GetStatusResult` |
| `lib/pagadito/config.ts` | reads env, exposes endpoints sandbox/prod, feature-flag check |
| `lib/pagadito/errors.ts` | `PagaditoError` class + code-to-i18n mapping |
| `lib/pagadito/client.ts` | `PagaditoClient` with `connect/execTrans/getStatus` + cached token |
| `scripts/pagadito-smoke.ts` | manual end-to-end smoke: connect → execTrans → getStatus |
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
- Create: `supabase/migrations/20260601120000_pagadito_integration.sql`

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

COMMENT ON COLUMN public.pagos.pagadito_token   IS 'Token returned by Pagadito exec_trans (opaque, used by return URL).';
COMMENT ON COLUMN public.pagos.pagadito_ern     IS 'External Reference Number we send to Pagadito. Unique per transaction.';
COMMENT ON COLUMN public.pagos.pagadito_estado  IS 'Raw last-known Pagadito status code (e.g. PG3002, PG3003).';
COMMENT ON COLUMN public.pagos.pagadito_payload IS 'Snapshot of the last get_status response for audit.';
COMMENT ON COLUMN public.pagos.iniciado_at      IS 'When exec_trans was called. Used by the reconcile cron.';

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

Run: `psql --no-psqlrc -f supabase/migrations/20260601120000_pagadito_integration.sql --set ON_ERROR_STOP=on -d postgres -h localhost -p 54322 -U postgres` (against local supabase if available)
OR just inspect visually. Skip if local supabase isn't running — the next task applies it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260601120000_pagadito_integration.sql
git commit -m "feat(pagadito): add schema migration for tracking columns

Extends estado_pago enum with 'iniciado' and adds pagadito_token,
pagadito_ern, pagadito_estado, pagadito_payload, iniciado_at to pagos
with supporting indexes."
```

---

### Task 2: Migration — `confirmar_cita_por_pago` RPC

**Files:**
- Create: `supabase/migrations/20260601120100_confirmar_cita_por_pago_rpc.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Atomic RPC: mark pago verificado, advance cita to confirmado, enqueue cita_eventos.
-- Called by:
--   * GET /api/pagadito/return  (when get_status reports completed)
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
git add supabase/migrations/20260601120100_confirmar_cita_por_pago_rpc.sql
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
 * Pagadito client public types.
 *
 * Supported by Pagadito per region. Add to the union as Pagadito enables more.
 * The merchant account decides which currencies are actually accepted — runtime
 * errors map to `currency_not_enabled`.
 */
export type PagaditoCurrency =
  | "NIO" // Nicaragua
  | "USD" // Dólar
  | "HNL" // Honduras
  | "GTQ" // Guatemala
  | "CRC" // Costa Rica
  | "DOP" // República Dominicana
  | "PAB"; // Panamá

export interface PagaditoDetail {
  quantity:    number;
  description: string;
  amount:      number;
}

export interface ExecTransInput {
  /** External Reference Number — unique per transaction. */
  ern:          string;
  amount:       number;
  currency:     PagaditoCurrency;
  details:      PagaditoDetail[];
  /** Optional KV that Pagadito echoes back via get_status custom params. */
  customParams?: Record<string, string>;
}

export interface ExecTransResult {
  /** Checkout URL the merchant must redirect the buyer to. */
  url:   string;
  /** Opaque transaction token; persist as pagos.pagadito_token. */
  token: string;
}

export type PagaditoStatus = "completed" | "pending" | "failed" | "cancelled";

export interface GetStatusResult {
  /** Raw Pagadito code (e.g. PG3001, PG3002, PG3003). */
  code:        string;
  status:      PagaditoStatus;
  /** Bank authorization reference, present on success. */
  reference?:  string;
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

// Endpoints. Verify these against the official Pagadito PHP SDK before going live.
// Production endpoint is documented at https://comercios.pagadito.com/wspg/charges.php
// Sandbox is documented at https://sandbox.pagadito.com/comercios/wspg/charges.php
const ENDPOINTS: Record<PagaditoEnv, string> = {
  sandbox:    "https://sandbox.pagadito.com/comercios/wspg/charges.php",
  production: "https://comercios.pagadito.com/wspg/charges.php",
};

export const PAGADITO = {
  env:             PAGADITO_ENV,
  endpoint:        ENDPOINTS[PAGADITO_ENV],
  /** True when minimum env is set; routes/wizard should gate on this. */
  isConfigured:    Boolean(env("PAGADITO_UID") && env("PAGADITO_WSK")),
  /** Lazy accessors — throw at call-time, not at module load. */
  get uid()             { return required("PAGADITO_UID"); },
  get wsk()             { return required("PAGADITO_WSK"); },
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
 * Pagadito error codes (subset documented at dev.pagadito.com).
 * Extend as new codes are encountered in sandbox/production.
 */
export class PagaditoError extends Error {
  constructor(
    public code:       string,   // "PG2003", "PG2004", "PG2005", …
    public i18nKey:    string,   // "invalid_credentials", "invalid_amount", …
    public httpStatus: number,   // 400, 502, …
    message:           string,
  ) {
    super(message);
    this.name = "PagaditoError";
  }
}

type Mapping = { i18nKey: string; status: number };

const CODE_MAP: Record<string, Mapping> = {
  // Success / intermediate
  PG1001: { i18nKey: "transaction_registered", status: 200 },
  PG3001: { i18nKey: "transaction_pending",    status: 200 },
  PG3002: { i18nKey: "transaction_completed",  status: 200 },
  PG3003: { i18nKey: "transaction_failed",     status: 200 },

  // Auth / config errors (502: our side, retry later)
  PG2003: { i18nKey: "invalid_credentials",    status: 502 },
  PG2004: { i18nKey: "session_expired",        status: 502 },
  PG2006: { i18nKey: "currency_not_enabled",   status: 502 },

  // Bad request from us (400: caller error)
  PG2005: { i18nKey: "invalid_amount",         status: 400 },
  PG2007: { i18nKey: "invalid_ern",            status: 400 },
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

**IMPORTANT — Wire format:** Pagadito's WSPG accepts POST requests with form-encoded or XML bodies and returns JSON when `format=json` is passed. The exact field names below are derived from the public Pagadito PHP SDK at github.com/pagadito and the implementation manual PDF (`Manual_Integracion_API_Pagadito_v1.1.pdf`). **Before testing against sandbox, verify the field names match the current official SDK.** If they differ, only this file needs updating — types/errors/config stay the same.

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
} from "./types";

const TOKEN_TTL_MS = 25 * 60 * 1000; // 25 min; real TTL ≈ 30 min, refresh early.

interface RawResponse {
  code:    string;
  message: string;
  value?:  unknown;
  timestamp?: string;
}

export class PagaditoClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  /**
   * connect — authenticate and cache session token.
   * Returns the token; safe to call without awaiting if you only need the
   * side effect of populating the cache.
   */
  async connect(): Promise<string> {
    const res = await this.callRaw({
      operation: "connect",
      uid:       PAGADITO.uid,
      wsk:       PAGADITO.wsk,
    });
    if (res.code !== "PG1002" /* connect success per docs */) {
      throw pagaditoErrorFromCode(res.code, res.message);
    }
    const token = (res.value as { token?: string } | undefined)?.token;
    if (!token) {
      throw pagaditoErrorFromCode(res.code, "connect: missing token in response");
    }
    this.token = token;
    this.tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    return token;
  }

  /** Returns a valid token, calling connect() if cache is empty/expired. */
  private async ensureToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    return this.connect();
  }

  /**
   * exec_trans — register a transaction. Returns the checkout URL + token.
   * On PG2004 (session expired) automatically reconnects and retries once.
   */
  async execTrans(input: ExecTransInput): Promise<ExecTransResult> {
    this.validateExecTrans(input);

    const call = async (sessionToken: string) => this.callRaw({
      operation:     "exec_trans",
      token:         sessionToken,
      ern:           input.ern,
      amount:        input.amount.toFixed(2),
      currency:      input.currency,
      details:       JSON.stringify(input.details),
      return_url:    PAGADITO.returnUrl,
      ...(input.customParams ?? {}),
    });

    let token = await this.ensureToken();
    let res   = await call(token);

    if (res.code === "PG2004") {
      // Session expired mid-call — invalidate and retry exactly once.
      this.token = null;
      token = await this.connect();
      res   = await call(token);
    }

    if (res.code !== "PG1003" /* exec_trans success per docs */) {
      throw pagaditoErrorFromCode(res.code, res.message);
    }

    const v = res.value as { url?: string; token?: string } | undefined;
    if (!v?.url || !v?.token) {
      throw pagaditoErrorFromCode(res.code, "exec_trans: missing url/token");
    }
    return { url: v.url, token: v.token };
  }

  /**
   * get_status — query a transaction by its token.
   * Idempotent. Safe to call multiple times.
   */
  async getStatus(transactionToken: string): Promise<GetStatusResult> {
    const sessionToken = await this.ensureToken();
    const res = await this.callRaw({
      operation:        "get_status",
      token:            sessionToken,
      transaction_token: transactionToken,
    });

    // get_status returns a code that DESCRIBES the transaction state, not whether
    // the call succeeded. Map both axes here.
    const status = this.codeToStatus(res.code);
    const reference = (res.value as { reference?: string } | undefined)?.reference;

    return {
      code:      res.code,
      status,
      reference: reference ?? undefined,
      raw:       res,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────────────

  private codeToStatus(code: string): PagaditoStatus {
    switch (code) {
      case "PG3002": return "completed";   // payment confirmed
      case "PG3001": return "pending";     // initialized / in progress
      case "PG3003": return "failed";      // declined / failed
      case "PG3004": return "cancelled";   // explicitly cancelled by buyer
      default:       return "pending";     // unknown → conservative
    }
  }

  private validateExecTrans(input: ExecTransInput): void {
    if (!input.ern || input.ern.length === 0)
      throw new PagaditoError("LOCAL_VALIDATION", "invalid_ern", 400, "ern required");
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      throw new PagaditoError("LOCAL_VALIDATION", "invalid_amount", 400, "amount must be > 0");
    if (input.details.length === 0)
      throw new PagaditoError("LOCAL_VALIDATION", "invalid_amount", 400, "details required");
    const sum = input.details.reduce((a, d) => a + d.amount * d.quantity, 0);
    // Allow 1¢ rounding tolerance.
    if (Math.abs(sum - input.amount) > 0.01)
      throw new PagaditoError("LOCAL_VALIDATION", "invalid_amount", 400,
        `details sum (${sum}) does not match amount (${input.amount})`);
  }

  private async callRaw(params: Record<string, string>): Promise<RawResponse> {
    const body = new URLSearchParams({ ...params, format: "json" });
    const startedAt = Date.now();

    console.info(`[pagadito] ${params.operation} starting`);

    const res = await fetch(PAGADITO.endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
    });

    if (!res.ok) {
      throw new PagaditoError("HTTP_ERROR", "generic", 502,
        `Pagadito HTTP ${res.status}: ${await res.text().catch(() => "(no body)")}`);
    }

    const json = (await res.json()) as RawResponse;
    const elapsed = Date.now() - startedAt;
    console.info(`[pagadito] ${params.operation} ok code=${json.code} elapsed=${elapsed}ms`);
    return json;
  }
}

// Singleton — fine to share across requests within one Next.js worker because
// the only mutable state is the cached session token, which Pagadito accepts
// from concurrent callers.
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
git commit -m "feat(pagadito): add WSPG client with connect/execTrans/getStatus

Implements session token caching with 25min TTL, auto-retry on PG2004,
and runtime validation of exec_trans inputs. Wire format derived from
official PHP SDK; verify against sandbox before going live."
```

---

### Task 8: Smoke script

**Files:**
- Create: `scripts/pagadito-smoke.ts`

- [ ] **Step 1: Write the script**

```ts
/**
 * Manual end-to-end smoke test of the Pagadito client.
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
  console.log(`[smoke] env=${PAGADITO.env} endpoint=${PAGADITO.endpoint}`);

  if (!PAGADITO.isConfigured) {
    console.error("[smoke] PAGADITO_UID / PAGADITO_WSK not set");
    process.exit(1);
  }

  // 1. connect
  console.log("[smoke] step 1: connect");
  const sessionToken = await pagadito.connect();
  console.log(`[smoke] got session token (len=${sessionToken.length})`);

  // 2. exec_trans
  const ern = `SMOKE-${Date.now()}`;
  console.log(`[smoke] step 2: exec_trans ern=${ern} amount=1.00 NIO`);
  const trans = await pagadito.execTrans({
    ern,
    amount:   1.0,
    currency: "NIO",
    details:  [{ quantity: 1, description: "Smoke test", amount: 1.0 }],
  });
  console.log(`[smoke] checkout url=${trans.url}`);
  console.log(`[smoke] transaction token=${trans.token}`);

  // 3. get_status (will be pending until a human pays in sandbox)
  console.log("[smoke] step 3: get_status");
  const status = await pagadito.getStatus(trans.token);
  console.log(`[smoke] code=${status.code} status=${status.status} ref=${status.reference ?? "-"}`);

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

Runs connect -> exec_trans -> get_status against the configured Pagadito
environment. Used to validate credentials and wire format before
integrating into the wizard."
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
  let result;
  try {
    result = await pagadito.execTrans({
      ern,
      amount,
      currency: "NIO",
      details:  [{ quantity: 1, description, amount }],
      customParams: { cita_id: citaId },
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
state, calls exec_trans, persists token + ERN, returns checkout URL."
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
 * after the payment attempt completes. Validates the transaction via get_status
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
  const transactionToken = url.searchParams.get("token");
  const locale = url.searchParams.get("locale") ?? "es";

  if (!PAGADITO.isConfigured) {
    return redirectWithStatus(req, null, locale, "error");
  }
  if (!transactionToken) {
    return redirectWithStatus(req, null, locale, "error");
  }

  const supabase = serviceClient();

  // Look up by opaque token.
  const { data: pago } = await supabase
    .from("pagos")
    .select("id, cita_id, estado")
    .eq("pagadito_token", transactionToken)
    .single();

  if (!pago) return redirectWithStatus(req, null, locale, "desconocido");

  // Idempotent fast-path: already verified.
  if (pago.estado === "verificado") return redirectWithStatus(req, pago.cita_id, locale, "ok");

  let result;
  try {
    result = await pagadito.getStatus(transactionToken);
  } catch (err) {
    console.error("[pagadito/return] get_status failed:", err);
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

Service-role client looks up pago by opaque token, calls get_status, and
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

const BATCH_LIMIT      = 100;
const MIN_AGE_MS       = 5  * 60 * 1000;  // don't reconcile transactions younger than 5 min
const HARD_EXPIRY_MS   = 6  * 60 * 60 * 1000; // 6 h → rechazado

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

  const results = { scanned: pendientes?.length ?? 0, confirmados: 0, rechazados: 0, expirados: 0, errores: 0 };

  for (const pago of pendientes ?? []) {
    if (!pago.iniciado_at || !pago.pagadito_token) {
      results.errores++;
      continue;
    }

    const ageMs = Date.now() - new Date(pago.iniciado_at).getTime();

    // Hard expiry: > 6h without confirmation → rechazado so member can retry.
    if (ageMs > HARD_EXPIRY_MS) {
      await supabase
        .from("pagos")
        .update({ estado: "rechazado", pagadito_estado: "EXPIRED_BY_CRON" })
        .eq("id", pago.id);
      results.expirados++;
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
        await supabase
          .from("pagos")
          .update({
            estado:           "rechazado",
            pagadito_estado:  r.code,
            pagadito_payload: r.raw as object,
          })
          .eq("id", pago.id);
        results.rechazados++;
      }
      // status === 'pending' → no-op, next cycle.
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

Batch-reconciles pagos in 'iniciado' older than 5min via get_status.
Hard-expires entries older than 6h to 'rechazado'. Guarded by
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
- Create: `supabase/migrations/20260601120200_pagadito_pg_cron.sql`

- [ ] **Step 1: Verify pg_cron and pg_net are installed**

Run via Supabase SQL editor:
```sql
SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net');
```
Expected: both present. If `pg_net` is missing, install via the Supabase Dashboard > Database > Extensions.

- [ ] **Step 2: Set the GUC settings via Dashboard or SQL**

```sql
ALTER DATABASE postgres SET app.settings.next_base_url             = 'https://YOUR_APP_URL';
ALTER DATABASE postgres SET app.settings.pagadito_reconcile_secret = 'SAME_VALUE_AS_PAGADITO_RECONCILE_SECRET_ENV';
```
Re-connect to pick up the new settings.

- [ ] **Step 3: Write the migration**

```sql
-- Schedule the Pagadito reconcile endpoint every 10 minutes.
-- Requires:
--   * pg_cron extension
--   * pg_net extension
--   * app.settings.next_base_url and app.settings.pagadito_reconcile_secret set

BEGIN;

SELECT cron.unschedule('pagadito_reconcile')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pagadito_reconcile');

SELECT cron.schedule(
  'pagadito_reconcile',
  '*/10 * * * *',
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
Expected: 1 row, `schedule='*/10 * * * *'`, `active=true`.

- [ ] **Step 6: Inspect first run after 10 min**

```sql
SELECT runid, job_pid, status, return_message, start_time, end_time
  FROM cron.job_run_details
 WHERE jobname = 'pagadito_reconcile'
 ORDER BY start_time DESC LIMIT 5;
```
Expected: `status='succeeded'`. If `failed`, check `return_message` for hints (most common: GUC unset, base URL wrong, secret mismatch, pg_net not installed).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260601120200_pagadito_pg_cron.sql
git commit -m "feat(pagadito): schedule reconcile endpoint via pg_cron every 10min"
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
PAGADITO_RETURN_URL        # https://app.clubsos.com/api/pagadito/return
PAGADITO_RECONCILE_SECRET  # shared with pg_cron GUC app.settings.pagadito_reconcile_secret
```

- [ ] **Step 2: Add a new subsection under "External Integrations"**

Insert before the closing of `### External Integrations`:

```markdown
**Pagadito**: Payment gateway used by `link_pago` method. WSPG client lives in
`lib/pagadito/`. Member flow: wizard creates cita → calls
`POST /api/citas/[id]/pagadito/init` → redirected to Pagadito checkout → returns
via `GET /api/pagadito/return` → RPC `confirmar_cita_por_pago` advances cita to
`confirmado`. A `pg_cron` job calls `POST /api/internal/pagadito/reconcile`
every 10 min as fallback for abandoned returns; pagos in `iniciado` for more
than 6h are hard-expired to `rechazado`. Feature flag: when `PAGADITO_UID` is
empty, the init route returns 503 and `PasoPagaditoRedirect` shows the
"unavailable" error state.
```

- [ ] **Step 3: Add the new estado_pago value to the Citas state machine docs**

In the `### Citas (Appointments) State Machine` section, add a note after the existing flow diagram:

```markdown
`pagos.estado` follows: `pendiente → iniciado → verificado | rechazado`.
- `iniciado` = Pagadito link emitted, awaiting completion.
- `verificado` = payment confirmed (via return URL or reconcile cron).
- `rechazado` = payment failed, cancelled, or hard-expired (>6h in `iniciado`).
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
- WSPG vs APIPG → Task 7 (client) + comment
- `link_pago` repurposed → Task 15 (PasoConfirmar branch)
- Multi-currency at client level → Task 4 (types)
- Return URL + cron reconciliation → Tasks 10, 11, 18
- 6h hard expiry → Task 11
- No WhatsApp on this flow → not added anywhere ✓
- Feature flag → Tasks 5, 9
- RPC `confirmar_cita_por_pago` → Task 2
- Idempotency (30 min reuse) → Task 9
- Banner `?pago=…` → Task 17
- i18n keys (es + en) → Task 12
- CLAUDE.md docs → Task 19

**Placeholder scan:** none — all code shown, all paths exact.

**Type consistency:** `PagaditoClient.execTrans` returns `ExecTransResult` (from `types.ts`) which has `{ url, token }`. The route handler reads `result.url` and `result.token` → consistent. RPC params `p_pago_id, p_pagadito_payload, p_reference` match between SQL definition (Task 2) and TS callers (Tasks 10, 11). ✓

---

## Open verifications (engineer must confirm during implementation)

1. **WSPG wire format.** The exact POST field names (`operation`, `format`, `details` JSON-encoded vs nested form fields) are derived from the public Pagadito PHP SDK and the implementation manual PDF the user has locally (`Manual_Integracion_API_Pagadito_v1.1.pdf`). Before testing against sandbox, open the PHP SDK source and reconcile any discrepancies in `lib/pagadito/client.ts:callRaw`. If sandbox returns `PG2007` or similar on a known-good request, the field encoding is wrong.

2. **Pagadito success codes.** The mapping `PG1002 → connect success`, `PG1003 → exec_trans success`, `PG3001/2/3/4 → status` is based on community references. Verify against the manual PDF — if the codes differ, update `lib/pagadito/client.ts` and `lib/pagadito/errors.ts` together.

3. **Sandbox endpoint URL.** `https://sandbox.pagadito.com/comercios/wspg/charges.php` is the documented sandbox URL. Confirm it's reachable from your environment before the first smoke run.

4. **`cita_eventos` event names.** Task 2's RPC inserts events with `evento='confirmada'` and `evento='pago_sin_cita_activa'`. If the column is an enum, both values must already exist or be added in Task 2 (a sub-step is included to check).
