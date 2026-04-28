"use client";

/**
 * AdminInicioCitasPorServicio — Full-width bar chart for admin home (Step 7.2).
 *
 * Shows global count of citas per service for the selected month.
 * No empresa filter — citas_admin_all RLS gives access to all rows.
 *
 * Mirrors EmpresaInicioCitasPorServicio; only differences are:
 *   - No empresa scoping in the query
 *   - i18n reads from Dashboard.admin.inicio.graficoCitas
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChevronLeft, ChevronRight, BarChart2, AlertCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChartRow = {
  servicio: string;
  total:    number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMonth(year: number, month: number): string {
  return new Date(year, month, 1)
    .toLocaleString("es-NI", { month: "long", year: "numeric" })
    .replace(/^(.)/, (c) => c.toUpperCase());
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  labelCitas,
}: {
  active?:    boolean;
  payload?:   { value: number }[];
  labelCitas: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-md rounded-xl px-3 py-2 text-sm font-roboto">
      <span className="font-semibold text-secondary">{payload[0].value}</span>
      <span className="text-neutral ml-1">{labelCitas}</span>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ChartSkeleton() {
  const bars = [70, 90, 45, 100, 60, 80, 55];
  return (
    <div className="space-y-3 px-2 py-1">
      {bars.map((w, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-24 h-3 bg-gray-200 rounded shrink-0" />
          <div className="h-7 bg-gray-200 rounded-md" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminInicioCitasPorServicio() {
  const t = useTranslations("Dashboard.admin.inicio.graficoCitas");

  // ── Month selector ───────────────────────────────────────────────────────
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const isCurrentMonth =
    year  === now.getFullYear() &&
    month === now.getMonth();

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else             { setMonth((m) => m - 1); }
  }

  function nextMonth() {
    if (isCurrentMonth) return;
    if (month === 11)   { setMonth(0);  setYear((y) => y + 1); }
    else                { setMonth((m) => m + 1); }
  }

  // ── Chart data ───────────────────────────────────────────────────────────
  const [data,    setData]    = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);

    const supabase = createClient();
    const start    = new Date(year, month, 1).toISOString();
    const end      = new Date(year, month + 1, 1).toISOString();

    // Global query — no empresa filter; citas_admin_all RLS allows full access
    supabase
      .from("citas")
      .select("servicio:servicios!citas_ea_service_id_fkey(nombre)")
      .gte("fecha_hora_cita", start)
      .lt("fecha_hora_cita", end)
      .then(({ data: rows, error: err }) => {
        if (err || !rows) {
          setError(true);
          setLoading(false);
          return;
        }

        // Aggregate client-side: count by service name
        const counts: Record<string, number> = {};
        for (const row of rows) {
          const svc  = row.servicio as unknown as { nombre: string } | null;
          const name = svc?.nombre ?? t("sinServicio");
          counts[name] = (counts[name] ?? 0) + 1;
        }

        const chartRows: ChartRow[] = Object.entries(counts)
          .map(([servicio, total]) => ({ servicio, total }))
          .sort((a, b) => b.total - a.total);

        setData(chartRows);
        setLoading(false);
      });
  }, [year, month, t]);

  const chartHeight = Math.max(180, data.length * 44);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-secondary/5">
            <BarChart2 className="w-4 h-4 text-secondary" />
          </div>
          <div>
            <h3 className="font-poppins font-semibold text-sm text-gray-900">
              {t("titulo")}
            </h3>
            <p className="text-xs font-roboto text-neutral/60 mt-0.5">
              {t("subtitle")}
            </p>
          </div>
        </div>

        {/* Month selector */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500
                       hover:bg-gray-50 hover:border-gray-300 transition-colors"
            aria-label={t("mesPrevio")}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="min-w-[120px] text-center text-xs font-semibold font-roboto text-gray-700 px-1">
            {formatMonth(year, month)}
          </span>

          <button
            type="button"
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className={cn(
              "p-1.5 rounded-lg border border-gray-200 text-gray-500 transition-colors",
              isCurrentMonth
                ? "opacity-30 cursor-not-allowed"
                : "hover:bg-gray-50 hover:border-gray-300",
            )}
            aria-label={t("mesSiguiente")}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chart body */}
      <div className="px-5 py-5">
        {loading ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
            <AlertCircle className="w-8 h-8 text-gray-200" />
            <p className="text-sm font-roboto text-neutral/60">{t("errorCargar")}</p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
            <BarChart2 className="w-10 h-10 text-gray-200" />
            <p className="text-sm font-poppins font-semibold text-gray-400">{t("empty")}</p>
            <p className="text-xs font-roboto text-neutral/50">{t("emptySub")}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
              barCategoryGap="28%"
            >
              <CartesianGrid horizontal={false} stroke="#f0f0f0" strokeDasharray="3 3" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fontFamily: "Roboto, sans-serif", fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="servicio"
                width={148}
                tick={{ fontSize: 11, fontFamily: "Roboto, sans-serif", fill: "#4b5563" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => v.length > 20 ? `${v.slice(0, 19)}…` : v}
              />
              <Tooltip
                cursor={{ fill: "#f3f4f6" }}
                content={<CustomTooltip labelCitas={t("labelCitas")} />}
              />
              <Bar dataKey="total" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {data.map((_, index) => (
                  <Cell
                    key={index}
                    fill={index === 0 ? "#2266A7" : `hsl(${210 + index * 15}, 55%, ${55 + index * 3}%)`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
