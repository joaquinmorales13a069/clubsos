/**
 * Miembro — Detalle de cita
 *
 * Shows the full detail of a single cita from the patient's perspective.
 * Actions: cancel (within window) + add to calendar.
 */
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import CitaEstadoBadge from "@/components/dashboard/miembro/citas/CitaEstadoBadge";
import { cn } from "@/lib/utils";
import CitaMiembroActions from "./CitaMiembroActions";
import type { CitaEstado } from "@/components/dashboard/miembro/citas/types";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

function formatDateTime(dateStr: string | null, locale: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString(locale === "en" ? "en-US" : "es-NI", {
    timeZone: "America/Managua",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function CitaMiembroDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const t = await getTranslations("Dashboard.miembro.citas");

  // Fetch cita — RLS enforces paciente_id = auth.uid()
  const { data: cita, error } = await supabase
    .from("citas")
    .select(`
      id, fecha_hora_cita, fecha_hora_fin, estado_sync,
      servicio_asociado, paciente_nombre, para_titular,
      motivo_cita,
      doctor:doctores(nombre),
      ubicacion:ubicaciones(nombre, direccion)
    `)
    .eq("id", id)
    .eq("paciente_id", user.id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/citas`);
  if (!cita) notFound();

  const doctor    = (Array.isArray(cita.doctor)    ? cita.doctor[0]    : cita.doctor)    as { nombre: string } | null;
  const ubicacion = (Array.isArray(cita.ubicacion) ? cita.ubicacion[0] : cita.ubicacion) as { nombre: string; direccion: string | null } | null;

  const labelCls = "text-xs font-roboto font-medium text-gray-500 uppercase tracking-wide shrink-0";
  const fieldCls = "text-sm font-roboto text-gray-800 text-right";

  return (
    <>
      <BackButton href={`/${locale}/dashboard/citas`} />
      <DetailPanel
        title={cita.servicio_asociado ?? t("title")}
        closeHref={`/${locale}/dashboard/citas`}
      >
        <div className="space-y-4">
          {/* Estado badge */}
          <div>
            <CitaEstadoBadge estado={cita.estado_sync as CitaEstado} />
          </div>

          {/* Fields */}
          <dl className="space-y-3">
            <div className="flex justify-between gap-4">
              <dt className={labelCls}>{t("fieldFecha")}</dt>
              <dd className={cn(fieldCls, "whitespace-nowrap")}>{formatDateTime(cita.fecha_hora_cita, locale)}</dd>
            </div>
            {doctor?.nombre && (
              <div className="flex justify-between gap-4">
                <dt className={labelCls}>{t("fieldDoctor")}</dt>
                <dd className={cn(fieldCls, "truncate max-w-[60%]")}>{doctor.nombre}</dd>
              </div>
            )}
            {ubicacion?.nombre && (
              <div className="flex justify-between gap-4">
                <dt className={labelCls}>{t("fieldUbicacion")}</dt>
                <dd className={cn(fieldCls, "truncate max-w-[60%]")}>{ubicacion.nombre}</dd>
              </div>
            )}
            {ubicacion?.direccion && (
              <div className="flex justify-between gap-4">
                <dt className={labelCls}>{t("fieldDireccion")}</dt>
                <dd className={cn(fieldCls, "truncate max-w-[60%] text-gray-500")}>{ubicacion.direccion}</dd>
              </div>
            )}
            {!cita.para_titular && cita.paciente_nombre && (
              <div className="flex justify-between gap-4">
                <dt className={labelCls}>{t("fieldPaciente")}</dt>
                <dd className={cn(fieldCls, "truncate max-w-[60%] font-medium")}>{cita.paciente_nombre}</dd>
              </div>
            )}
            {cita.motivo_cita && (
              <div className="flex justify-between gap-4">
                <dt className={labelCls}>{t("fieldMotivo")}</dt>
                <dd className={cn(fieldCls, "break-words max-w-[60%]")}>{cita.motivo_cita}</dd>
              </div>
            )}
          </dl>

          {/* Actions: add to calendar + cancel */}
          <CitaMiembroActions
            cita={{
              id:               cita.id,
              fecha_hora_cita:  cita.fecha_hora_cita,
              fecha_hora_fin:   cita.fecha_hora_fin,
              estado_sync:      cita.estado_sync,
              servicio_asociado: cita.servicio_asociado,
              doctor,
              ubicacion,
            }}
          />
        </div>
      </DetailPanel>
    </>
  );
}
