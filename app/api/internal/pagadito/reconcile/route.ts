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
