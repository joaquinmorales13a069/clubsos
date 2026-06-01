import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import EditarEmpresaUsuarioForm from "./EditarEmpresaUsuarioForm";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function EditarEmpresaUsuarioPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.empresa.usuarios.editar");

  // ── Empresa-scope guard ──────────────────────────────────────────────────
  const { data: { user: actor } } = await supabase.auth.getUser();
  if (!actor) redirect(`/${locale}/login`);

  const { data: actorRow } = await supabase
    .from("users")
    .select("empresa_id")
    .eq("id", actor.id)
    .single();
  if (!actorRow?.empresa_id) redirect(`/${locale}/dashboard`);

  // ── Fetch target user (verify empresa membership inline) ─────────────────
  const { data: usuario } = await supabase
    .from("users")
    .select("id, nombre_completo, telefono, email, documento_identidad, estado, empresa_id")
    .eq("id", id)
    .maybeSingle();

  if (!usuario || usuario.empresa_id !== actorRow.empresa_id) notFound();

  return (
    <>
      <BackButton href={`/${locale}/dashboard/empresa/usuarios/${id}`} />
      <DetailPanel
        title={t("title")}
        closeHref={`/${locale}/dashboard/empresa/usuarios/${id}`}
      >
        <EditarEmpresaUsuarioForm
          usuario={usuario}
          locale={locale}
        />
      </DetailPanel>
    </>
  );
}
