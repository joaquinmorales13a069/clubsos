import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import DoctorForm from "../_components/DoctorForm";
import { crearDoctorAction } from "./actions";

export default async function NuevoDoctorPage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.doctores.form");

  const [ubicacionesRes, serviciosRes] = await Promise.all([
    supabase.from("ubicaciones").select("id, nombre").order("nombre"),
    supabase.from("servicios").select("id, nombre").order("nombre"),
  ]);

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/doctores`} />
      <DetailPanel title={t("nuevoTitle")} closeHref={`/${locale}/dashboard/admin/doctores`}>
        <DoctorForm
          action={crearDoctorAction}
          initial={{
            nombre: "", correo: "", telefono: "", especialidad: "",
            activo: true, ubicacion_id: null, servicios_ids: [],
          }}
          ubicaciones={ubicacionesRes.data ?? []}
          servicios={serviciosRes.data ?? []}
          locale={locale}
          mode="nuevo"
        />
      </DetailPanel>
    </>
  );
}
