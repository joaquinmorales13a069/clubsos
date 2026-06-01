import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, X } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import { cn } from "@/lib/utils";
import { formatDateLongNoWeekdayNI, calendarDateNI } from "@/lib/datetime";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

function formatDate(dateStr: string | null, locale: "es" | "en"): string | null {
  if (!dateStr) return null;
  const raw = dateStr.slice(0, 10);
  const [y, m, d] = raw.split("-").map(Number);
  return formatDateLongNoWeekdayNI(
    calendarDateNI(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
    locale,
  );
}

const TIPO_CONFIG: Record<string, { cls: string; labelKey: string }> = {
  descuento: { cls: "bg-primary/10 text-primary",     labelKey: "typeDiscount"  },
  promocion: { cls: "bg-secondary/10 text-secondary", labelKey: "typePromotion" },
};

export default async function BeneficioMiembroDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.miembro.beneficios");
  const td = await getTranslations("Dashboard.miembro.beneficios.detalle");

  const { data: beneficio, error } = await supabase
    .from("beneficios")
    .select("id, titulo, descripcion, tipo_beneficio, estado_beneficio, fecha_inicio, fecha_fin, porcentaje_descuento, beneficio_image_url")
    .eq("id", id)
    .eq("estado_beneficio", "activa")
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/beneficios`);
  if (!beneficio) notFound();

  const config    = TIPO_CONFIG[beneficio.tipo_beneficio] ?? TIPO_CONFIG.descuento;
  const fechaFin    = formatDate(beneficio.fecha_fin, locale as "es" | "en");
  const fechaInicio = formatDate(beneficio.fecha_inicio, locale as "es" | "en");

  return (
    <>
      <BackButton href={`/${locale}/dashboard/beneficios`} />
      <DetailPanel
        title={beneficio.titulo ?? td("untitled")}
        closeHref={`/${locale}/dashboard/beneficios`}
      >
        <div className="space-y-4">
          {/* Image */}
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
            {beneficio.beneficio_image_url ? (
              <Image
                src={beneficio.beneficio_image_url}
                alt={beneficio.titulo}
                fill
                sizes="(max-width: 1024px) 100vw, 400px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center" />
            )}
          </div>

          {/* Tipo pill */}
          <span className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
            config.cls,
          )}>
            {t(config.labelKey)}
          </span>

          {/* Porcentaje de descuento */}
          {beneficio.tipo_beneficio === "descuento" && beneficio.porcentaje_descuento && (
            <p className="font-poppins font-bold text-2xl text-[#CD2129]">
              {/^\d+(\.\d+)?$/.test(beneficio.porcentaje_descuento)
                ? `${beneficio.porcentaje_descuento}%`
                : beneficio.porcentaje_descuento}
            </p>
          )}

          {/* Description */}
          <p className="font-roboto text-sm text-neutral leading-relaxed">
            {beneficio.descripcion ?? t("noDescripcion")}
          </p>

          {/* Dates */}
          {(fechaInicio || fechaFin) && (
            <div className="flex items-start gap-2 pt-1 border-t border-gray-100">
              <CalendarDays className="w-4 h-4 text-neutral/50 shrink-0 mt-0.5" />
              <div className="text-xs font-roboto text-neutral/70 space-y-0.5">
                {fechaInicio && (
                  <p>
                    {t("fieldVigencia")}: {fechaInicio}
                    {fechaFin ? ` – ${fechaFin}` : ""}
                  </p>
                )}
                {!fechaInicio && fechaFin && (
                  <p>{t("validUntil")} {fechaFin}</p>
                )}
              </div>
            </div>
          )}

          {/* Close / back link */}
          <Link
            href={`/${locale}/dashboard/beneficios`}
            className="flex items-center justify-center gap-1.5 w-full mt-2 py-2.5 rounded-xl border border-gray-200 text-sm font-roboto font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            {t("cerrar")}
          </Link>
        </div>
      </DetailPanel>
    </>
  );
}
