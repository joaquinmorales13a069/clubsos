import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import AvisoForm from "../../_components/AvisoForm";
import { actualizarAvisoAction } from "./actions";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function EditarAvisoPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.avisos.form");

  const { data: aviso } = await supabase
    .from("avisos")
    .select("id, titulo, descripcion, estado_aviso, fecha_inicio, fecha_fin, empresa_id, aviso_image_url")
    .eq("id", id)
    .maybeSingle();

  if (!aviso) notFound();

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
      <BackButton href={`/${locale}/dashboard/admin/avisos/${id}`} />
      <DetailPanel title={t("editarTitle")} closeHref={`/${locale}/dashboard/admin/avisos/${id}`}>
        <AvisoForm
          action={actualizarAvisoAction}
          initial={{
            id:              aviso.id,
            titulo:          aviso.titulo ?? "",
            descripcion:     aviso.descripcion ?? "",
            estado_aviso:    (aviso.estado_aviso as "activa" | "expirada") ?? "activa",
            fecha_inicio:    toDateInput(aviso.fecha_inicio),
            fecha_fin:       toDateInput(aviso.fecha_fin),
            empresa_ids:     (aviso.empresa_id as string[] | null) ?? [],
            aviso_image_url: aviso.aviso_image_url ?? null,
          }}
          empresas={empresas ?? []}
          locale={locale}
          mode="editar"
        />
      </DetailPanel>
    </>
  );
}
