"use client";

/**
 * AdminInicioCitasPendientes — latest 5 global pending citas for admin home.
 * Same design as EmpresaInicioCitasPendientes but adds empresa.nombre per row.
 */

import { useTranslations } from "next-intl";
import {
  CalendarClock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNiShort(isoStr: string): string {
  const dt   = new Date(isoStr);
  const tz   = "America/Managua";
  const date = dt.toLocaleDateString("es-NI", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });
  const time = dt.toLocaleTimeString("es-NI", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} · ${time}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminCitaPendienteRow = {
  id:              string;
  fecha_hora_cita: string;
  para_titular:    boolean;
  created_at:      string;
  paciente:        { nombre_completo: string | null } | null;
  servicio:        { nombre: string } | null;
  empresa:         { nombre: string } | null;
};

interface Props {
  loading:       boolean;
  error:         boolean;
  citas:         AdminCitaPendienteRow[];
  aprobandoIds:  Set<string>;
  rechazandoIds: Set<string>;
  onAprobar:     (citaId: string) => void;
  onRechazar:    (citaId: string) => void;
  verTodasHref:  string;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CitasSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-3/5" />
            <div className="h-3 bg-gray-200 rounded w-2/5" />
          </div>
          <div className="h-7 w-20 bg-gray-200 rounded-lg" />
          <div className="h-7 w-20 bg-gray-200 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminInicioCitasPendientes({
  loading,
  error,
  citas,
  aprobandoIds,
  rechazandoIds,
  onAprobar,
  onRechazar,
  verTodasHref,
}: Props) {
  const t = useTranslations("Dashboard.admin.inicio");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-secondary" />
          <h3 className="text-sm font-poppins font-semibold text-gray-900">
            {t("citasPendientes_titulo")}
          </h3>
        </div>
        <Link
          href={verTodasHref}
          className="text-xs font-roboto font-medium text-secondary hover:text-secondary/80 transition-colors"
        >
          {t("citasPendientes_verTodas")} →
        </Link>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <CitasSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center text-center py-8 space-y-2">
            <AlertCircle className="w-8 h-8 text-gray-300" />
            <p className="text-sm font-roboto text-neutral">{t("errorCitas")}</p>
          </div>
        ) : citas.length === 0 ? (
          <div className="flex flex-col items-center text-center py-8 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-200" />
            <p className="text-sm font-roboto text-neutral">{t("citasPendientes_empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {citas.map((cita) => {
              const nombre      = cita.paciente?.nombre_completo ?? "—";
              const empresa     = cita.empresa?.nombre ?? "—";
              const servicio    = cita.servicio?.nombre ?? "—";
              const fecha       = formatNiShort(cita.fecha_hora_cita);
              const isAprobando  = aprobandoIds.has(cita.id);
              const isRechazando = rechazandoIds.has(cita.id);
              const isBusy       = isAprobando || isRechazando;

              return (
                <li key={cita.id} className="flex items-start gap-3 py-3">
                  {/* Avatar */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center mt-0.5">
                    <span className="text-xs font-poppins font-bold text-amber-600">
                      {nombre.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-poppins font-semibold text-gray-900 truncate">
                      {nombre}
                    </p>
                    <p className="text-xs font-roboto text-neutral truncate">
                      {servicio} · {fecha}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Empresa chip */}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary/10 text-secondary">
                        {empresa}
                      </span>
                      {/* para_titular badge */}
                      <span className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        cita.para_titular
                          ? "bg-gray-100 text-gray-600"
                          : "bg-purple-100 text-purple-700",
                      )}>
                        {cita.para_titular ? t("citasPendientes_titular") : t("citasPendientes_tercero")}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAprobar(cita.id)}
                      disabled={isBusy}
                      title={t("citasPendientes_aprobar")}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold font-roboto
                                 bg-emerald-50 text-emerald-700 border border-emerald-200
                                 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                    >
                      {isAprobando
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{t("citasPendientes_aprobar")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onRechazar(cita.id)}
                      disabled={isBusy}
                      title={t("citasPendientes_rechazar")}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold font-roboto
                                 bg-white text-red-500 border border-red-200
                                 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {isRechazando
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <XCircle className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{t("citasPendientes_rechazar")}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
