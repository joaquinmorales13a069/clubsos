"use client";

/**
 * BeneficioCard — Displays a single benefit with image, title, description,
 * expiry date, and tipo badge.
 */

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Tag, Percent, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export type BeneficioRow = {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha_fin: string | null;
  tipo_beneficio: "descuento" | "promocion";
  beneficio_image_url: string | null;
};

interface BeneficioCardProps {
  beneficio: BeneficioRow;
}

const TIPO_CONFIG: Record<
  string,
  { badge: string; icon: React.ElementType; labelKey: string }
> = {
  descuento: {
    badge: "bg-primary/10 text-white",
    icon: Percent,
    labelKey: "typeDiscount",
  },
  promocion: {
    badge: "bg-secondary/10 text-white",
    icon: Tag,
    labelKey: "typePromotion",
  },
};

function formatFechaFin(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("es-NI", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BeneficioCard({ beneficio }: BeneficioCardProps) {
  const t = useTranslations("Dashboard.miembro.beneficios");
  const config = TIPO_CONFIG[beneficio.tipo_beneficio] ?? TIPO_CONFIG.descuento;
  const Icon = config.icon;
  const fechaFin = formatFechaFin(beneficio.fecha_fin);

  return (
    <article className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
      {/* Image / placeholder */}
      <div className="relative aspect-square bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
        {beneficio.beneficio_image_url ? (
          <Image
            src={beneficio.beneficio_image_url}
            alt={beneficio.titulo}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Icon className="w-10 h-10 text-gray-200" />
          </div>
        )}

        {/* Tipo badge overlaid on image */}
        <span
          className={cn(
            "absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm",
            config.badge,
          )}
        >
          <Icon className="w-3 h-3" />
          {t(config.labelKey)}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1 gap-2">
        <h3 className="font-poppins font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
          {beneficio.titulo}
        </h3>

        {beneficio.descripcion && (
          <p className="font-roboto text-xs text-neutral line-clamp-3 flex-1">
            {beneficio.descripcion}
          </p>
        )}

        {/* Expiry */}
        {fechaFin && (
          <div className="flex items-center gap-1.5 text-xs font-roboto text-neutral/70 mt-auto pt-2 border-t border-gray-50">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
            <span>
              {t("validUntil")} {fechaFin}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
