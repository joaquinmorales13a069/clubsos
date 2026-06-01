import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import BeneficioForm from "../_components/BeneficioForm";
import { crearBeneficioAction } from "./actions";

export default async function NuevoBeneficioPage() {
  const locale = await getLocale();
  const t = await getTranslations("Dashboard.admin.beneficios.form");
  const supabase = await createClient();

  // Fetch all active empresas for the multi-select
  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, nombre")
    .eq("estado", "activa")
    .order("nombre");

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/beneficios`} />
      <DetailPanel title={t("nuevoTitle")} closeHref={`/${locale}/dashboard/admin/beneficios`}>
        <BeneficioForm
          action={crearBeneficioAction}
          initial={{
            titulo:               "",
            descripcion:          "",
            tipo_beneficio:       "descuento",
            estado_beneficio:     "activa",
            fecha_inicio:         "",
            fecha_fin:            "",
            empresa_ids:          [],
            porcentaje_descuento: "",
            beneficio_image_url:  null,
          }}
          empresas={empresas ?? []}
          locale={locale}
          mode="nuevo"
        />
      </DetailPanel>
    </>
  );
}
