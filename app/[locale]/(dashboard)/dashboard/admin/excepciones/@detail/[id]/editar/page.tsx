import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import ExcepcionForm from "../../_components/ExcepcionForm";
import type { ExcepcionScope } from "../../_components/ExcepcionForm";
import { actualizarExcepcionAction } from "./actions";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

function scopeOf(doctor_id: string | null, ubicacion_id: string | null): ExcepcionScope {
  if (doctor_id && ubicacion_id) return "both";
  if (doctor_id)                  return "doctor";
  if (ubicacion_id)               return "ubicacion";
  return "global";
}

/** Convert ISO to YYYY-MM-DDTHH:mm for datetime-local. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditarExcepcionPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.excepciones.form");

  const [{ data: excepcion }, { data: doctoresData }, { data: ubicacionesData }] = await Promise.all([
    supabase
      .from("excepciones_horario")
      .select("id, doctor_id, ubicacion_id, fecha_inicio, fecha_fin, motivo")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("doctores").select("id, nombre, ubicacion_id").order("nombre"),
    supabase.from("ubicaciones").select("id, nombre").order("nombre"),
  ]);

  if (!excepcion) notFound();

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/excepciones/${id}`} />
      <DetailPanel
        title={t("editarTitle")}
        closeHref={`/${locale}/dashboard/admin/excepciones/${id}`}
      >
        <ExcepcionForm
          action={actualizarExcepcionAction}
          initial={{
            id: excepcion.id,
            scope:        scopeOf(excepcion.doctor_id, excepcion.ubicacion_id),
            doctor_id:    excepcion.doctor_id,
            ubicacion_id: excepcion.ubicacion_id,
            fecha_inicio: isoToLocalInput(excepcion.fecha_inicio),
            fecha_fin:    isoToLocalInput(excepcion.fecha_fin),
            motivo:       excepcion.motivo ?? "",
          }}
          doctores={(doctoresData ?? []).map((d) => ({
            id: d.id, nombre: d.nombre, ubicacion_id: d.ubicacion_id ?? null,
          }))}
          ubicaciones={(ubicacionesData ?? []).map((u) => ({ id: u.id, nombre: u.nombre }))}
          locale={locale}
          mode="editar"
        />
      </DetailPanel>
    </>
  );
}
