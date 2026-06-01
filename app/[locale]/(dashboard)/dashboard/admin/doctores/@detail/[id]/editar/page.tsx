import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import DoctorForm from "../../_components/DoctorForm";
import { actualizarDoctorAction } from "./actions";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function EditarDoctorPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.doctores.form");

  const [doctorRes, ubicacionesRes, serviciosRes, pivoteRes] = await Promise.all([
    supabase.from("doctores")
      .select("id, nombre, correo, telefono, especialidad, activo, ubicacion_id")
      .eq("id", id).maybeSingle(),
    supabase.from("ubicaciones").select("id, nombre").order("nombre"),
    supabase.from("servicios").select("id, nombre").order("nombre"),
    supabase.from("doctor_servicios").select("servicio_id").eq("doctor_id", id),
  ]);

  if (!doctorRes.data) notFound();
  const initialServicios = (pivoteRes.data ?? []).map(r => r.servicio_id as string);

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/doctores/${id}`} />
      <DetailPanel title={t("editarTitle")} closeHref={`/${locale}/dashboard/admin/doctores/${id}`}>
        <DoctorForm
          action={actualizarDoctorAction}
          initial={{
            id: doctorRes.data.id,
            nombre: doctorRes.data.nombre ?? "",
            correo: doctorRes.data.correo ?? "",
            telefono: (doctorRes.data as Record<string, unknown>).telefono as string ?? "",
            especialidad: (doctorRes.data as Record<string, unknown>).especialidad as string ?? "",
            activo: doctorRes.data.activo ?? true,
            ubicacion_id: doctorRes.data.ubicacion_id,
            servicios_ids: initialServicios,
          }}
          ubicaciones={ubicacionesRes.data ?? []}
          servicios={serviciosRes.data ?? []}
          locale={locale}
          mode="editar"
        />
      </DetailPanel>
    </>
  );
}
