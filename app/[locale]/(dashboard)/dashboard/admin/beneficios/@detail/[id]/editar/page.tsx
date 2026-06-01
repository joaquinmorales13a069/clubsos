import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import BeneficioForm from "../../_components/BeneficioForm";
import { actualizarBeneficioAction } from "./actions";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function EditarBeneficioPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.beneficios.form");

  const { data: beneficio } = await supabase
    .from("beneficios")
    .select("id, titulo, descripcion, tipo_beneficio, estado_beneficio, fecha_inicio, fecha_fin, empresa_id, porcentaje_descuento, beneficio_image_url")
    .eq("id", id)
    .maybeSingle();

  if (!beneficio) notFound();

  // Fetch all active empresas for the multi-select
  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, nombre")
    .eq("estado", "activa")
    .order("nombre");

  function toDateInput(iso: string | null): string {
    return iso ? iso.slice(0, 10) : "";
  }

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/beneficios/${id}`} />
      <DetailPanel title={t("editarTitle")} closeHref={`/${locale}/dashboard/admin/beneficios/${id}`}>
        <BeneficioForm
          action={actualizarBeneficioAction}
          initial={{
            id:                   beneficio.id,
            titulo:               beneficio.titulo ?? "",
            descripcion:          beneficio.descripcion ?? "",
            tipo_beneficio:       (beneficio.tipo_beneficio as "descuento" | "promocion") ?? "descuento",
            estado_beneficio:     (beneficio.estado_beneficio as "activa" | "expirada") ?? "activa",
            fecha_inicio:         toDateInput(beneficio.fecha_inicio),
            fecha_fin:            toDateInput(beneficio.fecha_fin),
            empresa_ids:          (beneficio.empresa_id as string[] | null) ?? [],
            porcentaje_descuento: beneficio.porcentaje_descuento ?? "",
            beneficio_image_url:  beneficio.beneficio_image_url ?? null,
          }}
          empresas={empresas ?? []}
          locale={locale}
          mode="editar"
        />
      </DetailPanel>
    </>
  );
}
