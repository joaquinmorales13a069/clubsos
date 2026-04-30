import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/utils/supabase/server";
import { buildCodigoEmpresaEmail } from "@/lib/email/codigoEmpresa";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify role = empresa_admin
  const { data: profile } = await supabase
    .from("users")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "empresa_admin" || !profile.empresa_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: empresa } = await supabase
    .from("empresas")
    .select("nombre, codigo_empresa")
    .eq("id", profile.empresa_id)
    .single();

  if (!empresa?.codigo_empresa) {
    return NextResponse.json({ error: "Código no configurado" }, { status: 400 });
  }

  const html = buildCodigoEmpresaEmail(empresa.nombre, empresa.codigo_empresa);

  const { error } = await resend.emails.send({
    from: "ClubSOS <noreply@sosmedical.com.ni>",
    to: user.email,
    subject: `Código de membresía — ${empresa.nombre}`,
    html,
  });

  if (error) {
    console.error("[send-codigo] resend error:", error);
    return NextResponse.json({ error: "Error al enviar el correo" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
