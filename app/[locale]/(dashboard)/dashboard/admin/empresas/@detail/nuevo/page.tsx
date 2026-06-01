import { getLocale, getTranslations } from "next-intl/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import EmpresaForm from "../_components/EmpresaForm";
import { crearEmpresaAction } from "./actions";

export default async function NuevaEmpresaPage() {
  const locale = await getLocale();
  const t = await getTranslations("Dashboard.admin.empresas.form");

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/empresas`} />
      <DetailPanel title={t("nuevoTitle")} closeHref={`/${locale}/dashboard/admin/empresas`}>
        <EmpresaForm
          action={crearEmpresaAction}
          initial={{
            nombre: "",
            codigo_empresa: "",
            notas: "",
            auto_confirmar_citas: false,
            estado: "activa",
            ruc: "",
            direccion_calle: "",
            departamento: "",
          }}
          locale={locale}
          mode="nuevo"
        />
      </DetailPanel>
    </>
  );
}
