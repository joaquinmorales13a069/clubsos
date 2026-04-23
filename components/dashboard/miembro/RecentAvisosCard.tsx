/**
 * RecentAvisosCard — Home info card showing the 2 latest active announcements.
 * Server Component.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Megaphone, ChevronRight } from "lucide-react";

type Aviso = {
  id: string;
  titulo: string;
  descripcion: string | null;
  created_at: string;
};

interface RecentAvisosCardProps {
  avisos: Aviso[];
  locale: string;
}

export default async function RecentAvisosCard({ avisos, locale }: RecentAvisosCardProps) {
  const t = await getTranslations("Dashboard.miembro.inicio.avisos");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-secondary" />
          <span className="text-sm font-poppins font-semibold text-gray-900">{t("title")}</span>
        </div>
        <Link
          href={`/${locale}/dashboard/avisos`}
          className="flex items-center gap-0.5 text-xs font-roboto text-secondary hover:text-secondary/80 transition-colors"
        >
          {t("viewAll")}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Body */}
      <div className="p-4">
        {avisos.length > 0 ? (
          <ul className="space-y-3">
            {avisos.map((a) => (
              <li key={a.id} className="space-y-0.5">
                <p className="text-sm font-roboto font-medium text-gray-800 leading-snug">
                  {a.titulo}
                </p>
                {a.descripcion && (
                  <p className="text-xs font-roboto text-neutral line-clamp-2">
                    {a.descripcion}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center text-center py-3 space-y-1">
            <Megaphone className="w-8 h-8 text-gray-200" />
            <p className="text-sm font-roboto text-gray-500">{t("empty")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
