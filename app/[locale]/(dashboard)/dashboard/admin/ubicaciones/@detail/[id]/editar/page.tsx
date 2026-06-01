import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import UbicacionForm from "../../_components/UbicacionForm";
import { actualizarUbicacionAction } from "./actions";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function EditarUbicacionPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.ubicaciones.form");

  const { data: ubicacion } = await supabase
    .from("ubicaciones")
    .select("id, nombre, direccion, telefono, zona_horaria, activo")
    .eq("id", id).maybeSingle();
  if (!ubicacion) notFound();

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/ubicaciones/${id}`} />
      <DetailPanel title={t("editarTitle")} closeHref={`/${locale}/dashboard/admin/ubicaciones/${id}`}>
        <UbicacionForm
          action={actualizarUbicacionAction}
          initial={{
            id: ubicacion.id,
            nombre: ubicacion.nombre ?? "",
            direccion: ubicacion.direccion ?? "",
            telefono: ubicacion.telefono ?? "",
            zona_horaria: ubicacion.zona_horaria ?? "America/Managua",
            activo: ubicacion.activo ?? true,
          }}
          locale={locale}
          mode="editar"
        />
      </DetailPanel>
    </>
  );
}
