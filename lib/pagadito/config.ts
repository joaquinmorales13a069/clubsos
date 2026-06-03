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
