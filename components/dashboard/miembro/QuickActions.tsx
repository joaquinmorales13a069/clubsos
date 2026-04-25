/**
 * QuickActions — Four shortcut buttons below the credential card.
 * Server Component — renders locale-aware links, no JS needed.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CalendarDays, Gift, FileText, SlidersHorizontal } from "lucide-react";

interface QuickActionsProps {
  locale: string;
}

export default async function QuickActions({ locale }: QuickActionsProps) {
  const t = await getTranslations("Dashboard.miembro.inicio.quickActions");
  const base = `/${locale}/dashboard`;

  const actions = [
    {
      href: `${base}/citas`,
      label: t("schedule"),
      icon: CalendarDays,
      iconCls: "bg-primary/10 text-primary",
    },
    {
      href: `${base}/beneficios`,
      label: t("benefits"),
      icon: Gift,
      iconCls: "bg-secondary/10 text-secondary",
    },
    {
      href: `${base}/documentos`,
      label: t("documents"),
      icon: FileText,
      iconCls: "bg-emerald-500/10 text-emerald-600",
    },
    {
      href: `${base}/ajustes`,
      label: t("settings"),
      icon: SlidersHorizontal,
      iconCls: "bg-amber-500/10 text-amber-600",
    },
  ] as const;

  return (
    <div className="grid grid-cols-4 gap-3">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className={[
            "flex flex-col items-center gap-2 p-3 rounded-xl text-center",
            "bg-white border border-gray-100 shadow-sm",
            "hover:shadow-md hover:-translate-y-0.5 transition-all duration-200",
          ].join(" ")}
        >
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${action.iconCls}`}>
            <action.icon className="w-5 h-5" />
          </div>
          <span className="text-xs font-roboto font-medium text-gray-700 leading-tight">
            {action.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
