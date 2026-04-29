/**
 * Edge Function: notificar_estado_cita
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Triggered by: Supabase DB Webhook — evento UPDATE en public.citas
 *   Dashboard → Database → Webhooks → "notificar_estado_cita"
 *
 * Casos manejados:
 *
 *   A) Acción de empresa_admin (old = pendiente → new = confirmado | rechazado)
 *      → WA al miembro (cita_confirmada / cita_rechazada)
 *      → Fallback: email al miembro → informatica@sosmedical.com.ni
 *
 *   B) Cancelación por miembro (old = pendiente | confirmado → new = cancelado)
 *      → WA al miembro (cita_cancelada)
 *      → Fallback: email al miembro (sin fallback a informatica)
 *      → Email informativo a empresa_admin(s) con email configurado (fire-and-forget)
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
  id:                string;
  paciente_id:       string;
  empresa_id:        string | null;
  ea_service_id:     number | null;
  servicio_asociado: string | null;
  fecha_hora_cita:   string;
  estado_sync:       string;
}

interface WebhookPayload {
  type:       "INSERT" | "UPDATE" | "DELETE";
  table:      string;
  schema:     string;
  record:     CitaRecord;
  old_record: CitaRecord | null;
}

interface MiembroUser {
  nombre_completo: string | null;
  telefono:        string | null;
  email:           string | null;
}

interface AdminUser {
  id:              string;
  nombre_completo: string | null;
  email:           string | null;
}

interface ServicioRow {
  nombre:         string;
  ea_category_id: number;
}

type AdminNotificationType = "confirmado" | "rechazado";
type AdminContext         = "empresa_admin" | "pago_admin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formatea timestamp UTC a hora local de Nicaragua (UTC-6), sin DST. */
function formatFechaHoraNicaragua(isoUtc: string): string {
  const local   = new Date(new Date(isoUtc).getTime() + (-6 * 60 * 60 * 1000));
  const dd      = String(local.getUTCDate()).padStart(2, "0");
  const mm      = String(local.getUTCMonth() + 1).padStart(2, "0");
  const yyyy    = local.getUTCFullYear();
  let   hours   = local.getUTCHours();
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  const ampm    = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${dd}-${mm}-${yyyy} a las ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

/** Prepende "+" si el teléfono no lo tiene (DB guarda sin "+"). */
function toE164(phone: string): string {
  const d = phone.replace(/\s/g, "");
  return d.startsWith("+") ? d : `+${d}`;
}

/** Mapea ea_category_id a nombre de ubicación. */
function resolveUbicacion(eaCategoryId: number): string {
  const MAP: Record<number, string> = { 1: "Managua", 2: "León" };
  return MAP[eaCategoryId] ?? `Sucursal ${eaCategoryId}`;
}

// ---------------------------------------------------------------------------
// Canal WhatsApp
// ---------------------------------------------------------------------------

async function sendWhatsApp(params: {
  phone:         string;
  templateName:  string;
  variables:     string[];
  phoneNumberId: string;
  apiToken:      string;
}): Promise<boolean> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${params.phoneNumberId}/messages`,
      {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${params.apiToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to:   toE164(params.phone),
          type: "template",
          template: {
            name:     params.templateName,
            language: { code: "es" },
            components: [{
              type:       "body",
              parameters: params.variables.map((text) => ({ type: "text", text })),
            }],
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
// Canal Email (Resend)
// ---------------------------------------------------------------------------

async function sendEmail(params: {
  to:           string;
  subject:      string;
  html:         string;
  resendApiKey: string;
}): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${params.resendApiKey}`,
      },
      body: JSON.stringify({
        from:    "Club SOS Medical <donotreply@sosmedical.com.ni>",
        to:      [params.to],
        subject: params.subject,
        html:    params.html,
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
// Plantillas de email
// ---------------------------------------------------------------------------

function buildMiembroStatusEmail(params: {
  nombre:    string;
  servicio:  string;
  fechaHora: string;
  tipo:      AdminNotificationType;
  extraInfo: string; // ubicación (confirmado) | nombre admin (rechazado)
  fallback?: boolean;
}): { subject: string; html: string } {
  const { nombre, servicio, fechaHora, tipo, extraInfo, fallback } = params;
  const isConfirmado  = tipo === "confirmado";
  const headerColor   = isConfirmado ? "#22c55e" : "#ef4444";
  const headerTitle   = isConfirmado ? "¡Cita Confirmada!" : "Cita Rechazada";
  const headerMsg     = isConfirmado
    ? "Tu cita médica fue aprobada por tu empresa."
    : "Tu solicitud de cita médica no fue aprobada por tu empresa.";
  const extraLabel    = isConfirmado ? "Ubicación" : "Rechazado por";
  const bodyNote      = isConfirmado
    ? "<p>Por favor preséntate a tu cita a la hora indicada. Recuerda llevar tu documento de identidad.</p>"
    : "<p>Si tienes dudas, comunícate con el administrador de tu empresa.</p>";
  const fallbackNote  = fallback
    ? `<p style="color:#ef4444;font-size:12px">Respaldo automático — no fue posible contactar al miembro por WhatsApp ni por correo directo.</p><hr/>`
    : "";

  return {
    subject: fallback
      ? `[Sin canal] Cita ${isConfirmado ? "confirmada" : "rechazada"} — ${nombre}`
      : isConfirmado ? "Tu cita médica ha sido confirmada" : "Tu cita médica ha sido rechazada",
    html: `<!DOCTYPE html><html lang="es"><body style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;padding:24px">
      ${fallbackNote}
      <div style="background:${headerColor};color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
        <h2 style="margin:0;font-size:20px">${headerTitle}</h2>
        <p style="margin:4px 0 0;font-size:14px;opacity:.9">${headerMsg}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px">
        <p>Estimado/a <strong>${nombre}</strong>,</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600;width:40%">Servicio</td><td style="padding:8px 12px">${servicio}</td></tr>
          <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600">Fecha y hora</td><td style="padding:8px 12px">${fechaHora}</td></tr>
          <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600">${extraLabel}</td><td style="padding:8px 12px">${extraInfo}</td></tr>
        </table>
        ${bodyNote}
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Mensaje automático de Club SOS Medical — no responder.</p>
      </div>
    </body></html>`,
  };
}

function buildMiembroCancelEmail(params: {
  nombre:    string;
  servicio:  string;
  fechaHora: string;
}): { subject: string; html: string } {
  const { nombre, servicio, fechaHora } = params;
  return {
    subject: "Confirmación de cancelación de cita",
    html: `<!DOCTYPE html><html lang="es"><body style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;padding:24px">
      <div style="background:#6b7280;color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
        <h2 style="margin:0;font-size:20px">Cita Cancelada</h2>
        <p style="margin:4px 0 0;font-size:14px;opacity:.9">Tu cita médica ha sido cancelada exitosamente.</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px">
        <p>Estimado/a <strong>${nombre}</strong>,</p>
        <p>Tu cancelación ha sido registrada para la siguiente cita:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600;width:40%">Servicio</td><td style="padding:8px 12px">${servicio}</td></tr>
          <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600">Fecha y hora</td><td style="padding:8px 12px">${fechaHora}</td></tr>
        </table>
        <p>Si deseas agendar una nueva cita, puedes hacerlo desde la plataforma de Club SOS Medical.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Mensaje automático de Club SOS Medical — no responder.</p>
      </div>
    </body></html>`,
  };
}

function buildAdminCancelEmail(params: {
  adminNombre:   string;
  miembroNombre: string;
  servicio:      string;
  fechaHora:     string;
}): { subject: string; html: string } {
  const { adminNombre, miembroNombre, servicio, fechaHora } = params;
  return {
    subject: `Cita cancelada por miembro — ${miembroNombre}`,
    html: `<!DOCTYPE html><html lang="es"><body style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;padding:24px">
      <div style="background:#f59e0b;color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
        <h2 style="margin:0;font-size:20px">Cancelación de Cita</h2>
        <p style="margin:4px 0 0;font-size:14px;opacity:.9">Un miembro de tu empresa ha cancelado su cita.</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px">
        <p>Estimado/a <strong>${adminNombre}</strong>,</p>
        <p>Te informamos que el siguiente miembro ha cancelado su cita médica:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600;width:40%">Miembro</td><td style="padding:8px 12px">${miembroNombre}</td></tr>
          <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600">Servicio</td><td style="padding:8px 12px">${servicio}</td></tr>
          <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600">Fecha y hora</td><td style="padding:8px 12px">${fechaHora}</td></tr>
        </table>
        <p>No se requiere ninguna acción de tu parte. Este correo es únicamente informativo.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Mensaje automático de Club SOS Medical — no responder.</p>
      </div>
    </body></html>`,
  };
}

// ---------------------------------------------------------------------------
// Caso A: Admin aprueba / rechaza → notifica al miembro
// ---------------------------------------------------------------------------

async function handleAdminAction(params: {
  cita:          CitaRecord;
  tipo:          AdminNotificationType;
  context:       AdminContext;
  supabase:      ReturnType<typeof createClient>;
  phoneNumberId: string;
  apiToken:      string;
  resendApiKey:  string;
}) {
  const { cita, tipo, context, supabase, phoneNumberId, apiToken, resendApiKey } = params;
  const FALLBACK_EMAIL = "informatica@sosmedical.com.ni";

  const [miembroRes, servicioRes, empresaRes] = await Promise.all([
    supabase.from("users").select("nombre_completo, telefono, email").eq("id", cita.paciente_id).single(),
    cita.ea_service_id
      ? supabase.from("servicios").select("nombre, ea_category_id").eq("ea_service_id", cita.ea_service_id).single()
      : Promise.resolve({ data: null, error: null }),
    // Fetch empresa name only for empresa_admin rejections (convenio flow)
    tipo === "rechazado" && context === "empresa_admin" && cita.empresa_id
      ? supabase.from("empresas").select("nombre").eq("id", cita.empresa_id).single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const miembro = miembroRes.data as MiembroUser | null;
  if (!miembro) {
    console.error(`[cita ${cita.id}] miembro no encontrado`);
    return;
  }

  const servicio    = servicioRes.data as ServicioRow | null;
  const empresa     = empresaRes.data as { nombre: string } | null;
  const nombre      = miembro.nombre_completo ?? "Miembro";
  const servicioNom = servicio?.nombre ?? cita.servicio_asociado ?? "Servicio médico";
  const fechaHora   = formatFechaHoraNicaragua(cita.fecha_hora_cita);
  const extraInfo   = tipo === "confirmado"
    ? resolveUbicacion(servicio?.ea_category_id ?? 0)
    : context === "pago_admin"
      ? "SOS Medical"
      : (empresa?.nombre ?? "Administrador de empresa");

  const templateName = tipo === "confirmado" ? "cita_confirmada" : "cita_rechazada";
  let notified = false;

  if (miembro.telefono) {
    notified = await sendWhatsApp({ phone: miembro.telefono, templateName, variables: [nombre, servicioNom, fechaHora, extraInfo], phoneNumberId, apiToken });
    if (notified) { console.log(`[cita ${cita.id}] WA ${tipo} OK → miembro`); }
    else           { console.warn(`[cita ${cita.id}] WA falló → intentando email miembro`); }
  }

  if (!notified && miembro.email) {
    const { subject, html } = buildMiembroStatusEmail({ nombre, servicio: servicioNom, fechaHora, tipo, extraInfo });
    notified = await sendEmail({ to: miembro.email, subject, html, resendApiKey });
    if (notified) { console.log(`[cita ${cita.id}] Email ${tipo} OK → ${miembro.email}`); }
    else          { console.warn(`[cita ${cita.id}] Email miembro falló → usando respaldo`); }
  }

  if (!notified) {
    const { subject, html } = buildMiembroStatusEmail({ nombre, servicio: servicioNom, fechaHora, tipo, extraInfo, fallback: true });
    await sendEmail({ to: FALLBACK_EMAIL, subject, html, resendApiKey });
    console.warn(`[cita ${cita.id}] Email respaldo enviado a ${FALLBACK_EMAIL}`);
  }
}

// ---------------------------------------------------------------------------
// Caso B: Miembro cancela → notifica al miembro + email informativo a admins
// ---------------------------------------------------------------------------

async function handleMiembroCancel(params: {
  cita:          CitaRecord;
  supabase:      ReturnType<typeof createClient>;
  phoneNumberId: string;
  apiToken:      string;
  resendApiKey:  string;
}) {
  const { cita, supabase, phoneNumberId, apiToken, resendApiKey } = params;

  const [miembroRes, servicioRes, adminsRes] = await Promise.all([
    supabase.from("users").select("nombre_completo, telefono, email").eq("id", cita.paciente_id).single(),
    cita.ea_service_id
      ? supabase.from("servicios").select("nombre, ea_category_id").eq("ea_service_id", cita.ea_service_id).single()
      : Promise.resolve({ data: null, error: null }),
    // Solo admins con email configurado — no se necesita fallback
    cita.empresa_id
      ? supabase.from("users").select("id, nombre_completo, email").eq("empresa_id", cita.empresa_id).eq("rol", "empresa_admin").eq("estado", "activo").not("email", "is", null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const miembro = miembroRes.data as MiembroUser | null;
  if (!miembro) {
    console.error(`[cita ${cita.id}] miembro no encontrado`);
    return;
  }

  const servicio    = servicioRes.data as ServicioRow | null;
  const admins      = (adminsRes.data ?? []) as AdminUser[];
  const nombre      = miembro.nombre_completo ?? "Miembro";
  const servicioNom = servicio?.nombre ?? cita.servicio_asociado ?? "Servicio médico";
  const fechaHora   = formatFechaHoraNicaragua(cita.fecha_hora_cita);

  // 1. WA al miembro
  let miembroNotified = false;

  if (miembro.telefono) {
    miembroNotified = await sendWhatsApp({
      phone:        miembro.telefono,
      templateName: "cita_cancelada",
      variables:    [nombre, servicioNom, fechaHora],
      phoneNumberId,
      apiToken,
    });
    if (miembroNotified) { console.log(`[cita ${cita.id}] WA cita_cancelada OK → miembro`); }
    else                 { console.warn(`[cita ${cita.id}] WA cancelada falló → intentando email`); }
  }

  // 2. Email al miembro (si WA falló o no tiene teléfono)
  if (!miembroNotified && miembro.email) {
    const { subject, html } = buildMiembroCancelEmail({ nombre, servicio: servicioNom, fechaHora });
    const sent = await sendEmail({ to: miembro.email, subject, html, resendApiKey });
    if (sent) { console.log(`[cita ${cita.id}] Email cancelada OK → ${miembro.email}`); }
    else      { console.warn(`[cita ${cita.id}] Email miembro cancelada falló — sin más fallback`); }
  }

  // 3. Email informativo a empresa_admins con email (fire-and-forget, sin fallback)
  if (admins.length > 0) {
    await Promise.all(
      admins
        .filter((a) => !!a.email)
        .map(async (admin) => {
          const adminNombre = admin.nombre_completo ?? "Administrador";
          const { subject, html } = buildAdminCancelEmail({ adminNombre, miembroNombre: nombre, servicio: servicioNom, fechaHora });
          const sent = await sendEmail({ to: admin.email!, subject, html, resendApiKey });
          if (sent) { console.log(`[cita ${cita.id}] Email cancelada informativo OK → admin ${admin.id}`); }
          else      { console.warn(`[cita ${cita.id}] Email informativo falló → admin ${admin.id}`); }
        }),
    );
  }
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();

    if (payload.type !== "UPDATE" || payload.table !== "citas") {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const { record: cita, old_record: old } = payload;
    const oldEstado = old?.estado_sync ?? "";
    const newEstado = cita.estado_sync;

    // Empresa_admin approves/rejects a convenio cita (pendiente → confirmado/rechazado)
    const isEmpresaAdminAction = oldEstado === "pendiente" && (newEstado === "confirmado" || newEstado === "rechazado");
    // SOS Medical admin rejects a cita due to payment validation failure
    const isPaymentRejection   = (oldEstado === "pendiente_pago" || oldEstado === "pendiente_admin") && newEstado === "rechazado";
    const isAdminAction        = isEmpresaAdminAction || isPaymentRejection;
    const isMiembroCancel      = (oldEstado === "pendiente" || oldEstado === "confirmado") && newEstado === "cancelado";

    if (!isAdminAction && !isMiembroCancel) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const WHATSAPP_PHONE_NUMBER_ID  = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
    const WHATSAPP_API_TOKEN        = Deno.env.get("WHATSAPP_API_TOKEN")!;
    const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (isAdminAction) {
      await handleAdminAction({
        cita,
        tipo:          newEstado as AdminNotificationType,
        context:       isPaymentRejection ? "pago_admin" : "empresa_admin",
        supabase,
        phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
        apiToken:      WHATSAPP_API_TOKEN,
        resendApiKey:  RESEND_API_KEY,
      });
    } else {
      await handleMiembroCancel({
        cita,
        supabase,
        phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
        apiToken:      WHATSAPP_API_TOKEN,
        resendApiKey:  RESEND_API_KEY,
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("Error inesperado en notificar_estado_cita:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
