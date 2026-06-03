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
