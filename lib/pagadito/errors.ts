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
