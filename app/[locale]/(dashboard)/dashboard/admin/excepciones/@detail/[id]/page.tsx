import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

type ExcepcionScope = "global" | "doctor" | "ubicacion" | "both";

function scopeOf(doctor_id: string | null, ubicacion_id: string | null): ExcepcionScope {
  if (doctor_id && ubicacion_id) return "both";
  if (doctor_id)                  return "doctor";
  if (ubicacion_id)               return "ubicacion";
  return "global";
}

export default async function ExcepcionDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.excepciones.detalle");

  type RelOne<T> = T | T[] | null;
  function pickOne<T>(rel: RelOne<T>): T | null {
    if (!rel) return null;
    return Array.isArray(rel) ? (rel[0] ?? null) : rel;
  }

  const { data: excepcion, error } = await supabase
    .from("excepciones_horario")
    .select(`
      id, doctor_id, ubicacion_id, fecha_inicio, fecha_fin, motivo, created_at,
      doctores ( id, nombre ),
      ubicaciones ( id, nombre )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/admin/excepciones`);
  if (!excepcion) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doctorNombre    = pickOne((excepcion as any).doctores as { id: string; nombre: string } | null)?.nombre ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ubicacionNombre = pickOne((excepcion as any).ubicaciones as { id: string; nombre: string } | null)?.nombre ?? null;

  const scope = scopeOf(excepcion.doctor_id, excepcion.ubicacion_id);

  function scopeLabel(): string {
    if (scope === "global")    return t("scopeGlobal");
    if (scope === "doctor")    return `${t("scopeDoctor")}: ${doctorNombre ?? "—"}`;
    if (scope === "ubicacion") return `${t("scopeUbicacion")}: ${ubicacionNombre ?? "—"}`;
    return `${t("scopeDoctor")}: ${doctorNombre ?? "—"} · ${t("scopeUbicacion")}: ${ubicacionNombre ?? "—"}`;
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "en" ? "en-US" : "es-NI", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/excepciones`} />
      <DetailPanel
        title={excepcion.motivo ?? t("untitled")}
        closeHref={`/${locale}/dashboard/admin/excepciones`}
        actions={
          <Link
            href={`/${locale}/dashboard/admin/excepciones/${id}/editar`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary/80 px-3 py-1.5 rounded-full bg-secondary/5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("editar")}
          </Link>
        }
      >
        <dl className="space-y-3 text-sm font-roboto">
          <Field label={t("scope")}      value={scopeLabel()} />
          <Field label={t("fechaInicio")} value={fmt(excepcion.fecha_inicio)} />
          <Field label={t("fechaFin")}    value={fmt(excepcion.fecha_fin)} />
          <Field label={t("motivo")}      value={excepcion.motivo} />
          <Field label={t("creado")}      value={excepcion.created_at ? new Date(excepcion.created_at).toLocaleDateString(locale) : null} />
        </dl>
      </DetailPanel>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral">{label}</dt>
      <dd className="text-gray-900 text-right truncate max-w-[60%]">{value ?? "—"}</dd>
    </div>
  );
}
