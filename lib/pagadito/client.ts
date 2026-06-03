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
    if (!PAGADITO.isConfigured) {
      throw new PagaditoError(
        "CONFIG_ERROR",
        "pagadito_not_configured",
        503,
        "Pagadito client not configured (missing UID/WSK)",
      );
    }

    const startedAt = Date.now();
    console.info(`[pagadito] ${opName} starting`);

    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": this.buildAuthHeader(),
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(15_000), // 15s — generous for a payment API
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
