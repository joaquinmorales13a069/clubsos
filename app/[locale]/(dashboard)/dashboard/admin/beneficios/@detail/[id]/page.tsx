import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import Image from "next/image";
import { Pencil } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import { cn } from "@/lib/utils";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function BeneficioDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.beneficios.detalle");

  const { data: beneficio, error } = await supabase
    .from("beneficios")
    .select("id, titulo, descripcion, tipo_beneficio, estado_beneficio, fecha_inicio, fecha_fin, porcentaje_descuento, beneficio_image_url, empresa_id, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/admin/beneficios`);
  if (!beneficio) notFound();

  // Fetch empresa names for the associated IDs (empresa_id is UUID[])
  const empresaIds: string[] = beneficio.empresa_id ?? [];
  let empresaNombres: string[] = [];
  if (empresaIds.length > 0) {
    const { data: empresas } = await supabase
      .from("empresas")
      .select("nombre")
      .in("id", empresaIds)
      .order("nombre");
    empresaNombres = (empresas ?? []).map((e) => e.nombre);
  }

  const tipoBadgeCls = beneficio.tipo_beneficio === "descuento"
    ? "bg-blue-100 text-blue-700"
    : "bg-purple-100 text-purple-700";

  const estadoBadgeCls = beneficio.estado_beneficio === "activa"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-gray-100 text-gray-500";

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/beneficios`} />
      <DetailPanel
        title={beneficio.titulo ?? t("untitled")}
        closeHref={`/${locale}/dashboard/admin/beneficios`}
        actions={
          <Link
            href={`/${locale}/dashboard/admin/beneficios/${id}/editar`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary/80 px-3 py-1.5 rounded-full bg-secondary/5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("editar")}
          </Link>
        }
      >
        <div className="space-y-4">
          {/* Image */}
          {beneficio.beneficio_image_url && (
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100">
              <Image
                src={beneficio.beneficio_image_url}
                alt={beneficio.titulo}
                fill
                sizes="(max-width: 1024px) 100vw, 400px"
                className="object-cover"
              />
            </div>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", tipoBadgeCls)}>
              {beneficio.tipo_beneficio === "descuento" ? t("tipoDescuento") : t("tipoPromocion")}
            </span>
            <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", estadoBadgeCls)}>
              {beneficio.estado_beneficio === "activa" ? t("estadoActiva") : t("estadoExpirada")}
            </span>
          </div>

          {/* Fields */}
          <dl className="space-y-3 text-sm font-roboto">
            {beneficio.descripcion && (
              <div>
                <dt className="text-xs font-semibold text-gray-500 mb-0.5">{t("descripcion")}</dt>
                <dd className="text-gray-800 leading-relaxed">{beneficio.descripcion}</dd>
              </div>
            )}

            {beneficio.porcentaje_descuento && (
              <Field label={t("porcentaje")} value={
                /^\d+(\.\d+)?$/.test(beneficio.porcentaje_descuento)
                  ? `${beneficio.porcentaje_descuento}%`
                  : beneficio.porcentaje_descuento
              } />
            )}

            <Field
              label={t("fechaInicio")}
              value={beneficio.fecha_inicio
                ? new Date(beneficio.fecha_inicio).toLocaleDateString(locale)
                : null}
            />
            <Field
              label={t("fechaFin")}
              value={beneficio.fecha_fin
                ? new Date(beneficio.fecha_fin).toLocaleDateString(locale)
                : null}
            />

            <div>
              <dt className="text-xs font-semibold text-gray-500 mb-1">{t("empresas")}</dt>
              {empresaNombres.length === 0 ? (
                <dd className="text-gray-600 text-xs">{t("empresasTodas")}</dd>
              ) : (
                <dd>
                  <ul className="space-y-0.5">
                    {empresaNombres.map((nombre) => (
                      <li key={nombre} className="text-xs text-gray-700">• {nombre}</li>
                    ))}
                  </ul>
                </dd>
              )}
            </div>

            <Field
              label={t("creado")}
              value={beneficio.created_at
                ? new Date(beneficio.created_at).toLocaleDateString(locale)
                : null}
            />
          </dl>
        </div>
      </DetailPanel>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral">{label}</dt>
      <dd className="text-gray-900 text-right truncate max-w-[60%]">{value ?? "—"}</dd>
    </div>
  );
}
