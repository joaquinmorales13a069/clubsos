import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseCitaError } from "@/lib/citas/errors";

// ── WhatsApp internal notification ───────────────────────────────────────────

function toE164(phone: string): string {
  const digits = phone.replace(/\s/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

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

async function sendNotificacionInterna(opts: {
  receptorNombre:   string;
  receptorTelefono: string;
  pacienteNombre:   string;
  servicio:         string;
  fechaHora:        string;
  doctorNombre:     string;
}): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const apiToken      = process.env.WHATSAPP_API_TOKEN ?? "";
  if (!phoneNumberId || !apiToken) return;

  const res = await fetch(
    `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164(opts.receptorTelefono),
        type: "template",
        template: {
          name: "cita_notificacion_interna_sosmedical",
          language: { code: "es" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: opts.receptorNombre },
              { type: "text", text: opts.pacienteNombre },
              { type: "text", text: opts.servicio },
              { type: "text", text: opts.fechaHora },
              { type: "text", text: opts.doctorNombre },
            ],
          }],
        },
      }),
    },
  );

  if (!res.ok) {
    console.error(`[citas/notif_interna] WhatsApp ${res.status}:`, await res.text().catch(() => ""));
  }
}

// ── POST /api/citas ──────────────────────────────────────────────────────────

type CreateCitaBody = {
  doctor_id:             string;
  servicio_id:           string;
  fecha_hora_cita:       string;
  para_titular:          boolean;
  motivo_cita?:          string;
  servicio_asociado?:    string;
  paciente_nombre?:      string;
  paciente_telefono?:    string;
  paciente_correo?:      string;
  paciente_cedula?:      string;
  contrato_servicio_id?: string;
  metodo_pago?:          "link_pago" | "transferencia" | "pago_clinica";
  monto?:                number;
  notas?:                string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateCitaBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.doctor_id || !body.servicio_id || !body.fecha_hora_cita) {
    return NextResponse.json(
      { error: "doctor_id, servicio_id and fecha_hora_cita are required" },
      { status: 400 },
    );
  }

  const { data: citaId, error: rpcError } = await supabase.rpc("crear_cita_atomic", {
    p_doctor_id:            body.doctor_id,
    p_servicio_id:          body.servicio_id,
    p_fecha_hora_cita:      body.fecha_hora_cita,
    p_para_titular:         body.para_titular,
    p_motivo_cita:          body.motivo_cita ?? undefined,
    p_paciente_nombre:      body.paciente_nombre ?? undefined,
    p_paciente_telefono:    body.paciente_telefono ?? undefined,
    p_paciente_correo:      body.paciente_correo ?? undefined,
    p_paciente_cedula:      body.paciente_cedula ?? undefined,
    p_contrato_servicio_id: body.contrato_servicio_id ?? undefined,
    p_metodo_pago:          body.metodo_pago ?? undefined,
    p_monto:                body.monto ?? undefined,
    p_servicio_asociado:    body.servicio_asociado ?? undefined,
    p_notas:                body.notas ?? undefined,
  });

  if (rpcError) {
    const parsed = parseCitaError(rpcError.message);
    return NextResponse.json(
      { error: parsed.code, i18nKey: parsed.i18nKey },
      { status: parsed.status },
    );
  }

  const { data: cita } = await supabase
    .from("citas")
    .select("id, estado_sync")
    .eq("id", citaId as string)
    .single();

  // Fire-and-forget internal WhatsApp notification (same as before, with new FK joins)
  void (async () => {
    try {
      const [notifRes, pacienteRes, servicioRes, doctorRes] = await Promise.all([
        supabase.from("configuracion_sistema").select("valor").eq("clave", "notificaciones_citas").single(),
        supabase.from("users").select("nombre_completo").eq("id", user.id).single(),
        supabase.from("servicios").select("nombre").eq("id", body.servicio_id).single(),
        supabase.from("doctores").select("nombre").eq("id", body.doctor_id).single(),
      ]);

      const notif = notifRes.data?.valor as { nombre_completo?: string; telefono?: string } | null;
      if (!notif?.nombre_completo || !notif?.telefono) return;

      await sendNotificacionInterna({
        receptorNombre:   notif.nombre_completo,
        receptorTelefono: notif.telefono,
        pacienteNombre:   pacienteRes.data?.nombre_completo ?? "—",
        servicio:         servicioRes.data?.nombre ?? body.servicio_asociado ?? "Servicio médico",
        fechaHora:        formatFechaHoraNicaragua(body.fecha_hora_cita),
        doctorNombre:     doctorRes.data?.nombre ?? "—",
      });
    } catch (err) {
      console.error("[citas/notif_interna] error:", err);
    }
  })();

  return NextResponse.json({ ok: true, cita }, { status: 201 });
}
