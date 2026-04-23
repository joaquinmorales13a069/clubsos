/**
 * RecentBeneficiosCard — Home info card showing the 3 latest active benefits.
 * Server Component.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Gift, ChevronRight } from "lucide-react";

type Beneficio = {
  id: string;
  titulo: string;
  tipo_beneficio: "descuento" | "promocion";
  fecha_fin: string | null;
  beneficio_image_url: string | null;
};

interface RecentBeneficiosCardProps {
  beneficios: Beneficio[];
  locale: string;
}

const TIPO_BADGE: Record<string, string> = {
  descuento: "bg-primary/10 text-primary",
  promocion: "bg-secondary/10 text-secondary",
};

export default async function RecentBeneficiosCard({ beneficios, locale }: RecentBeneficiosCardProps) {
  const t = await getTranslations("Dashboard.miembro.inicio.beneficios");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-secondary" />
          <span className="text-sm font-poppins font-semibold text-gray-900">{t("title")}</span>
        </div>
        <Link
          href={`/${locale}/dashboard/beneficios`}
          className="flex items-center gap-0.5 text-xs font-roboto text-secondary hover:text-secondary/80 transition-colors"
        >
          {t("viewAll")}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Body */}
      <div className="p-4">
        {beneficios.length > 0 ? (
          <ul className="space-y-2.5">
            {beneficios.map((b) => (
              <li key={b.id} className="flex items-center gap-2">
                <span
                  className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${TIPO_BADGE[b.tipo_beneficio]}`}
                >
                  {b.tipo_beneficio === "descuento" ? t("typeDiscount") : t("typePromotion")}
                </span>
                <p className="flex-1 text-sm font-roboto text-gray-800 truncate">{b.titulo}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center text-center py-3 space-y-1">
            <Gift className="w-8 h-8 text-gray-200" />
            <p className="text-sm font-roboto text-gray-500">{t("empty")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
