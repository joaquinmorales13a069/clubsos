"use client";

import { useTranslations } from "next-intl";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
  ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";
import { exportToCsv } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocumentosReportData = {
  total:    number;
  por_tipo: { tipo: string; total: number }[];
  por_mes:  { mes: string;  total: number }[];
};

interface Props { data: DocumentosReportData }

// ── Colours ───────────────────────────────────────────────────────────────────

const PIE_COLORS = ["#2266A7", "#CD2129", "#f59e0b", "#10b981", "#8b5cf6", "#6b7280"];
const TICK       = { fontSize: 11, fontFamily: "Roboto, sans-serif", fill: "#6b7280" };
const GRID       = { stroke: "#f0f0f0" };

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
      <p className="text-xs font-roboto text-neutral/60 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-poppins font-bold text-gray-900">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="font-poppins font-semibold text-sm text-gray-800 mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminReportesDocumentos({ data }: Props) {
  const t = useTranslations("Dashboard.admin.reportes");

  const tipoFrecuente    = data.por_tipo[0]?.tipo ?? "—";
  const promedioMensual  = data.por_mes.length > 0
    ? Math.round(data.total / data.por_mes.length)
    : 0;

  function handleExport() {
    if (!data.total) return;
    const rows: Record<string, unknown>[] = [
      ...data.por_tipo.map((r) => ({ tipo: "por_tipo", clave: r.tipo,   total: r.total })),
      ...data.por_mes.map((r)  => ({ tipo: "por_mes",  clave: r.mes,    total: r.total })),
    ];
    exportToCsv("reporte_documentos.csv", rows);
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label={t("kpi_total")}           value={data.total} />
        <KpiCard label={t("kpi_tipo_frecuente")}  value={tipoFrecuente} />
        <KpiCard label={t("kpi_promedio_mensual")} value={promedioMensual} />
      </div>

      {/* Export */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          disabled={!data.total}
          className="flex items-center gap-2 px-4 py-2 text-sm font-roboto font-medium
                     bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          {t("exportar_csv")}
        </button>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title={t("chart_docs_por_tipo")}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data.por_tipo} dataKey="total" nameKey="tipo"
                cx="50%" cy="50%" outerRadius={85}
                label={({ name, percent }) => `${name} ${Math.round((percent as number) * 100)}%`}>
                {data.por_tipo.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, fontFamily: "Roboto, sans-serif" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("chart_docs_por_mes")}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.por_mes} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} {...GRID} strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={TICK} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.slice(0, 7)} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#CD2129" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
