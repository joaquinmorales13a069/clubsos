/**
 * POST /api/admin/documentos/notificar
 *
 * Sends a WhatsApp notification to the patient after a medical document is uploaded.
 * Uses service role client to generate the signed URL (private bucket).
 *
 * Templates:
 *   resultado_medico_pdf   → PDF / Word docs (header type: document)
 *   resultado_medico_imagen → images (header type: image)
 *
 * Variables {{1}} nombre_completo, {{2}} tipo_documento label, {{3}} fecha_documento DD-MM-YYYY
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  laboratorio:     "Laboratorio",
  radiologia:      "Radiología",
  consulta_medica: "Consulta Médica",
  especialidades:  "Especialidades",
  receta:          "Receta",
  otro:            "Otro",
};

function formatFecha(dateStr: string | null): string {
  if (!dateStr) return "—";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function toE164(phone: string): string {
  const digits = phone.replace(/\s/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function isImageMime(mime: string): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(mime);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Verify auth — admin role required
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Parse body
  let documentoId: string;
  try {
    ({ documentoId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!documentoId) {
    return NextResponse.json({ error: "documentoId required" }, { status: 400 });
  }

  // 3. Service role client for storage + document fetch
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 4. Fetch document + user phone
  const { data: doc, error: docError } = await service
    .from("documentos_medicos")
    .select("id, nombre_documento, tipo_documento, tipo_archivo, fecha_documento, file_path, usuario:users!usuario_id(nombre_completo, telefono)")
    .eq("id", documentoId)
    .single();

  if (docError || !doc) {
    console.error("[notificar] Documento no encontrado:", docError);
    return NextResponse.json({ error: "Documento not found" }, { status: 404 });
  }

  const usuario = doc.usuario as unknown as { nombre_completo: string | null; telefono: string | null };

  // 5. Skip if patient has no phone number
  if (!usuario?.telefono) {
    console.warn(`[notificar] Documento ${documentoId}: usuario sin teléfono, omitiendo`);
    return NextResponse.json({ skipped: true });
  }

  // 6. Generate signed URL (60s TTL) via service role
  const { data: signedData, error: signedError } = await service.storage
    .from("documentos-medicos")
    .createSignedUrl(doc.file_path, 60);

  if (signedError || !signedData?.signedUrl) {
    console.error("[notificar] Error generando signed URL:", signedError);
    return NextResponse.json({ error: "Could not generate signed URL" }, { status: 500 });
  }

  // 7. Determine template and header type based on MIME
  const mimeType    = doc.tipo_archivo ?? "";
  const isImage     = isImageMime(mimeType);
  const templateName = isImage ? "resultado_medico_imagen" : "resultado_medico_pdf";
  const headerParam  = isImage
    ? { type: "image",    image:    { link: signedData.signedUrl } }
    : { type: "document", document: { link: signedData.signedUrl, filename: doc.nombre_documento } };

  // 8. Build template variables
  const v1 = usuario.nombre_completo ?? "—";
  const v2 = TIPO_LABELS[doc.tipo_documento] ?? doc.tipo_documento;
  const v3 = formatFecha(doc.fecha_documento);

  // 9. Send WhatsApp via Meta Cloud API
  const waRes = await fetch(
    `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164(usuario.telefono),
        type: "template",
        template: {
          name: templateName,
          language: { code: "es" },
          components: [
            {
              type: "header",
              parameters: [headerParam],
            },
            {
              type: "body",
              parameters: [
                { type: "text", text: v1 },
                { type: "text", text: v2 },
                { type: "text", text: v3 },
              ],
            },
          ],
        },
      }),
    },
  );

  if (!waRes.ok) {
    const errBody = await waRes.text();
    console.error(`[notificar] WhatsApp API ${waRes.status}: ${errBody}`);
    return NextResponse.json({ error: `WhatsApp error ${waRes.status}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
