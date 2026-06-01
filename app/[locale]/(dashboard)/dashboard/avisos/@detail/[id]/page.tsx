import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, X, Megaphone } from "lucide-react";
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

export default async function AvisoMiembroDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.miembro.avisos");
  const td = await getTranslations("Dashboard.miembro.avisos.detalle");

  const { data: aviso, error } = await supabase
    .from("avisos")
    .select("id, titulo, descripcion, estado_aviso, fecha_inicio, fecha_fin, aviso_image_url")
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/avisos`);
  if (!aviso) notFound();

  const fechaFin    = formatDate(aviso.fecha_fin, locale as "es" | "en");
  const fechaInicio = formatDate(aviso.fecha_inicio, locale as "es" | "en");

  return (
    <>
      <BackButton href={`/${locale}/dashboard/avisos`} />
      <DetailPanel
        title={aviso.titulo ?? td("untitled")}
        closeHref={`/${locale}/dashboard/avisos`}
      >
        <div className="space-y-4">
          {/* Image */}
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-rose-50">
            {aviso.aviso_image_url ? (
              <Image
                src={aviso.aviso_image_url}
                alt={aviso.titulo}
                fill
                sizes="(max-width: 1024px) 100vw, 400px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Megaphone className="w-16 h-16 text-rose-200" />
              </div>
            )}
          </div>

          {/* Status pill */}
          <span className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
            aviso.estado_aviso === "activa"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-100 text-gray-500",
          )}>
            {aviso.estado_aviso === "activa" ? t("estadoActiva") : t("estadoExpirada")}
          </span>

          {/* Description */}
          <p className="font-roboto text-sm text-neutral leading-relaxed">
            {aviso.descripcion ?? t("noDescripcion")}
          </p>

          {/* Dates */}
          {(fechaInicio || fechaFin) && (
            <div className="flex items-start gap-2 pt-1 border-t border-gray-100">
              <CalendarDays className="w-4 h-4 text-neutral/50 shrink-0 mt-0.5" />
              <div className="text-xs font-roboto text-neutral/70 space-y-0.5">
                {fechaInicio && (
                  <p>
                    {t("vigencia")}: {fechaInicio}
                    {fechaFin ? ` – ${fechaFin}` : ""}
                  </p>
                )}
                {!fechaInicio && fechaFin && (
                  <p>{t("validHasta")} {fechaFin}</p>
                )}
              </div>
            </div>
          )}

          {/* Close / back link */}
          <Link
            href={`/${locale}/dashboard/avisos`}
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
