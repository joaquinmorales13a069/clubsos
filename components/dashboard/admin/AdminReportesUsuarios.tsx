"use client";

import { useTranslations } from "next-intl";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar,
  ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";
import { exportToCsv } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UsuariosReportData = {
  total:           number;
  por_estado:      { estado: string;      total: number }[];
  por_tipo_cuenta: { tipo_cuenta: string; total: number }[];
  por_sexo:        { sexo: string;        total: number }[];
  por_mes:         { mes: string;         total: number }[];
  por_empresa:     { empresa: string;     total: number }[];
};

interface Props {
  data:          UsuariosReportData;
  empresaActiva: boolean;
}

// ── Colours ───────────────────────────────────────────────────────────────────

const PIE_COLORS  = ["#2266A7", "#CD2129", "#f59e0b", "#10b981", "#8b5cf6", "#6b7280"];
const TICK        = { fontSize: 11, fontFamily: "Roboto, sans-serif", fill: "#6b7280" };
const GRID        = { stroke: "#f0f0f0" };

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

export default function AdminReportesUsuarios({ data, empresaActiva }: Props) {
  const t = useTranslations("Dashboard.admin.reportes");

  const activos   = data.por_estado.find((e) => e.estado === "activo")?.total   ?? 0;
  const inactivos = data.por_estado.find((e) => e.estado === "inactivo")?.total ?? 0;
  const pendientes = data.por_estado.find((e) => e.estado === "pendiente")?.total ?? 0;

  function handleExport() {
    if (!data.total) return;
    const rows: Record<string, unknown>[] = empresaActiva
      ? data.por_estado.map((r) => ({ tipo: "por_estado", clave: r.estado,   total: r.total }))
      : data.por_empresa.map((r) => ({ tipo: "por_empresa", empresa: r.empresa, total: r.total }));
    exportToCsv("reporte_usuarios.csv", rows);
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("kpi_total")}      value={data.total} />
        <KpiCard label={t("kpi_activos")}    value={activos} />
        <KpiCard label={t("kpi_inactivos")}  value={inactivos} />
        <KpiCard label={t("kpi_pendientes")} value={pendientes} />
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

      {/* Area chart — registros por mes */}
      <ChartCard title={t("chart_registros_por_mes")}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data.por_mes} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradUsuarios" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#2266A7" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#2266A7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} {...GRID} strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={TICK} axisLine={false} tickLine={false}
              tickFormatter={(v: string) => v.slice(0, 7)} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="total" stroke="#2266A7" strokeWidth={2}
              fill="url(#gradUsuarios)" dot={{ r: 3, fill: "#2266A7" }} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Pie charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <ChartCard title={t("chart_por_estado")}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.por_estado} dataKey="total" nameKey="estado"
                cx="50%" cy="50%" outerRadius={70}>
                {data.por_estado.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, fontFamily: "Roboto, sans-serif" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("chart_por_tipo_cuenta")}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.por_tipo_cuenta} dataKey="total" nameKey="tipo_cuenta"
                cx="50%" cy="50%" outerRadius={70}>
                {data.por_tipo_cuenta.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, fontFamily: "Roboto, sans-serif" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("chart_por_sexo")}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.por_sexo} dataKey="total" nameKey="sexo"
                cx="50%" cy="50%" outerRadius={70}>
                {data.por_sexo.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, fontFamily: "Roboto, sans-serif" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Por empresa bar (hidden when empresa filter active) */}
      {!empresaActiva && data.por_empresa.length > 0 && (
        <ChartCard title={t("chart_usuarios_por_empresa")}>
          <ResponsiveContainer width="100%" height={Math.max(160, data.por_empresa.length * 36)}>
            <BarChart data={data.por_empresa} layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} {...GRID} strokeDasharray="3 3" />
              <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="empresa" width={140} tick={TICK}
                axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 18 ? `${v.slice(0, 17)}…` : v} />
              <Tooltip />
              <Bar dataKey="total" fill="#2266A7" radius={[0, 4, 4, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
