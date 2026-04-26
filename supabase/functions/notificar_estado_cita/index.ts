/**
 * Edge Function: notificar_estado_cita
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Triggered by: Supabase DB Webhook — event: UPDATE on public.citas
 *   Dashboard → Database → Webhooks → "notificar_estado_cita"
 *   Conditions: tabla = citas, evento = UPDATE
 *
 * Lógica:
 *   - old_record.estado_sync = 'pendiente' AND record.estado_sync = 'confirmado'
 *     → Envía template WhatsApp "cita_confirmada" al miembro que agendó
 *   - old_record.estado_sync = 'pendiente' AND record.estado_sync = 'rechazado'
 *     → Envía template WhatsApp "cita_rechazada" al miembro que agendó
 *   - Cualquier otro cambio de estado → se omite
 *
 * Cascada de canales por fallo:
 *   1. WhatsApp al miembro
 *   2. Email al miembro (si WA falla o no tiene teléfono)
 *   3. Email a informatica@sosmedical.com.ni (si falla o no tiene email)
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
  id:               string;
  paciente_id:      string;
  empresa_id:       string | null;
  ea_service_id:    number | null;
  servicio_asociado: string | null;
  fecha_hora_cita:  string;
  estado_sync:      string;
}

interface WebhookPayload {
  type:       "INSERT" | "UPDATE" | "DELETE";
  table:      string;
  schema:     string;
  record:     CitaRecord;
  old_record: CitaRecord | null;
}

interface PacienteUser {
  nombre_completo: string | null;
  telefono:        string | null;
  email:           string | null;
}

interface ServicioRow {
  nombre:        string;
  ea_category_id: number;
}

interface AdminUser {
  nombre_completo: string | null;
}

type NotificationType = "confirmado" | "rechazado";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formatea timestamp UTC a hora local de Nicaragua (UTC-6), sin DST. */
function formatFechaHoraNicaragua(isoUtc: string): string {
  const utcMs = new Date(isoUtc).getTime();
  const local  = new Date(utcMs + (-6 * 60 * 60 * 1000));

  const dd      = String(local.getUTCDate()).padStart(2, "0");
  const mm      = String(local.getUTCMonth() + 1).padStart(2, "0");
  const yyyy    = local.getUTCFullYear();
  let hours     = local.getUTCHours();
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  const ampm    = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${dd}-${mm}-${yyyy} a las ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

/** Prepende "+" si el teléfono no lo tiene (DB guarda sin "+"). */
function toE164(phone: string): string {
  const digits = phone.replace(/\s/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

/** Mapea ea_category_id a nombre de ubicación. */
function resolveUbicacion(eaCategoryId: number): string {
  const MAP: Record<number, string> = { 1: "Managua", 2: "León" };
  return MAP[eaCategoryId] ?? `Sucursal ${eaCategoryId}`;
}

// ---------------------------------------------------------------------------
// Canal 1: WhatsApp
// ---------------------------------------------------------------------------

async function sendWhatsApp(params: {
  phone:           string;
  templateName:    string;
  variables:       string[];   // ordered {{1}} ... {{n}}
  phoneNumberId:   string;
  apiToken:        string;
}): Promise<boolean> {
  const { phone, templateName, variables, phoneNumberId, apiToken } = params;

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
            name: templateName,
            language: { code: "es" },
            components: [
              {
                type: "body",
                parameters: variables.map((text) => ({ type: "text", text })),
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

async function sendEmail(params: {
  to:           string;
  nombre:       string;
  servicio:     string;
  fechaHora:    string;
  tipo:         NotificationType;
  extraInfo:    string;         // ubicación (confirmado) o admin name (rechazado)
  resendApiKey: string;
  isFallback?:  boolean;
}): Promise<boolean> {
  const { to, nombre, servicio, fechaHora, tipo, extraInfo, resendApiKey, isFallback } = params;

  const isConfirmado = tipo === "confirmado";

  const subject = isFallback
    ? `[Sin canal] Cita ${isConfirmado ? "confirmada" : "rechazada"} — ${nombre}`
    : isConfirmado
      ? "Tu cita médica ha sido confirmada"
      : "Tu cita médica ha sido rechazada";

  const headerColor = isConfirmado ? "#22c55e" : "#ef4444";
  const headerTitle = isConfirmado ? "¡Cita Confirmada!" : "Cita Rechazada";
  const headerMsg   = isConfirmado
    ? "Tu cita médica fue aprobada por tu empresa."
    : "Tu solicitud de cita médica no fue aprobada por tu empresa.";
  const extraLabel  = isConfirmado ? "Ubicación" : "Rechazado por";

  const fallbackNote = isFallback
    ? `<p style="color:#ef4444;font-size:12px">Este correo es un respaldo automático — no fue posible contactar al miembro por WhatsApp ni por correo directo.</p><hr/>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <body style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;padding:24px">
      ${fallbackNote}
      <div style="background:${headerColor};color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
        <h2 style="margin:0;font-size:20px">${headerTitle}</h2>
        <p style="margin:4px 0 0;font-size:14px;opacity:.9">${headerMsg}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px">
        <p>Estimado/a <strong>${nombre}</strong>,</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600;width:40%">Servicio</td>
              <td style="padding:8px 12px">${servicio}</td></tr>
          <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600">Fecha y hora</td>
              <td style="padding:8px 12px">${fechaHora}</td></tr>
          <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600">${extraLabel}</td>
              <td style="padding:8px 12px">${extraInfo}</td></tr>
        </table>
        ${isConfirmado
          ? `<p>Por favor preséntate a tu cita a la hora indicada. Recuerda llevar tu documento de identidad.</p>`
          : `<p>Si tienes dudas, por favor comunícate con el administrador de tu empresa.</p>`
        }
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">
          Este es un mensaje automático de Club SOS Medical — no responder a este correo.
        </p>
      </div>
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
        from: "Club SOS Medical <donotreply@sosmedical.com.ni>",
        to:   [to],
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

    // Solo UPDATE en public.citas
    if (payload.type !== "UPDATE" || payload.table !== "citas") {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const { record: cita, old_record: old } = payload;

    // Solo cuando cambia de 'pendiente' a 'confirmado' o 'rechazado'
    const tipo = cita.estado_sync as NotificationType;
    if (
      old?.estado_sync !== "pendiente" ||
      (cita.estado_sync !== "confirmado" && cita.estado_sync !== "rechazado")
    ) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // Secrets
    const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const WHATSAPP_PHONE_NUMBER_ID  = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
    const WHATSAPP_API_TOKEN        = Deno.env.get("WHATSAPP_API_TOKEN")!;
    const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY")!;
    const FALLBACK_EMAIL            = "informatica@sosmedical.com.ni";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Lookups en paralelo
    const [pacienteRes, servicioRes, adminRes] = await Promise.all([
      supabase
        .from("users")
        .select("nombre_completo, telefono, email")
        .eq("id", cita.paciente_id)
        .single(),

      cita.ea_service_id
        ? supabase
            .from("servicios")
            .select("nombre, ea_category_id")
            .eq("ea_service_id", cita.ea_service_id)
            .single()
        : Promise.resolve({ data: null, error: null }),

      // Para cita_rechazada: primer empresa_admin de la empresa
      cita.empresa_id && tipo === "rechazado"
        ? supabase
            .from("users")
            .select("nombre_completo")
            .eq("empresa_id", cita.empresa_id)
            .eq("rol", "empresa_admin")
            .eq("estado", "activo")
            .order("created_at", { ascending: true })
            .limit(1)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const paciente = pacienteRes.data as PacienteUser | null;
    if (!paciente) {
      console.error(`Cita ${cita.id}: paciente ${cita.paciente_id} no encontrado`);
      return new Response(JSON.stringify({ error: "paciente not found" }), { status: 500 });
    }

    const servicio  = servicioRes.data as ServicioRow | null;
    const adminUser = adminRes.data as AdminUser | null;

    const nombrePaciente  = paciente.nombre_completo ?? "Miembro";
    const servicioNombre  = servicio?.nombre ?? cita.servicio_asociado ?? "Servicio médico";
    const fechaHora       = formatFechaHoraNicaragua(cita.fecha_hora_cita);

    // Variables específicas por tipo
    const extraInfo = tipo === "confirmado"
      ? resolveUbicacion(servicio?.ea_category_id ?? 0)
      : (adminUser?.nombre_completo ?? "Administrador de empresa");

    // Template WA
    const templateName = tipo === "confirmado" ? "cita_confirmada" : "cita_rechazada";
    const waVariables  = [nombrePaciente, servicioNombre, fechaHora, extraInfo];

    // Cascada de canales
    let notified = false;

    // 1. WhatsApp
    if (paciente.telefono) {
      notified = await sendWhatsApp({
        phone:         paciente.telefono,
        templateName,
        variables:     waVariables,
        phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
        apiToken:      WHATSAPP_API_TOKEN,
      });
      if (notified) {
        console.log(`[cita ${cita.id}] WhatsApp ${tipo} OK → paciente ${cita.paciente_id}`);
      } else {
        console.warn(`[cita ${cita.id}] WhatsApp falló, intentando email`);
      }
    }

    // 2. Email al paciente
    if (!notified && paciente.email) {
      notified = await sendEmail({
        to:          paciente.email,
        nombre:      nombrePaciente,
        servicio:    servicioNombre,
        fechaHora,
        tipo,
        extraInfo,
        resendApiKey: RESEND_API_KEY,
      });
      if (notified) {
        console.log(`[cita ${cita.id}] Email ${tipo} OK → ${paciente.email}`);
      } else {
        console.warn(`[cita ${cita.id}] Email al paciente falló, usando respaldo`);
      }
    }

    // 3. Email de respaldo
    if (!notified) {
      await sendEmail({
        to:          FALLBACK_EMAIL,
        nombre:      nombrePaciente,
        servicio:    servicioNombre,
        fechaHora,
        tipo,
        extraInfo,
        resendApiKey: RESEND_API_KEY,
        isFallback:  true,
      });
      console.warn(`[cita ${cita.id}] Email respaldo enviado a ${FALLBACK_EMAIL}`);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("Error inesperado en notificar_estado_cita:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
