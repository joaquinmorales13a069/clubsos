import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import EmpresaForm from "../../_components/EmpresaForm";
import { actualizarEmpresaAction } from "./actions";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function EditarEmpresaPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.empresas.form");

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nombre, codigo_empresa, notas, auto_confirmar_citas, estado, ruc, direccion_calle, departamento")
    .eq("id", id)
    .maybeSingle();

  if (!empresa) notFound();

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/empresas/${id}`} />
      <DetailPanel title={t("editarTitle")} closeHref={`/${locale}/dashboard/admin/empresas/${id}`}>
        <EmpresaForm
          action={actualizarEmpresaAction}
          initial={{
            id: empresa.id,
            nombre: empresa.nombre ?? "",
            codigo_empresa: empresa.codigo_empresa ?? "",
            notas: empresa.notas ?? "",
            auto_confirmar_citas: empresa.auto_confirmar_citas ?? false,
            estado: (empresa.estado as "activa" | "inactiva") ?? "activa",
            ruc: empresa.ruc ?? "",
            direccion_calle: empresa.direccion_calle ?? "",
            departamento: empresa.departamento ?? "",
          }}
          locale={locale}
          mode="editar"
        />
      </DetailPanel>
    </>
  );
}
