/**
 * Edge Function: enviar_telefono_otp
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Diferencia vs. Appwrite:
 *   En Appwrite, la función generaba el OTP manualmente con users.createToken().
 *   En Supabase, el OTP es generado internamente por el sistema de auth y
 *   entregado a esta función como custom SMS provider — solo necesitamos
 *   reenviarlo al usuario via WhatsApp.
 *
 * Payload recibido de Supabase: { phone: "+50588XXXXXX", otp: "123456" }
 *
 * Variables de entorno (Supabase → Edge Functions → Secrets):
 *   WHATSAPP_PHONE_NUMBER_ID  — ID del número de WhatsApp Business
 *   WHATSAPP_API_TOKEN        — Token de acceso de Meta (System User o Temporal)
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

serve(async (req: Request) => {
  try {
    // Supabase Send SMS Hook envía un objeto con { user, sms }
    const payload = await req.json();
    const phone = payload?.user?.phone;
    const otp = payload?.sms?.otp;

    if (!phone || !otp) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: phone, otp" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Leer secrets inyectados por Supabase en tiempo de ejecución
    const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const WHATSAPP_API_TOKEN = Deno.env.get("WHATSAPP_API_TOKEN");

    if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_API_TOKEN) {
      console.error("Missing WhatsApp environment variables.");
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: missing WhatsApp credentials." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // El teléfono viene en formato E.164 con '+' — se envía tal como está
    // (Meta Cloud API acepta E.164 con o sin '+')
    const waUrl = `https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    // Template 'enviar_otp': tiene componente body con variable {{code}}
    // y un botón de URL de tipo "Copiar código"
    const waBody = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: "enviar_otp",
        language: { code: "es" },
        components: [
          {
            // Cuerpo del template — variable {{code}} recibe el OTP
            type: "body",
            parameters: [
              { type: "text", parameter_name: "code", text: otp },
            ],
          },
          {
            // Botón de URL — permite al usuario copiar el código directamente
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: otp }],
          },
        ],
      },
    };

    const metaResponse = await fetch(waUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
      },
      body: JSON.stringify(waBody),
    });

    if (!metaResponse.ok) {
      const waError = await metaResponse.text();
      console.error(`WhatsApp API respondió ${metaResponse.status}: ${waError}`);
      return new Response(
        JSON.stringify({ error: "Error al enviar mensaje de WhatsApp." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`OTP enviado via template WhatsApp a ${phone}`);
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error in enviar_telefono_otp:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
