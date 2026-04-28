"use client";

import { useTranslations } from "next-intl";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";
import { exportToCsv } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CitasReportData = {
  total:        number;
  por_estado:   { estado: string; total: number }[];
  por_mes:      { mes: string;    total: number }[];
  por_servicio: { servicio: string; total: number }[];
  por_doctor:   { doctor: string;  total: number }[];
};

interface Props { data: CitasReportData }

// ── Colour helpers ─────────────────────────────────────────────────────────────

const ESTADO_COLORS: Record<string, string> = {
  confirmado: "#2266A7",
  pendiente:  "#f59e0b",
  cancelado:  "#ef4444",
  rechazado:  "#9ca3af",
};

function estadoColor(estado: string): string {
  return ESTADO_COLORS[estado.toLowerCase()] ?? "#6b7280";
}

const TICK = { fontSize: 11, fontFamily: "Roboto, sans-serif", fill: "#6b7280" };
const GRID = { stroke: "#f0f0f0" };

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
      <p className="text-xs font-roboto text-neutral/60 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-poppins font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs font-roboto text-neutral/50 mt-0.5">{sub}</p>}
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

export default function AdminReportesCitas({ data }: Props) {
  const t = useTranslations("Dashboard.admin.reportes");

  const confirmadas = data.por_estado.find((e) => e.estado === "confirmado")?.total ?? 0;
  const canceladas  = data.por_estado.find((e) => e.estado === "cancelado")?.total  ?? 0;
  const tasa        = data.total > 0 ? Math.round((confirmadas / data.total) * 100) : 0;

  function handleExport() {
    if (!data.total) return;
    const rows: Record<string, unknown>[] = [
      ...data.por_mes.map((r) => ({ tipo: "por_mes",    clave: r.mes,      total: r.total })),
      ...data.por_estado.map((r) => ({ tipo: "por_estado", clave: r.estado,   total: r.total })),
    ];
    exportToCsv("reporte_citas.csv", rows);
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("kpi_total")}           value={data.total} />
        <KpiCard label={t("kpi_confirmadas")}      value={confirmadas} />
        <KpiCard label={t("kpi_canceladas")}       value={canceladas} />
        <KpiCard label={t("kpi_tasa_aprobacion")}  value={`${tasa}%`} />
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

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title={t("chart_citas_por_mes")}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.por_mes} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} {...GRID} strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={TICK} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.slice(0, 7)} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#2266A7" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("chart_por_estado")}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.por_estado} dataKey="total" nameKey="estado"
                cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) =>
                  `${name} ${Math.round((percent as number) * 100)}%`}>
                {data.por_estado.map((entry, i) => (
                  <Cell key={i} fill={estadoColor(entry.estado)} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title={t("chart_por_servicio")}>
          <ResponsiveContainer width="100%" height={Math.max(160, data.por_servicio.length * 36)}>
            <BarChart data={data.por_servicio} layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} {...GRID} strokeDasharray="3 3" />
              <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="servicio" width={140} tick={TICK}
                axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 18 ? `${v.slice(0, 17)}…` : v} />
              <Tooltip />
              <Bar dataKey="total" fill="#CD2129" radius={[0, 4, 4, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("chart_por_doctor")}>
          <ResponsiveContainer width="100%" height={Math.max(160, data.por_doctor.length * 36)}>
            <BarChart data={data.por_doctor} layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} {...GRID} strokeDasharray="3 3" />
              <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="doctor" width={140} tick={TICK}
                axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 18 ? `${v.slice(0, 17)}…` : v} />
              <Tooltip />
              <Bar dataKey="total" fill="#2266A7" radius={[0, 4, 4, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
