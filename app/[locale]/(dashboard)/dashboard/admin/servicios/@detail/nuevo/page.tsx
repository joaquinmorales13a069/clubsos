import { getLocale, getTranslations } from "next-intl/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import ServicioForm from "../_components/ServicioForm";
import { crearServicioAction } from "./actions";

export default async function NuevoServicioPage() {
  const locale = await getLocale();
  const t = await getTranslations("Dashboard.admin.servicios.form");

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/servicios`} />
      <DetailPanel title={t("nuevoTitle")} closeHref={`/${locale}/dashboard/admin/servicios`}>
        <ServicioForm
          action={crearServicioAction}
          initial={{
            nombre: "",
            descripcion: "",
            duracion: "",
            slot_duracion: "1",
            precio: "",
            activo: true,
          }}
          locale={locale}
          mode="nuevo"
        />
      </DetailPanel>
    </>
  );
}
