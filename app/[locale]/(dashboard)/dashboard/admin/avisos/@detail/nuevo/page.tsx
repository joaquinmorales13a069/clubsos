import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import AvisoForm from "../_components/AvisoForm";
import { crearAvisoAction } from "./actions";

export default async function NuevoAvisoPage() {
  const locale = await getLocale();
  const t = await getTranslations("Dashboard.admin.avisos.form");
  const supabase = await createClient();

  // Fetch all active empresas for the multi-select
  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, nombre")
    .eq("estado", "activa")
    .order("nombre");

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/avisos`} />
      <DetailPanel title={t("nuevoTitle")} closeHref={`/${locale}/dashboard/admin/avisos`}>
        <AvisoForm
          action={crearAvisoAction}
          initial={{
            titulo:          "",
            descripcion:     "",
            estado_aviso:    "activa",
            fecha_inicio:    "",
            fecha_fin:       "",
            empresa_ids:     [],
            aviso_image_url: null,
          }}
          empresas={empresas ?? []}
          locale={locale}
          mode="nuevo"
        />
      </DetailPanel>
    </>
  );
}
