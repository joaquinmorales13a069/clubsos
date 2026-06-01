import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import { cn } from "@/lib/utils";
import CitaEmpresaActions from "./CitaEmpresaActions";

const ESTADO_COLORS: Record<string, string> = {
  pendiente:         "bg-amber-100 text-amber-700",
  pendiente_empresa: "bg-amber-100 text-amber-700",
  pendiente_pago:    "bg-amber-100 text-amber-700",
  pendiente_admin:   "bg-amber-100 text-amber-700",
  confirmado:        "bg-emerald-100 text-emerald-700",
  completado:        "bg-gray-100 text-gray-600",
  cancelado:         "bg-red-100 text-red-700",
  rechazado:         "bg-red-100 text-red-700",
};

function badgeCls(estado: string): string {
  return cn(
    "inline-block px-2 py-0.5 rounded-full text-xs font-medium",
    ESTADO_COLORS[estado] ?? "bg-gray-100 text-gray-600",
  );
}

type RelOne<T> = T | T[] | null;
function pickOne<T>(rel: RelOne<T>): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

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

export default async function EmpresaCitaDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "empresa_admin") redirect(`/${locale}/dashboard`);

  const t       = await getTranslations("Dashboard.admin.citas.calendario.modal");
  const tEstado = await getTranslations("Dashboard.admin.citas.calendario.estados");
  const tReg    = await getTranslations("Dashboard.empresa.registroCitas");

  // Fetch cita — RLS citas_empresa_admin_read enforces empresa scope automatically
  const { data: cita, error } = await supabase
    .from("citas")
    .select(`
      id, fecha_hora_cita, fecha_hora_fin, estado_sync, motivo_cita, motivo_rechazo, motivo_cancelacion,
      paciente_nombre, paciente_telefono, paciente_cedula, para_titular,
      doctor:doctores(nombre),
      servicio:servicios(nombre),
      ubicacion:ubicaciones(nombre, direccion),
      paciente:users!paciente_id(nombre_completo, telefono, email)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/empresa/citas`);
  if (!cita) notFound();

  // Extra safety: verify cita belongs to this empresa (belt-and-suspenders on top of RLS)
  if (profile?.empresa_id) {
    const { data: check } = await supabase
      .from("citas")
      .select("id")
      .eq("id", id)
      .eq("empresa_id", profile.empresa_id)
      .maybeSingle();
    if (!check) redirect(`/${locale}/dashboard/empresa/citas`);
  }

  const paciente  = pickOne(cita.paciente  as RelOne<{ nombre_completo: string | null; telefono: string | null; email: string | null }>);
  const doctor    = pickOne(cita.doctor    as RelOne<{ nombre: string | null }>);
  const servicio  = pickOne(cita.servicio  as RelOne<{ nombre: string | null }>);
  const ubicacion = pickOne(cita.ubicacion as RelOne<{ nombre: string | null; direccion: string | null }>);

  const pacienteDisplay = cita.para_titular
    ? (paciente?.nombre_completo ?? "—")
    : (cita.paciente_nombre ?? "—");

  const estado = cita.estado_sync;
  let estadoLabel = estado;
  try { estadoLabel = tEstado(estado as Parameters<typeof tEstado>[0]); } catch { /* use raw */ }

  const labelCls = "text-xs font-roboto font-medium text-gray-500 uppercase tracking-wide shrink-0";
  const fieldCls = "text-sm font-roboto text-gray-800 text-right";

  return (
    <>
      <BackButton href={`/${locale}/dashboard/empresa/citas`} />
      <DetailPanel
        title={t("title")}
        closeHref={`/${locale}/dashboard/empresa/citas`}
      >
        <div className="space-y-4">
          <div>
            <span className={badgeCls(estado)}>{estadoLabel}</span>
          </div>

          <dl className="space-y-3">
            <div className="flex justify-between gap-4">
              <dt className={labelCls}>{tReg("fieldCreadoPor")}</dt>
              <dd className={cn(fieldCls, "truncate max-w-[60%]")}>{paciente?.nombre_completo ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className={labelCls}>{tReg("fieldPaciente")}</dt>
              <dd className={cn(fieldCls, "font-medium truncate max-w-[60%]")}>{pacienteDisplay}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className={labelCls}>{t("doctor")}</dt>
              <dd className={cn(fieldCls, "truncate max-w-[60%]")}>{doctor?.nombre ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className={labelCls}>{t("servicio")}</dt>
              <dd className={cn(fieldCls, "truncate max-w-[60%]")}>{servicio?.nombre ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className={labelCls}>{t("ubicacion")}</dt>
              <dd className={cn(fieldCls, "truncate max-w-[60%]")}>{ubicacion?.nombre ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className={labelCls}>{t("fecha")}</dt>
              <dd className={cn(fieldCls, "whitespace-nowrap")}>{formatDateTime(cita.fecha_hora_cita, locale)}</dd>
            </div>
            {paciente?.email && (
              <div className="flex justify-between gap-4">
                <dt className={labelCls}>{tReg("fieldCorreo")}</dt>
                <dd className={cn(fieldCls, "truncate max-w-[60%]")}>{paciente.email}</dd>
              </div>
            )}
            {(cita.para_titular ? paciente?.telefono : cita.paciente_telefono) && (
              <div className="flex justify-between gap-4">
                <dt className={labelCls}>{tReg("fieldTelefono")}</dt>
                <dd className={cn(fieldCls, "truncate max-w-[60%]")}>
                  {cita.para_titular ? paciente?.telefono : cita.paciente_telefono}
                </dd>
              </div>
            )}
            {!cita.para_titular && cita.paciente_cedula && (
              <div className="flex justify-between gap-4">
                <dt className={labelCls}>{tReg("fieldCedula")}</dt>
                <dd className={cn(fieldCls, "truncate max-w-[60%]")}>{cita.paciente_cedula}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className={labelCls}>{t("motivo")}</dt>
              <dd className={cn(fieldCls, "break-words max-w-[60%]")}>{cita.motivo_cita?.trim() || "—"}</dd>
            </div>
            {cita.motivo_rechazo && (
              <div className="flex justify-between gap-4">
                <dt className={labelCls}>{t("motivo_rechazo")}</dt>
                <dd className={cn(fieldCls, "break-words max-w-[60%] text-red-700")}>{cita.motivo_rechazo}</dd>
              </div>
            )}
            {cita.motivo_cancelacion && (
              <div className="flex justify-between gap-4">
                <dt className={labelCls}>{t("motivo_cancelacion")}</dt>
                <dd className={cn(fieldCls, "break-words max-w-[60%] text-gray-600")}>{cita.motivo_cancelacion}</dd>
              </div>
            )}
          </dl>

          <CitaEmpresaActions
            cita={{
              id:              cita.id,
              fecha_hora_cita: cita.fecha_hora_cita,
              estado_sync:     cita.estado_sync,
            }}
          />
        </div>
      </DetailPanel>
    </>
  );
}
