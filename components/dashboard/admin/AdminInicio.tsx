"use client";

/**
 * AdminInicio — Global Admin home overview (Step 7.2).
 *
 * All three data fetches (KPIs, citas pendientes, empresas recientes) fire in
 * parallel on mount. Each section shows its own skeleton independently.
 *
 * Sections:
 *   A. 6 KPI Cards (grid-cols-2 md:grid-cols-3)
 *   B. Alert banner when citas_pendientes > 0
 *   C. Quick Actions row (4 pill buttons)
 *   D. Two-column lower: Global citas pendientes | Empresas recientes
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import {
  Building2,
  Users,
  CalendarClock,
  CalendarDays,
  FileText,
  Gift,
  CalendarCheck,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import AdminInicioCitasPendientes, {
  type AdminCitaPendienteRow,
} from "./AdminInicioCitasPendientes";
import AdminInicioEmpresasRecientes, {
  type EmpresaRecienteRow,
} from "./AdminInicioEmpresasRecientes";
import dynamic from "next/dynamic";

const AdminInicioCitasPorServicio = dynamic(
  () => import("./AdminInicioCitasPorServicio"),
  { ssr: false, loading: () => <div className="h-[180px] bg-gray-100 rounded-2xl animate-pulse" /> }
);

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminKpis = {
  total_empresas:     number;
  empresas_activas:   number;
  total_usuarios:     number;
  usuarios_activos:   number;
  citas_pendientes:   number;
  citas_mes:          number;
  docs_total:         number;
  beneficios_activos: number;
};

interface Props {
  firstName: string;
}

// ── KPI Skeleton ──────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
          <div className="w-10 h-10 rounded-xl bg-gray-200 mb-3" />
          <div className="h-7 w-16 bg-gray-200 rounded mb-2" />
          <div className="h-3 w-24 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:  string;
  value:  string | number | "—";
  icon:   React.ReactNode;
  accent: string;
  href:   string;
  badge?: boolean;
}

function KpiCard({ label, value, icon, accent, href, badge }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5
                 hover:shadow-md hover:border-gray-200 transition-all group"
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", accent)}>
        {icon}
      </div>

      {badge && typeof value === "number" && value > 0 ? (
        <p className="text-2xl font-poppins font-bold text-primary mb-1 flex items-center gap-2">
          {value}
          <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">●</span>
        </p>
      ) : (
        <p className="text-2xl font-poppins font-bold text-gray-900 mb-1">{value}</p>
      )}

      <p className="text-xs font-roboto text-neutral group-hover:text-gray-700 transition-colors">
        {label}
      </p>
    </Link>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminInicio({ firstName }: Props) {
  const t      = useTranslations("Dashboard.admin.inicio");
  const tCitas = useTranslations("Dashboard.empresa.citas");
  const locale = useLocale();

  const base         = `/${locale}/dashboard`;
  const adminBase    = `${base}/admin`;
  const citasHref    = `${adminBase}/citas`;
  const usuariosHref = `${adminBase}/usuarios`;
  const empresasHref = `${adminBase}/empresas`;
  const docsHref     = `${adminBase}/documentos`;

  // ── State per section ────────────────────────────────────────────────────
  const [kpis,        setKpis]        = useState<AdminKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError,   setKpisError]   = useState(false);

  const [citas,        setCitas]        = useState<AdminCitaPendienteRow[]>([]);
  const [citasLoading, setCitasLoading] = useState(true);
  const [citasError,   setCitasError]   = useState(false);

  const [empresas,        setEmpresas]        = useState<EmpresaRecienteRow[]>([]);
  const [empresasLoading, setEmpresasLoading] = useState(true);
  const [empresasError,   setEmpresasError]   = useState(false);

  const [aprobandoIds,  setAprobandoIds]  = useState<Set<string>>(new Set());
  const [rechazandoIds, setRechazandoIds] = useState<Set<string>>(new Set());

  // ── Parallel fetches on mount ────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    // 1. Global KPIs via RPC
    supabase.rpc("get_admin_kpis").then(({ data, error }) => {
      if (error || !data) setKpisError(true);
      else setKpis(data as AdminKpis);
      setKpisLoading(false);
    });

    // 2. Latest 5 pending citas — global (citas_admin_all RLS, no empresa filter)
    supabase
      .from("citas")
      .select(`
        id, fecha_hora_cita, para_titular, created_at,
        paciente:users!paciente_id(nombre_completo),
        servicio:servicios!citas_ea_service_id_fkey(nombre),
        empresa:empresas!empresa_id(nombre)
      `)
      .in("estado_sync", ["pendiente", "pendiente_empresa", "pendiente_pago", "pendiente_admin"])
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) setCitasError(true);
        else setCitas((data ?? []) as unknown as AdminCitaPendienteRow[]);
        setCitasLoading(false);
      });

    // 3. Latest 5 empresas
    supabase
      .from("empresas")
      .select("id, nombre, estado, created_at")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) setEmpresasError(true);
        else setEmpresas((data ?? []) as EmpresaRecienteRow[]);
        setEmpresasLoading(false);
      });
  }, []);

  // ── Approve action ───────────────────────────────────────────────────────
  const handleAprobar = async (citaId: string) => {
    setAprobandoIds((prev) => new Set(prev).add(citaId));
    try {
      const res = await fetch("/api/ea/citas/aprobar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citaId }),
      });
      if (res.ok) {
        setCitas((prev) => prev.filter((c) => c.id !== citaId));
        setKpis((prev) => prev ? { ...prev, citas_pendientes: Math.max(0, prev.citas_pendientes - 1) } : prev);
        toast.success(tCitas("aprobada"));
      } else {
        toast.error(tCitas("error_aprobar"));
      }
    } catch {
      toast.error(tCitas("error_aprobar"));
    } finally {
      setAprobandoIds((prev) => { const n = new Set(prev); n.delete(citaId); return n; });
    }
  };

  // ── Reject action ────────────────────────────────────────────────────────
  const handleRechazar = async (citaId: string) => {
    setRechazandoIds((prev) => new Set(prev).add(citaId));
    const supabase = createClient();
    const { error } = await supabase
      .from("citas")
      .update({ estado_sync: "rechazado" })
      .eq("id", citaId);
    if (!error) {
      setCitas((prev) => prev.filter((c) => c.id !== citaId));
      setKpis((prev) => prev ? { ...prev, citas_pendientes: Math.max(0, prev.citas_pendientes - 1) } : prev);
      toast.success(tCitas("rechazada"));
    } else {
      toast.error(tCitas("error_rechazar"));
    }
    setRechazandoIds((prev) => { const n = new Set(prev); n.delete(citaId); return n; });
  };

  const citasPendientes = kpis?.citas_pendientes ?? 0;

  // ── KPI cards config ─────────────────────────────────────────────────────
  const kpiCards: KpiCardProps[] = [
    {
      label:  t("kpi_empresasActivas"),
      value:  kpis ? `${kpis.empresas_activas} / ${kpis.total_empresas}` : "—",
      icon:   <Building2 className="w-5 h-5 text-secondary" />,
      accent: "bg-secondary/10",
      href:   empresasHref,
    },
    {
      label:  t("kpi_usuariosActivos"),
      value:  kpis ? `${kpis.usuarios_activos} / ${kpis.total_usuarios}` : "—",
      icon:   <Users className="w-5 h-5 text-emerald-600" />,
      accent: "bg-emerald-50",
      href:   usuariosHref,
    },
    {
      label:  t("kpi_citasPendientes"),
      value:  kpis?.citas_pendientes ?? "—",
      icon:   <CalendarClock className="w-5 h-5 text-amber-600" />,
      accent: "bg-amber-50",
      href:   citasHref,
      badge:  true,
    },
    {
      label:  t("kpi_citasMes"),
      value:  kpis?.citas_mes ?? "—",
      icon:   <CalendarDays className="w-5 h-5 text-secondary" />,
      accent: "bg-secondary/10",
      href:   citasHref,
    },
    {
      label:  t("kpi_documentos"),
      value:  kpis?.docs_total ?? "—",
      icon:   <FileText className="w-5 h-5 text-purple-600" />,
      accent: "bg-purple-50",
      href:   docsHref,
    },
    {
      label:  t("kpi_beneficios"),
      value:  kpis?.beneficios_activos ?? "—",
      icon:   <Gift className="w-5 h-5 text-rose-500" />,
      accent: "bg-rose-50",
      href:   `${base}/beneficios`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-poppins font-bold text-gray-900">
          {t("greeting")}{" "}
          <span className="text-primary">{firstName}</span>
        </h1>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("greetingSub")}</p>
      </div>

      {/* A. KPI Cards */}
      {kpisLoading ? (
        <KpiSkeleton />
      ) : kpisError ? (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4">
          <p className="text-sm font-roboto text-red-600">{t("errorKpis")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {kpiCards.map((card) => (
            <KpiCard key={card.label} {...card} />
          ))}
        </div>
      )}

      {/* A'. Global citas por servicio bar chart */}
      <AdminInicioCitasPorServicio />

      {/* B. Alert banner — only when there are pending citas */}
      {!kpisLoading && !kpisError && citasPendientes > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="flex-1 text-sm font-roboto font-medium text-amber-800">
            {t("alertaCitasPendientes", { count: citasPendientes })}
          </p>
          <Link
            href={citasHref}
            className="shrink-0 text-xs font-semibold font-roboto text-amber-700
                       border border-amber-300 rounded-lg px-3 py-1.5
                       hover:bg-amber-100 transition-colors"
          >
            {t("revisarAhora")}
          </Link>
        </div>
      )}

      {/* C. Quick Actions */}
      <div className="flex flex-wrap gap-3">
        {([
          { href: citasHref,    Icon: CalendarCheck, label: t("qa_revisarCitas") },
          { href: usuariosHref, Icon: Users,         label: t("qa_usuarios") },
          { href: empresasHref, Icon: Building2,     label: t("qa_empresas") },
          { href: docsHref,     Icon: FileText,      label: t("qa_documentos") },
        ] as const).map(({ href, Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200
                       bg-white text-sm font-roboto font-medium text-gray-700
                       hover:border-secondary/50 hover:text-secondary hover:shadow-sm transition-all"
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </div>

      {/* D. Two-column lower section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdminInicioCitasPendientes
          loading={citasLoading}
          error={citasError}
          citas={citas}
          aprobandoIds={aprobandoIds}
          rechazandoIds={rechazandoIds}
          onAprobar={handleAprobar}
          onRechazar={handleRechazar}
          verTodasHref={citasHref}
        />

        <AdminInicioEmpresasRecientes
          loading={empresasLoading}
          error={empresasError}
          empresas={empresas}
          verTodasHref={empresasHref}
        />
      </div>
    </div>
  );
}
