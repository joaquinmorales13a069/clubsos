import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import EditarUsuarioForm from "./EditarUsuarioForm";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function EditarUsuarioPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.usuarios.editar");

  const [usuarioRes, empresasRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, nombre_completo, rol, estado, empresa_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("empresas")
      .select("id, nombre")
      .order("nombre", { ascending: true }),
  ]);

  if (!usuarioRes.data) notFound();

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/usuarios/${id}`} />
      <DetailPanel
        title={t("title")}
        closeHref={`/${locale}/dashboard/admin/usuarios/${id}`}
      >
        <EditarUsuarioForm
          usuario={usuarioRes.data}
          empresas={empresasRes.data ?? []}
          locale={locale}
        />
      </DetailPanel>
    </>
  );
}
