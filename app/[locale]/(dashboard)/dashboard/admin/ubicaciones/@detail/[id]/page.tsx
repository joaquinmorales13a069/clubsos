import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function UbicacionDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.ubicaciones.detalle");

  const { data: ubicacion, error } = await supabase
    .from("ubicaciones")
    .select("id, nombre, direccion, telefono, zona_horaria, activo, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/admin/ubicaciones`);
  if (!ubicacion) notFound();

  const { count: doctoresCount } = await supabase
    .from("doctores")
    .select("id", { count: "exact", head: true })
    .eq("ubicacion_id", id);

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/ubicaciones`} />
      <DetailPanel
        title={ubicacion.nombre ?? t("untitled")}
        closeHref={`/${locale}/dashboard/admin/ubicaciones`}
        actions={
          <Link
            href={`/${locale}/dashboard/admin/ubicaciones/${id}/editar`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary/80 px-3 py-1.5 rounded-full bg-secondary/5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("editar")}
          </Link>
        }
      >
        <dl className="space-y-3 text-sm font-roboto">
          <Field label={t("direccion")}      value={ubicacion.direccion} />
          <Field label={t("telefono")}       value={ubicacion.telefono} />
          <Field label={t("zonaHoraria")}    value={ubicacion.zona_horaria} />
          <Field label={t("activo")}         value={ubicacion.activo ? t("si") : t("no")} />
          <Field label={t("doctoresCount")}  value={String(doctoresCount ?? 0)} />
          <Field label={t("creado")}         value={ubicacion.created_at ? new Date(ubicacion.created_at).toLocaleDateString(locale) : null} />
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
