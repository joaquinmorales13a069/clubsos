import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function ServicioDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.servicios.detalle");

  const { data: servicio, error } = await supabase
    .from("servicios")
    .select("id, nombre, descripcion, duracion, slot_duracion, precio, activo, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/admin/servicios`);
  if (!servicio) notFound();

  const { count: doctoresCount } = await supabase
    .from("doctor_servicios")
    .select("doctor_id", { count: "exact", head: true })
    .eq("servicio_id", id);

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/servicios`} />
      <DetailPanel
        title={servicio.nombre ?? t("untitled")}
        closeHref={`/${locale}/dashboard/admin/servicios`}
        actions={
          <Link
            href={`/${locale}/dashboard/admin/servicios/${id}/editar`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary/80 px-3 py-1.5 rounded-full bg-secondary/5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("editar")}
          </Link>
        }
      >
        <dl className="space-y-3 text-sm font-roboto">
          <Field label={t("descripcion")}    value={servicio.descripcion} />
          <Field label={t("duracion")}       value={servicio.duracion ? `${servicio.duracion} min` : null} />
          <Field label={t("slotDuracion")}   value={`${servicio.slot_duracion} slot(s)`} />
          <Field label={t("precio")}         value={servicio.precio != null ? `C$${Number(servicio.precio).toFixed(2)}` : null} />
          <Field label={t("activo")}         value={servicio.activo ? t("si") : t("no")} />
          <Field label={t("doctoresCount")}  value={String(doctoresCount ?? 0)} />
          <Field label={t("creado")}         value={servicio.created_at ? new Date(servicio.created_at).toLocaleDateString(locale) : null} />
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
