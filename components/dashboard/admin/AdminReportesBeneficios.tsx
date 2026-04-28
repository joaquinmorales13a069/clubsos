"use client";

import { useTranslations } from "next-intl";
import {
  PieChart, Pie, Cell, Legend, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";
import { exportToCsv } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BeneficiosReportData = {
  total:      number;
  por_estado: { estado: string; total: number }[];
  por_tipo:   { tipo: string;   total: number }[];
  alcance:    { globales: number; por_empresa: number };
};

interface Props { data: BeneficiosReportData }

// ── Colours ───────────────────────────────────────────────────────────────────

const PIE_COLORS = ["#2266A7", "#CD2129", "#f59e0b", "#10b981", "#8b5cf6", "#6b7280"];

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

export default function AdminReportesBeneficios({ data }: Props) {
  const t = useTranslations("Dashboard.admin.reportes");

  const activos   = data.por_estado.find((e) => e.estado === "activo")?.total   ?? 0;
  const expirados = data.por_estado.find((e) => e.estado !== "activo")?.total   ?? 0;
  const globales  = data.alcance.globales;

  // Alcance as pie data
  const alcanceData = [
    { nombre: "Globales",    total: data.alcance.globales },
    { nombre: "Por empresa", total: data.alcance.por_empresa },
  ];

  function handleExport() {
    if (!data.total) return;
    const rows: Record<string, unknown>[] = [
      ...data.por_estado.map((r) => ({ categoria: "estado", clave: r.estado, total: r.total })),
      ...data.por_tipo.map((r)   => ({ categoria: "tipo",   clave: r.tipo,   total: r.total })),
      { categoria: "alcance", clave: "globales",    total: data.alcance.globales },
      { categoria: "alcance", clave: "por_empresa", total: data.alcance.por_empresa },
    ];
    exportToCsv("reporte_beneficios.csv", rows);
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("kpi_total")}      value={data.total} />
        <KpiCard label={t("kpi_activos")}    value={activos} />
        <KpiCard label={t("kpi_inactivos")}  value={expirados} />
        <KpiCard label={t("kpi_globales")}   value={globales} />
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

      {/* Pie charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <ChartCard title={t("chart_por_estado")}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.por_estado} dataKey="total" nameKey="estado"
                cx="50%" cy="50%" outerRadius={75}>
                {data.por_estado.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, fontFamily: "Roboto, sans-serif" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("chart_por_tipo")}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.por_tipo} dataKey="total" nameKey="tipo"
                cx="50%" cy="50%" outerRadius={75}>
                {data.por_tipo.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, fontFamily: "Roboto, sans-serif" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("chart_alcance")}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={alcanceData} dataKey="total" nameKey="nombre"
                cx="50%" cy="50%" outerRadius={75}>
                {alcanceData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, fontFamily: "Roboto, sans-serif" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
