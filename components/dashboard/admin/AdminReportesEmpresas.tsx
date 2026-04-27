"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
  ResponsiveContainer,
} from "recharts";
import { Download, ChevronUp, ChevronDown } from "lucide-react";
import { exportToCsv, cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmpresaResumen = {
  id:                  string;
  nombre:              string;
  estado:              string;
  auto_confirmar_citas: boolean;
  total_miembros:      number;
  miembros_activos:    number;
  total_citas:         number;
  citas_mes:           number;
  total_documentos:    number;
};

export type EmpresasReportData = {
  total:               number;
  por_estado:          { estado: string; total: number }[];
  resumen_por_empresa: EmpresaResumen[];
};

interface Props { data: EmpresasReportData }

// ── Constants ─────────────────────────────────────────────────────────────────

type SortKey = "total_miembros" | "miembros_activos" | "total_citas" | "citas_mes" | "total_documentos";
const PAGE_SIZE = 15;
const PIE_COLORS = ["#2266A7", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const TICK = { fontSize: 11, fontFamily: "Roboto, sans-serif", fill: "#6b7280" };
const GRID = { stroke: "#f0f0f0" };

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

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronUp className="w-3.5 h-3.5 opacity-20" />;
  return dir === "asc"
    ? <ChevronUp   className="w-3.5 h-3.5 text-secondary" />
    : <ChevronDown className="w-3.5 h-3.5 text-secondary" />;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminReportesEmpresas({ data }: Props) {
  const t = useTranslations("Dashboard.admin.reportes");

  const [sortKey, setSortKey] = useState<SortKey>("total_miembros");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page,    setPage]    = useState(0);

  const autoConfirman = data.resumen_por_empresa.filter((e) => e.auto_confirmar_citas).length;
  const activas       = data.por_estado.find((e) => e.estado === "activa")?.total   ?? 0;
  const inactivas     = data.por_estado.find((e) => e.estado === "inactiva")?.total ?? 0;

  // Sort + paginate
  const sorted = [...data.resumen_por_empresa].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortDir === "asc" ? diff : -diff;
  });
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows   = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(0);
  }

  // Top-10 for bar chart
  const top10 = [...data.resumen_por_empresa]
    .sort((a, b) => b.total_miembros - a.total_miembros)
    .slice(0, 10)
    .map((e) => ({
      nombre:          e.nombre.length > 14 ? `${e.nombre.slice(0, 13)}…` : e.nombre,
      total_miembros:  e.total_miembros,
      total_citas:     e.total_citas,
      total_documentos: e.total_documentos,
    }));

  function handleExport() {
    if (!data.total) return;
    exportToCsv(
      "reporte_empresas.csv",
      data.resumen_por_empresa.map((e) => ({
        empresa:          e.nombre,
        estado:           e.estado,
        auto_confirmar:   e.auto_confirmar_citas ? "si" : "no",
        total_miembros:   e.total_miembros,
        miembros_activos: e.miembros_activos,
        total_citas:      e.total_citas,
        citas_mes:        e.citas_mes,
        total_documentos: e.total_documentos,
      })),
    );
  }

  const colHeaders: { key: SortKey; label: string }[] = [
    { key: "total_miembros",   label: t("tabla_total_miembros") },
    { key: "miembros_activos", label: t("tabla_miembros_activos") },
    { key: "total_citas",      label: t("tabla_total_citas") },
    { key: "citas_mes",        label: t("tabla_citas_mes") },
    { key: "total_documentos", label: t("tabla_documentos") },
  ];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("kpi_total_empresas")} value={data.total} />
        <KpiCard label={t("kpi_activas")}        value={activas} />
        <KpiCard label={t("kpi_inactivas")}      value={inactivas} />
        <KpiCard label={t("kpi_auto_confirman")} value={autoConfirman} />
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <ChartCard title={t("chart_comparativa_empresas")}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={top10} margin={{ top: 0, right: 8, left: -10, bottom: 40 }}>
                <CartesianGrid vertical={false} {...GRID} strokeDasharray="3 3" />
                <XAxis dataKey="nombre" tick={{ ...TICK, fontSize: 10 }} axisLine={false}
                  tickLine={false} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "Roboto, sans-serif", paddingTop: 8 }} />
                <Bar dataKey="total_miembros"   name={t("tabla_total_miembros")}
                  fill="#2266A7"  radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="total_citas"      name={t("tabla_total_citas")}
                  fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="total_documentos" name={t("tabla_documentos")}
                  fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title={t("chart_por_estado")}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data.por_estado} dataKey="total" nameKey="estado"
                cx="50%" cy="45%" outerRadius={80}>
                {data.por_estado.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, fontFamily: "Roboto, sans-serif" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-roboto">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("tabla_empresa")}
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("tabla_estado")}
                </th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("tabla_auto_confirma")}
                </th>
                {colHeaders.map(({ key, label }) => (
                  <th key={key}
                    onClick={() => toggleSort(key)}
                    className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider
                               cursor-pointer select-none hover:text-gray-800 transition-colors">
                    <span className="inline-flex items-center gap-1 justify-end">
                      {label}
                      <SortIcon active={sortKey === key} dir={sortDir} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pageRows.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.nombre}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                      e.estado === "activa"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-500",
                    )}>
                      {e.estado}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-gray-500">
                    {e.auto_confirmar_citas ? "✓" : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{e.total_miembros}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{e.miembros_activos}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{e.total_citas}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{e.citas_mes}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{e.total_documentos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-50">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-roboto rounded-lg border border-gray-200
                         hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ←
            </button>
            <span className="text-xs font-roboto text-neutral/60">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-3 py-1.5 text-xs font-roboto rounded-lg border border-gray-200
                         hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
