import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import ExcepcionForm from "../_components/ExcepcionForm";
import { crearExcepcionAction } from "./actions";

export default async function NuevaExcepcionPage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.excepciones.form");

  const [{ data: doctoresData }, { data: ubicacionesData }] = await Promise.all([
    supabase.from("doctores").select("id, nombre, ubicacion_id").order("nombre"),
    supabase.from("ubicaciones").select("id, nombre").order("nombre"),
  ]);

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/excepciones`} />
      <DetailPanel
        title={t("nuevoTitle")}
        closeHref={`/${locale}/dashboard/admin/excepciones`}
      >
        <ExcepcionForm
          action={crearExcepcionAction}
          initial={{
            scope:        "global",
            doctor_id:    null,
            ubicacion_id: null,
            fecha_inicio: "",
            fecha_fin:    "",
            motivo:       "",
          }}
          doctores={(doctoresData ?? []).map((d) => ({
            id: d.id, nombre: d.nombre, ubicacion_id: d.ubicacion_id,
          }))}
          ubicaciones={(ubicacionesData ?? []).map((u) => ({ id: u.id, nombre: u.nombre }))}
          locale={locale}
          mode="nuevo"
        />
      </DetailPanel>
    </>
  );
}
