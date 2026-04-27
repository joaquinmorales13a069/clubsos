"use client";

/**
 * EmpresaInicio — Company Admin home overview (Step 6.2).
 *
 * All three data fetches (KPIs, citas pendientes, miembros recientes) fire in
 * parallel on mount. Each section shows its own skeleton independently.
 *
 * Sections:
 *   A. KPI Cards row (grid 2×2 → 4×1 on md+)
 *   B. Alert banner when citas_pendientes > 0
 *   C. Quick Actions row (3 pill buttons)
 *   D. Two-column lower: Citas pendientes | Miembros recientes
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import {
  Users,
  CalendarClock,
  CalendarDays,
  CalendarCheck,
  UserCog,
  Settings,
  AlertTriangle,
  UserX,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import EmpresaInicioCitasPendientes, {
  type CitaPendienteRow,
} from "./EmpresaInicioCitasPendientes";
import EmpresaInicioMiembrosRecientes, {
  type MiembroRecienteRow,
} from "./EmpresaInicioMiembrosRecientes";
import EmpresaInicioCitasPorServicio from "./EmpresaInicioCitasPorServicio";

// ── Types ────────────────────────────────────────────────────────────────────

type EmpresaKpis = {
  total_miembros:      number;
  miembros_activos:    number;
  miembros_pendientes: number;
  citas_pendientes:    number;
  citas_mes:           number;
};

interface Props {
  /** First name for greeting */
  firstName: string;
}

// ── KPI Skeleton ─────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
          <div className="w-10 h-10 rounded-xl bg-gray-200 mb-3" />
          <div className="h-7 w-16 bg-gray-200 rounded mb-2" />
          <div className="h-3 w-24 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:      string;
  value:      number | "—";
  icon:       React.ReactNode;
  accent:     string;
  href:       string;
  badge?:     boolean; // renders value as a badge (red pill) when true
}

function KpiCard({ label, value, icon, accent, href, badge }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5
                 hover:shadow-md hover:border-gray-200 transition-all group"
    >
      {/* Icon */}
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", accent)}>
        {icon}
      </div>

      {/* Value */}
      {badge && typeof value === "number" && value > 0 ? (
        <p className="text-2xl font-poppins font-bold text-primary mb-1 flex items-center gap-2">
          {value}
          <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            ●
          </span>
        </p>
      ) : (
        <p className="text-2xl font-poppins font-bold text-gray-900 mb-1">
          {value}
        </p>
      )}

      {/* Label */}
      <p className="text-xs font-roboto text-neutral group-hover:text-gray-700 transition-colors">
        {label}
      </p>
    </Link>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EmpresaInicio({ firstName }: Props) {
  const t      = useTranslations("Dashboard.empresa.inicio");
  const tCitas = useTranslations("Dashboard.empresa.citas");
  const locale = useLocale();

  const base          = `/${locale}/dashboard`;
  const empresaBase   = `${base}/empresa`;
  const citasHref     = `${empresaBase}/citas`;
  const usuariosHref  = `${empresaBase}/usuarios`;
  const ajustesHref   = `${empresaBase}/ajustes`;

  // ── State per section ────────────────────────────────────────────────────
  const [kpis,        setKpis]        = useState<EmpresaKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError,   setKpisError]   = useState(false);

  const [citas,        setCitas]        = useState<CitaPendienteRow[]>([]);
  const [citasLoading, setCitasLoading] = useState(true);
  const [citasError,   setCitasError]   = useState(false);

  const [miembros,        setMiembros]        = useState<MiembroRecienteRow[]>([]);
  const [miembrosLoading, setMiembrosLoading] = useState(true);
  const [miembrosError,   setMiembrosError]   = useState(false);

  // Tracks IDs being processed for approve / reject
  const [aprobandoIds,  setAprobandoIds]  = useState<Set<string>>(new Set());
  const [rechazandoIds, setRechazandoIds] = useState<Set<string>>(new Set());

  // ── Parallel fetches on mount ────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    // 1. KPIs via RPC
    supabase.rpc("get_empresa_kpis").then(({ data, error }) => {
      if (error || !data) {
        setKpisError(true);
      } else {
        setKpis(data as EmpresaKpis);
      }
      setKpisLoading(false);
    });

    // 2. Latest 5 pending citas (RLS citas_empresa_admin_read scopes automatically)
    supabase
      .from("citas")
      .select(`
        id, fecha_hora_cita, para_titular, paciente_nombre, created_at,
        paciente:users!paciente_id(nombre_completo),
        servicio:servicios!citas_ea_service_id_fkey(nombre)
      `)
      .eq("estado_sync", "pendiente")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) {
          setCitasError(true);
        } else {
          setCitas((data ?? []) as unknown as CitaPendienteRow[]);
        }
        setCitasLoading(false);
      });

    // 3. Latest 5 members (RLS users_empresa_admin_read scopes automatically)
    supabase
      .from("users")
      .select("id, nombre_completo, estado, tipo_cuenta, created_at")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) {
          setMiembrosError(true);
        } else {
          setMiembros((data ?? []) as MiembroRecienteRow[]);
        }
        setMiembrosLoading(false);
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
        // Remove from local list and update KPI count
        setCitas((prev) => prev.filter((c) => c.id !== citaId));
        setKpis((prev) =>
          prev ? { ...prev, citas_pendientes: Math.max(0, prev.citas_pendientes - 1) } : prev,
        );
        toast.success(tCitas("aprobada"));
      } else {
        toast.error(tCitas("error_aprobar"));
      }
    } catch {
      toast.error(tCitas("error_aprobar"));
    } finally {
      setAprobandoIds((prev) => {
        const next = new Set(prev);
        next.delete(citaId);
        return next;
      });
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
      setKpis((prev) =>
        prev ? { ...prev, citas_pendientes: Math.max(0, prev.citas_pendientes - 1) } : prev,
      );
      toast.success(tCitas("rechazada"));
    } else {
      toast.error(tCitas("error_rechazar"));
    }

    setRechazandoIds((prev) => {
      const next = new Set(prev);
      next.delete(citaId);
      return next;
    });
  };

  // ── KPI cards config ─────────────────────────────────────────────────────
  const kpiCards: KpiCardProps[] = [
    {
      label:  t("kpi_activos"),
      value:  kpis?.miembros_activos ?? "—",
      icon:   <Users className="w-5 h-5 text-emerald-600" />,
      accent: "bg-emerald-50",
      href:   usuariosHref,
    },
    {
      label:  t("kpi_pendientes"),
      value:  kpis?.miembros_pendientes ?? "—",
      icon:   <UserX className="w-5 h-5 text-amber-600" />,
      accent: "bg-amber-50",
      href:   usuariosHref,
    },
    {
      label:  t("kpi_citasPendientes"),
      value:  kpis?.citas_pendientes ?? "—",
      icon:   <CalendarClock className="w-5 h-5 text-red-500" />,
      accent: "bg-red-50",
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
  ];

  const citasPendientesCount = kpis?.citas_pendientes ?? 0;

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
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiCards.map((card) => (
            <KpiCard key={card.label} {...card} />
          ))}
        </div>
      )}

      {/* A'. Citas por servicio bar chart — full-width, below KPI cards */}
      <EmpresaInicioCitasPorServicio />

      {/* B. Alert banner — only when there are pending citas */}
      {!kpisLoading && !kpisError && citasPendientesCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="flex-1 text-sm font-roboto font-medium text-amber-800">
            {t("alertaCitasPendientes", { count: citasPendientesCount })}
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
        <Link
          href={citasHref}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200
                     bg-white text-sm font-roboto font-medium text-gray-700
                     hover:border-secondary/50 hover:text-secondary hover:shadow-sm transition-all"
        >
          <CalendarCheck className="w-4 h-4" />
          {t("qa_revisarCitas")}
        </Link>
        <Link
          href={usuariosHref}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200
                     bg-white text-sm font-roboto font-medium text-gray-700
                     hover:border-secondary/50 hover:text-secondary hover:shadow-sm transition-all"
        >
          <UserCog className="w-4 h-4" />
          {t("qa_gestionarUsuarios")}
        </Link>
        <Link
          href={ajustesHref}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200
                     bg-white text-sm font-roboto font-medium text-gray-700
                     hover:border-secondary/50 hover:text-secondary hover:shadow-sm transition-all"
        >
          <Settings className="w-4 h-4" />
          {t("qa_ajustesEmpresa")}
        </Link>
      </div>

      {/* D. Two-column lower section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EmpresaInicioCitasPendientes
          loading={citasLoading}
          error={citasError}
          citas={citas}
          aprobandoIds={aprobandoIds}
          rechazandoIds={rechazandoIds}
          onAprobar={handleAprobar}
          onRechazar={handleRechazar}
          verTodasHref={citasHref}
        />

        <EmpresaInicioMiembrosRecientes
          loading={miembrosLoading}
          error={miembrosError}
          miembros={miembros}
          verTodosHref={usuariosHref}
        />
      </div>
    </div>
  );
}
