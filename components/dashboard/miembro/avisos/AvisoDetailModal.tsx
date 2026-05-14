"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { X, Megaphone, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export type AvisoDetailData = {
  titulo:          string;
  descripcion:     string | null;
  fecha_inicio:    string | null;
  fecha_fin:       string | null;
  estado_aviso:    "activa" | "expirada";
  aviso_image_url: string | null;
};

interface AvisoDetailModalProps {
  open:    boolean;
  onClose: () => void;
  aviso:   AvisoDetailData | null;
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-NI", {
    day: "numeric", month: "long", year: "numeric",
  });
}

export default function AvisoDetailModal({ open, onClose, aviso }: AvisoDetailModalProps) {
  const t = useTranslations("Dashboard.miembro.avisos");

  if (!open || !aviso) return null;

  const fechaInicio = formatDate(aviso.fecha_inicio);
  const fechaFin    = formatDate(aviso.fecha_fin);

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
        <div className="relative w-full aspect-video bg-rose-50 overflow-hidden">
          {aviso.aviso_image_url ? (
            <Image
              src={aviso.aviso_image_url}
              alt={aviso.titulo}
              fill
              sizes="(max-width: 640px) 100vw, 448px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Megaphone className="w-16 h-16 text-rose-200" />
            </div>
          )}

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
        <div className="px-6 pt-5 pb-7 space-y-4">
          {/* Title + status badge */}
          <div className="space-y-2">
            <span className={cn(
              "inline-block text-xs font-semibold px-2.5 py-1 rounded-full",
              aviso.estado_aviso === "activa"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-500",
            )}>
              {aviso.estado_aviso === "activa" ? t("estadoActiva") : t("estadoExpirada")}
            </span>
            <h2 className="font-poppins font-bold text-gray-900 text-lg leading-snug">
              {aviso.titulo}
            </h2>
          </div>

          {/* Description */}
          <p className="font-roboto text-sm text-neutral leading-relaxed">
            {aviso.descripcion ?? t("noDescripcion")}
          </p>

          {/* Dates */}
          {(fechaInicio || fechaFin) && (
            <div className="flex items-start gap-2 pt-1 border-t border-gray-100">
              <CalendarDays className="w-4 h-4 text-neutral/50 shrink-0 mt-0.5" />
              <p className="text-xs font-roboto text-neutral/70">
                {fechaInicio && <>{t("vigencia")}: {fechaInicio}{fechaFin ? ` – ${fechaFin}` : ""}</>}
                {!fechaInicio && fechaFin && <>{t("validHasta")} {fechaFin}</>}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full mt-2 py-2.5 rounded-xl border border-gray-200 text-sm font-roboto
                       font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {t("cerrar")}
          </button>
        </div>
      </div>
    </div>
  );
}
