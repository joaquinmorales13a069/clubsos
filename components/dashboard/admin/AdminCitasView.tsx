"use client";

/**
 * Lista wrapper para la página /admin/citas (split-pane layout).
 * El botón "Calendario" navega a /admin/citas-calendario (página separada,
 * full-bleed, no hereda el layout de split-pane).
 */

import Link from "next/link";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { List, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import AdminCitasRegistro from "./AdminCitasRegistro";

export default function AdminCitasView() {
  const t      = useTranslations("Dashboard.admin.citas.toggle");
  const locale = useLocale();

  return (
    <div className="space-y-4">
      {/* Toggle — "Calendario" navigates to the sibling full-bleed route */}
      <div className="inline-flex items-center gap-1 rounded-2xl border border-gray-200 bg-white p-1">
        <button
          type="button"
          disabled
          aria-pressed
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-roboto font-medium transition-colors",
            "bg-secondary text-white shadow-sm",
          )}
        >
          <List className="w-4 h-4" />
          {t("lista")}
        </button>
        <Link
          href={`/${locale}/dashboard/admin/citas-calendario`}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-roboto font-medium transition-colors",
            "text-neutral hover:text-gray-700",
          )}
        >
          <CalendarRange className="w-4 h-4" />
          {t("calendario")}
        </Link>
      </div>

      <AdminCitasRegistro />
    </div>
  );
}
