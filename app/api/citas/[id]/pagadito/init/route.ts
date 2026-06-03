import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { pagadito } from "@/lib/pagadito/client";
import { PAGADITO } from "@/lib/pagadito/config";
import { PagaditoError } from "@/lib/pagadito/errors";
import { logAction } from "@/utils/audit";

const REUSE_WINDOW_MS = 30 * 60 * 1000; // 30 min: reuse existing link if still fresh

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
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

  const { id: citaId } = await ctx.params;

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

  // Only citas in pendiente_pago are payable via Pagadito. Other states
  // (cancelado, rechazado, confirmado, completado) must not issue links.
  if (cita.estado_sync !== "pendiente_pago") {
    return NextResponse.json(
      { error: "Cita not payable", i18nKey: "cita_not_payable" },
      { status: 409 },
    );
  }

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

  // audit_logs has a policy that blocks all client INSERTs (audit_no_client_insert).
  // The member's session client cannot write here — use the service-role client.
  await logAction(createServiceClient(), {
    actorId:      user.id,
    actorRol:     "miembro",
    accion:       "pago.pagadito.init",
    entidad:      "pagos",
    entidadId:    pago.id,
    datosDespues: { ern, amount, currency: "NIO" },
  });

  return NextResponse.json({ redirect_url: result.url });
}
