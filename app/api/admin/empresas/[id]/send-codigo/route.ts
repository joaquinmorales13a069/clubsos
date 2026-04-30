import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { buildCodigoEmpresaEmail } from "@/lib/email/codigoEmpresa";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();

  // Auth: admin only
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch empresa
  const { data: empresa } = await supabase
    .from("empresas")
    .select("nombre, codigo_empresa")
    .eq("id", id)
    .single();

  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  if (!empresa.codigo_empresa) {
    return NextResponse.json({ error: "Código no configurado" }, { status: 400 });
  }

  // Find empresa_admin users for this empresa
  const { data: empAdmins } = await supabase
    .from("users")
    .select("id")
    .eq("empresa_id", id)
    .eq("rol", "empresa_admin");

  if (!empAdmins?.length) {
    return NextResponse.json({ error: "Sin empresa_admin registrados" }, { status: 400 });
  }

  // Get their emails via service role (access to auth.users)
  const adminClient = createServiceClient();
  const emailResults = await Promise.all(
    empAdmins.map((u) => adminClient.auth.admin.getUserById(u.id)),
  );

  const emails = emailResults
    .map((r) => r.data.user?.email)
    .filter((e): e is string => Boolean(e));

  if (!emails.length) {
    return NextResponse.json({ error: "No se encontraron emails" }, { status: 400 });
  }

  const html = buildCodigoEmpresaEmail(empresa.nombre, empresa.codigo_empresa);

  const sendResults = await Promise.allSettled(
    emails.map((to) =>
      resend.emails.send({
        from: "ClubSOS <noreply@sosmedical.com.ni>",
        to,
        subject: `Código de membresía — ${empresa.nombre}`,
        html,
      }),
    ),
  );

  const failed = sendResults.filter((r) => r.status === "rejected").length;
  if (failed === emails.length) {
    return NextResponse.json({ error: "Error al enviar correos" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: emails.length - failed, failed });
}
