"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { X, Tag, Percent, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export type BeneficioDetailData = {
  titulo: string;
  descripcion: string | null;
  fecha_fin: string | null;
  fecha_inicio?: string | null;
  tipo_beneficio: "descuento" | "promocion";
  beneficio_image_url: string | null;
  estado_beneficio?: "activa" | "expirada";
};

interface BeneficioDetailModalProps {
  open: boolean;
  onClose: () => void;
  beneficio: BeneficioDetailData | null;
}

const TIPO_CONFIG: Record<
  string,
  { cls: string; icon: React.ElementType; labelKey: string }
> = {
  descuento: { cls: "bg-primary/10 text-primary",   icon: Percent, labelKey: "typeDiscount"  },
  promocion: { cls: "bg-secondary/10 text-secondary", icon: Tag,     labelKey: "typePromotion" },
};

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("es-NI", {
    day: "numeric", month: "long", year: "numeric",
  });
}

export default function BeneficioDetailModal({ open, onClose, beneficio }: BeneficioDetailModalProps) {
  const t = useTranslations("Dashboard.miembro.beneficios");

  if (!open || !beneficio) return null;

  const config  = TIPO_CONFIG[beneficio.tipo_beneficio] ?? TIPO_CONFIG.descuento;
  const Icon    = config.icon;
  const fechaFin   = formatDate(beneficio.fecha_fin);
  const fechaInicio = formatDate(beneficio.fecha_inicio ?? null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden
                   animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <div className="relative w-full aspect-video bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
          {beneficio.beneficio_image_url ? (
            <Image
              src={beneficio.beneficio_image_url}
              alt={beneficio.titulo}
              fill
              sizes="(max-width: 640px) 100vw, 448px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Icon className="w-16 h-16 text-gray-200" />
            </div>
          )}

          {/* Type badge */}
          <span className={cn(
            "absolute top-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-sm bg-white/90",
            config.cls,
          )}>
            <Icon className="w-3 h-3" />
            {t(config.labelKey)}
          </span>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/90 text-gray-600
                       hover:bg-white hover:text-gray-900 transition-colors shadow-sm"
            aria-label={t("cerrar")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          <h2 className="font-poppins font-bold text-gray-900 text-lg leading-snug">
            {beneficio.titulo}
          </h2>

          {/* Description */}
          <p className="font-roboto text-sm text-neutral leading-relaxed">
            {beneficio.descripcion ?? t("noDescripcion")}
          </p>

          {/* Dates */}
          {(fechaInicio || fechaFin) && (
            <div className="flex items-start gap-2 pt-2 border-t border-gray-100">
              <CalendarDays className="w-4 h-4 text-neutral/50 shrink-0 mt-0.5" />
              <div className="text-xs font-roboto text-neutral/70 space-y-0.5">
                {fechaInicio && (
                  <p>{t("fieldVigencia")}: {fechaInicio}{fechaFin ? ` – ${fechaFin}` : ""}</p>
                )}
                {!fechaInicio && fechaFin && (
                  <p>{t("validUntil")} {fechaFin}</p>
                )}
              </div>
            </div>
          )}

          {/* Status badge — only when provided (admin view) */}
          {beneficio.estado_beneficio && (
            <span className={cn(
              "inline-block text-xs font-semibold px-2.5 py-1 rounded-full",
              beneficio.estado_beneficio === "activa"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-500",
            )}>
              {beneficio.estado_beneficio === "activa" ? "Activa" : "Expirada"}
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full mt-1 py-2.5 rounded-xl border border-gray-200 text-sm font-roboto
                       font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {t("cerrar")}
          </button>
        </div>
      </div>
    </div>
  );
}
