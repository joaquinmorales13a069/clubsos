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

/**
 * Reconstruct the public-facing base URL, honoring reverse-proxy headers.
 *
 * Behind EasyPanel / Vercel / any proxy, `req.url` reports the internal host
 * (e.g. `https://localhost:80`) because Next.js builds it from the incoming
 * `Host` header which the proxy rewrites. The proxy forwards the real public
 * host in `x-forwarded-host` and the original protocol in `x-forwarded-proto`.
 * Falling back to `req.url` keeps local dev working.
 *
 * The cita detail page does NOT exist yet — always redirect to the list page
 * where <PagoBanner /> fires the toast based on `?pago=<status>`.
 */
function publicBaseUrl(req: NextRequest): string {
  const xfHost  = req.headers.get("x-forwarded-host");
  const xfProto = req.headers.get("x-forwarded-proto");
  if (xfHost) return `${xfProto ?? "https"}://${xfHost}`;
  return new URL(req.url).origin;
}

function redirectWithStatus(
  req: NextRequest,
  _citaId: string | null,
  locale: string,
  status: "ok" | "rechazado" | "pendiente" | "desconocido" | "error",
) {
  // Always land on the list page — PagoBanner handles the toast there.
  // The cita-detail route does not exist; keeping citaId in the path 404s.
  const path = `/${locale}/dashboard/citas?pago=${status}`;
  return NextResponse.redirect(new URL(path, publicBaseUrl(req)));
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
        estado:           "rechazado",
        pagadito_estado:  result.rawStatus,
        pagadito_payload: result.raw as object,
      })
      .eq("id", pago.id);
    return redirectWithStatus(req, pago.cita_id, locale, "rechazado");
  }

  // status === 'pending' — leave for the cron to reconcile.
  return redirectWithStatus(req, pago.cita_id, locale, "pendiente");
}
