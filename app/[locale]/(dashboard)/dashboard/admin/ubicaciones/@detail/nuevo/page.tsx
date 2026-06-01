import { getLocale, getTranslations } from "next-intl/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import UbicacionForm from "../_components/UbicacionForm";
import { crearUbicacionAction } from "./actions";

export default async function NuevaUbicacionPage() {
  const locale = await getLocale();
  const t = await getTranslations("Dashboard.admin.ubicaciones.form");

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/ubicaciones`} />
      <DetailPanel title={t("nuevoTitle")} closeHref={`/${locale}/dashboard/admin/ubicaciones`}>
        <UbicacionForm
          action={crearUbicacionAction}
          initial={{
            nombre: "",
            direccion: "",
            telefono: "",
            zona_horaria: "America/Managua",
            activo: true,
          }}
          locale={locale}
          mode="nuevo"
        />
      </DetailPanel>
    </>
  );
}
