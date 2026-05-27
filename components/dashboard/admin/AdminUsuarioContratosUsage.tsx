"use client";

/**
 * AdminUsuarioContratosUsage — per-user contract usage panel rendered inside
 * the "Uso de citas" tab of EditarUsuarioAdminModal. Backed by RPC
 * get_miembro_contrato_usage via /api/admin/usuarios/[id]/contratos-usage.
 */

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateShortNI, type Loc } from "@/lib/datetime";
import { toast } from "sonner";
import { Loader2, FileText } from "lucide-react";

interface UsageRow {
  cs_id:             string;
  contrato_nombre:   string;
  servicio_nombre:   string;
  cuota_por_titular: number;
  used:              number;
  remaining:         number;
  period_start:      string;
}

interface Props {
  userId: string;
}

function barColor(used: number, total: number): string {
  if (total <= 0) return "bg-gray-200";
  const pct = used / total;
  if (pct >= 1)   return "bg-red-500";
  if (pct >= 0.7) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function AdminUsuarioContratosUsage({ userId }: Props) {
  const t      = useTranslations("Dashboard.admin.usuarios.contratosUsage");
  const locale = useLocale() as Loc;
  const [items,   setItems]   = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/usuarios/${userId}/contratos-usage`,
          { cache: "no-store" },
        );
        const j = await res.json() as { usage?: UsageRow[]; error?: string };
        if (!res.ok) throw new Error(j.error ?? "load_failed");
        if (!cancelled) setItems(j.usage ?? []);
      } catch {
        if (!cancelled) {
          setItems([]);
          toast.error(t("errorCargar"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-500 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-10 space-y-2">
        <FileText className="w-10 h-10 text-gray-200" aria-hidden="true" />
        <p className="text-sm font-roboto text-gray-400">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((row) => {
        const totalLabel = `${row.used} / ${row.cuota_por_titular}`;
        const pct = row.cuota_por_titular > 0
          ? Math.min(100, Math.round((row.used / row.cuota_por_titular) * 100))
          : 0;
        const periodFmt = formatDateShortNI(row.period_start, locale);
        return (
          <div
            key={row.cs_id}
            className="rounded-xl border border-gray-100 bg-white p-4 space-y-2"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-poppins font-semibold text-gray-900 truncate">
                  {row.servicio_nombre}
                </p>
                <p className="text-xs font-roboto text-neutral truncate">
                  {row.contrato_nombre}
                </p>
              </div>
              <p className="text-sm font-roboto font-semibold text-gray-700 shrink-0">
                {totalLabel}
              </p>
            </div>

            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full ${barColor(row.used, row.cuota_por_titular)} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-roboto text-gray-400">
              <span>{t("remainingLabel", { count: row.remaining })}</span>
              <span>{t("periodLabel", { date: periodFmt })}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
