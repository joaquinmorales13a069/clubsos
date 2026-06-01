import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import ServicioForm from "../../_components/ServicioForm";
import { actualizarServicioAction } from "./actions";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function EditarServicioPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.servicios.form");

  const { data: servicio } = await supabase
    .from("servicios")
    .select("id, nombre, descripcion, duracion, slot_duracion, precio, activo")
    .eq("id", id).maybeSingle();
  if (!servicio) notFound();

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/servicios/${id}`} />
      <DetailPanel title={t("editarTitle")} closeHref={`/${locale}/dashboard/admin/servicios/${id}`}>
        <ServicioForm
          action={actualizarServicioAction}
          initial={{
            id: servicio.id,
            nombre: servicio.nombre ?? "",
            descripcion: servicio.descripcion ?? "",
            duracion: servicio.duracion != null ? String(servicio.duracion) : "",
            slot_duracion: servicio.slot_duracion != null ? String(servicio.slot_duracion) : "1",
            precio: servicio.precio != null ? String(servicio.precio) : "",
            activo: servicio.activo ?? true,
          }}
          locale={locale}
          mode="editar"
        />
      </DetailPanel>
    </>
  );
}
