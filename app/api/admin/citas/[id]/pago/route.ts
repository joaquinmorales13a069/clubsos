import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// ── WhatsApp helpers ──────────────────────────────────────────────────────────

function toE164(phone: string): string {
  const digits = phone.replace(/\s/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

/** UTC ISO timestamp → "DD-MM-YYYY a las HH:MM AM/PM" in Nicaragua time (UTC-6, no DST). */
function formatFechaHoraNicaragua(isoUtc: string): string {
  const local = new Date(new Date(isoUtc).getTime() - 6 * 60 * 60 * 1000);
  const dd    = String(local.getUTCDate()).padStart(2, "0");
  const mm    = String(local.getUTCMonth() + 1).padStart(2, "0");
  const yyyy  = local.getUTCFullYear();
  let   h     = local.getUTCHours();
  const min   = String(local.getUTCMinutes()).padStart(2, "0");
  const ampm  = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${dd}-${mm}-${yyyy} a las ${String(h).padStart(2, "0")}:${min} ${ampm}`;
}

async function sendPagoLinkWhatsApp(
  phone: string,
  nombrePaciente: string,
  servicio: string,
  fechaHora: string,
  linkPago: string,
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const apiToken      = process.env.WHATSAPP_API_TOKEN ?? "";
  if (!phoneNumberId || !apiToken) {
    console.info("[pago/paste_link] WhatsApp credentials not configured — skipping notification");
    return;
  }

  const res = await fetch(
    `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164(phone),
        type: "template",
        template: {
          name: "cita_realizar_pago_link_de_pago",
          language: { code: "es" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: nombrePaciente },
                { type: "text", text: servicio },
                { type: "text", text: fechaHora },
              ],
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: linkPago }],
            },
          ],
        },
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "(no body)");
    console.error(`[pago/paste_link] WhatsApp API ${res.status}: ${errBody}`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: cita_id } = await params;
  let body: { action: string; link_url?: string; notas?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.action === "paste_link") {
    if (!body.link_url) return NextResponse.json({ error: "link_url required" }, { status: 400 });

    const [pagoUpdate, citaRes] = await Promise.all([
      supabase.from("pagos").update({ link_url: body.link_url }).eq("cita_id", cita_id),
      supabase
        .from("citas")
        .select(`
          fecha_hora_cita, servicio_asociado, ea_service_id,
          paciente:users!paciente_id(nombre_completo, telefono),
          servicio:servicios!citas_ea_service_id_fkey(nombre)
        `)
        .eq("id", cita_id)
        .single(),
    ]);

    if (pagoUpdate.error) {
      console.error("[pago/paste_link] pagos update failed:", pagoUpdate.error);
    }

    if (citaRes.data) {
      const cita      = citaRes.data;
      const paciente  = cita.paciente as unknown as { nombre_completo: string | null; telefono: string | null } | null;
      const svcNombre = (cita.servicio as unknown as { nombre: string } | null)?.nombre ?? cita.servicio_asociado ?? "Servicio médico";

      if (paciente?.telefono) {
        sendPagoLinkWhatsApp(
          paciente.telefono,
          paciente.nombre_completo ?? "—",
          svcNombre,
          formatFechaHoraNicaragua(cita.fecha_hora_cita),
          body.link_url,
        ).catch((err) => console.error("[pago/paste_link] WhatsApp threw:", err));
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === "verify") {
    await supabase.from("pagos").update({
      estado: "verificado",
      verificado_por: user.id,
      verificado_at: new Date().toISOString(),
      notas: body.notas ?? null,
    }).eq("cita_id", cita_id);

    const { error } = await supabase.from("citas").update({ estado_sync: "confirmado" }).eq("id", cita_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
