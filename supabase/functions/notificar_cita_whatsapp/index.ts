/**
 * Edge Function: notificar_cita_whatsapp
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Triggered by: Supabase DB Webhook — event: INSERT on public.citas
 *   Dashboard → Database → Webhooks → "notificar_cita_whatsapp"
 *   Conditions: tabla = citas, evento = INSERT
 *
 * Flujo de notificación por admin:
 *   1. Intenta WhatsApp (template: cita_solicitada)
 *   2. Si falla o admin sin teléfono → email al admin vía Resend
 *   3. Si falla o admin sin email → email de respaldo a informatica@sosmedical.com.ni
 *
 * Variables de entorno requeridas (Supabase → Edge Functions → Secrets):
 *   WHATSAPP_PHONE_NUMBER_ID  — ID del número de WhatsApp Business
 *   WHATSAPP_API_TOKEN        — Token de acceso Meta (System User)
 *   RESEND_API_KEY            — API key de Resend
 *
 * Auto-inyectadas por Supabase:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CitaRecord {
  id: string;
  paciente_id: string;
  empresa_id: string | null;
  ea_service_id: number | null;
  servicio_asociado: string | null;
  fecha_hora_cita: string;
  para_titular: boolean;
  estado_sync: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: CitaRecord;
  old_record: CitaRecord | null;
}

interface AdminUser {
  id: string;
  nombre_completo: string | null;
  telefono: string | null;
  email: string | null;
}

interface PacienteUser {
  nombre_completo: string | null;
  tipo_cuenta: string;
  titular_id: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formatea timestamp UTC a hora local de Nicaragua (UTC-6), sin DST.
 * Resultado: "DD-MM-YYYY a las HH:MM AM/PM"
 */
function formatFechaHoraNicaragua(isoUtc: string): string {
  const utcMs = new Date(isoUtc).getTime();
  const nicaraguaOffsetMs = -6 * 60 * 60 * 1000;
  const local = new Date(utcMs + nicaraguaOffsetMs);

  const dd = String(local.getUTCDate()).padStart(2, "0");
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = local.getUTCFullYear();

  let hours = local.getUTCHours();
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, "0");

  return `${dd}-${mm}-${yyyy} a las ${hh}:${minutes} ${ampm}`;
}

/**
 * Prepende "+" al teléfono si no lo tiene.
 * Los teléfonos en DB se guardan como "50588123456" → "+50588123456".
 */
function toE164(phone: string): string {
  const digits = phone.replace(/\s/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

// ---------------------------------------------------------------------------
// Canal 1: WhatsApp
// ---------------------------------------------------------------------------

async function sendWhatsApp(
  phone: string,
  adminName: string,
  servicioNombre: string,
  fechaHora: string,
  titularNombre: string,
  phoneNumberId: string,
  apiToken: string,
): Promise<boolean> {
  try {
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
            name: "cita_solicitada",
            language: { code: "es" },
            components: [
              {
                type: "body",
                // Variables posicionales {{1}}–{{4}} en orden
                parameters: [
                  { type: "text", text: adminName },
                  { type: "text", text: servicioNombre },
                  { type: "text", text: fechaHora },
                  { type: "text", text: titularNombre },
                ],
              },
            ],
          },
        }),
      },
    );

    if (!res.ok) {
      console.error(`WhatsApp API ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("WhatsApp fetch error:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Canal 2: Email (Resend)
// ---------------------------------------------------------------------------

async function sendEmail(
  to: string,
  adminName: string,
  servicioNombre: string,
  fechaHora: string,
  titularNombre: string,
  resendApiKey: string,
  isFallback = false,
): Promise<boolean> {
  const subject = isFallback
    ? `[Sin canal disponible] Nueva cita pendiente — ${titularNombre}`
    : "Nueva cita médica pendiente de aprobación";

  const intro = isFallback
    ? `<p>Este correo es un respaldo automático porque no fue posible contactar al administrador de empresa por WhatsApp ni por correo directo.</p><hr/>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <body style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;padding:24px">
      ${intro}
      <p>Estimado/a <strong>${adminName}</strong>,</p>
      <p>Se ha agendado una nueva cita médica en tu empresa que requiere tu aprobación:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Servicio</td>
            <td style="padding:8px">${servicioNombre}</td></tr>
        <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Fecha y hora</td>
            <td style="padding:8px">${fechaHora}</td></tr>
        <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Titular</td>
            <td style="padding:8px">${titularNombre}</td></tr>
      </table>
      <p>Por favor ingresa al portal de <strong>Club SOS Medical</strong> para aprobar o rechazar esta cita.</p>
      <p style="color:#888;font-size:12px">Este es un mensaje automático — no responder a este correo.</p>
    </body>
    </html>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        // El dominio del remitente debe estar verificado en Resend
        from: "Club SOS Medical <donotreply@sosmedical.com.ni>",
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      console.error(`Resend API ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend fetch error:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();

    // Solo procesar INSERT de citas con estado pendiente
    if (
      payload.type !== "INSERT" ||
      payload.table !== "citas" ||
      payload.record.estado_sync !== "pendiente"
    ) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const cita = payload.record;

    if (!cita.empresa_id) {
      console.warn(`Cita ${cita.id}: sin empresa_id, omitiendo notificación`);
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // Secrets
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
    const WHATSAPP_API_TOKEN = Deno.env.get("WHATSAPP_API_TOKEN")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const FALLBACK_EMAIL = "informatica@sosmedical.com.ni";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Si la empresa tiene auto_confirmar_citas, el DB trigger ya confirmó la cita
    // y notificar_estado_cita enviará cita_confirmada al miembro. No notificar admins.
    const { data: empresaSettings } = await supabase
      .from("empresas")
      .select("auto_confirmar_citas")
      .eq("id", cita.empresa_id)
      .single();

    if (empresaSettings?.auto_confirmar_citas === true) {
      console.log(`[cita ${cita.id}] auto_confirmar_citas activo — omitiendo notificación a admins`);
      return new Response(JSON.stringify({ skipped: true, reason: "auto_confirmar" }), { status: 200 });
    }

    // Lookups en paralelo: admins + paciente + servicio
    const [adminsRes, pacienteRes, servicioRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, nombre_completo, telefono, email")
        .eq("empresa_id", cita.empresa_id)
        .eq("rol", "empresa_admin")
        .eq("estado", "activo"),

      supabase
        .from("users")
        .select("nombre_completo, tipo_cuenta, titular_id")
        .eq("id", cita.paciente_id)
        .single(),

      cita.ea_service_id
        ? supabase
            .from("servicios")
            .select("nombre")
            .eq("ea_service_id", cita.ea_service_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (adminsRes.error) {
      console.error("Error al obtener empresa_admins:", adminsRes.error);
      return new Response(JSON.stringify({ error: "DB error" }), { status: 500 });
    }

    const admins: AdminUser[] = adminsRes.data ?? [];
    if (admins.length === 0) {
      console.warn(`Cita ${cita.id}: empresa ${cita.empresa_id} sin admins activos`);
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const paciente = pacienteRes.data as PacienteUser | null;
    const servicioNombre =
      (servicioRes.data as { nombre: string } | null)?.nombre ??
      cita.servicio_asociado ??
      "Servicio médico";

    const fechaHora = formatFechaHoraNicaragua(cita.fecha_hora_cita);

    // Resolver {{4}}: nombre del titular siempre
    let titularNombre = paciente?.nombre_completo ?? "—";
    if (paciente?.tipo_cuenta === "familiar" && paciente.titular_id) {
      const { data: titular } = await supabase
        .from("users")
        .select("nombre_completo")
        .eq("id", paciente.titular_id)
        .single();
      if (titular?.nombre_completo) titularNombre = titular.nombre_completo;
    }

    // Notificar a cada empresa_admin con cascada de canales
    await Promise.all(
      admins.map(async (admin) => {
        const adminName = admin.nombre_completo ?? "Administrador";

        // 1. WhatsApp
        if (admin.telefono) {
          const sent = await sendWhatsApp(
            admin.telefono,
            adminName,
            servicioNombre,
            fechaHora,
            titularNombre,
            WHATSAPP_PHONE_NUMBER_ID,
            WHATSAPP_API_TOKEN,
          );
          if (sent) {
            console.log(`[cita ${cita.id}] WhatsApp OK → admin ${admin.id}`);
            return;
          }
          console.warn(`[cita ${cita.id}] WhatsApp falló → admin ${admin.id}, intentando email`);
        }

        // 2. Email al admin
        if (admin.email) {
          const sent = await sendEmail(
            admin.email,
            adminName,
            servicioNombre,
            fechaHora,
            titularNombre,
            RESEND_API_KEY,
          );
          if (sent) {
            console.log(`[cita ${cita.id}] Email OK → admin ${admin.id} (${admin.email})`);
            return;
          }
          console.warn(`[cita ${cita.id}] Email falló → admin ${admin.id}, usando respaldo`);
        }

        // 3. Email de respaldo
        await sendEmail(
          FALLBACK_EMAIL,
          adminName,
          servicioNombre,
          fechaHora,
          titularNombre,
          RESEND_API_KEY,
          true, // isFallback
        );
        console.warn(`[cita ${cita.id}] Email respaldo enviado a ${FALLBACK_EMAIL} por admin ${admin.id}`);
      }),
    );

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("Error inesperado en notificar_cita_whatsapp:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
