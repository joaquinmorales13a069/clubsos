"use client";

/**
 * EmpresaCitasRegistro — Appointment registry for empresa admin (Step 6.3).
 *
 * - Fetches all empresa citas on mount (RLS citas_empresa_admin_read scopes automatically).
 * - Filter chips with live counts per estado.
 * - Client-side search on paciente name, servicio, doctor.
 * - Client-side pagination (20 per page).
 * - Row click → DetalleModal (Sheet panel).
 * - Approve: POST /api/ea/citas/aprobar | Reject: direct Supabase JS.
 */

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
/** Formats UTC ISO timestamp in Nicaragua time. Correct in any browser/server timezone. */
const NI_TZ = "America/Managua";
function formatNiShort(isoStr: string): string {
  const dt   = new Date(isoStr);
  const date = dt.toLocaleDateString("es-NI", { timeZone: NI_TZ, day: "numeric", month: "short", year: "numeric" });
  const time = dt.toLocaleTimeString("es-NI", { timeZone: NI_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} · ${time}`;
}
function formatNiCompact(isoStr: string): string {
  const dt   = new Date(isoStr);
  const date = dt.toLocaleDateString("es-NI", { timeZone: NI_TZ, day: "numeric", month: "short" });
  const time = dt.toLocaleTimeString("es-NI", { timeZone: NI_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} · ${time}`;
}
import { toast } from "sonner";
import {
  Search,
  Loader2,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import DetalleModal from "./DetalleModal";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CitaRegistro = {
  id:                  string;
  fecha_hora_cita:     string;
  para_titular:        boolean;
  paciente_nombre:     string | null;
  paciente_telefono:   string | null;
  paciente_correo:     string | null;
  paciente_cedula:     string | null;
  motivo_cita:         string | null;
  estado_sync:         string;
  ea_appointment_id:   string | null;
  created_at:          string;
  paciente: {
    nombre_completo:     string | null;
    telefono:            string | null;
    documento_identidad: string | null;
  } | null;
  servicio: { nombre: string } | null;
  doctor:   { nombre: string } | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

type FilterKey = "todas" | "pendiente" | "confirmado" | "completado" | "cancelado" | "rechazado";

// Maps filter key → i18n label key and badge style
const FILTER_CONFIG: Array<{
  key:    FilterKey;
  i18n:   string;
  badge:  string;
}> = [
  { key: "todas",      i18n: "filterTodas",      badge: "bg-gray-100 text-gray-600" },
  { key: "pendiente",  i18n: "filterPendientes",  badge: "bg-amber-100 text-amber-700" },
  { key: "confirmado", i18n: "filterAprobadas",   badge: "bg-emerald-100 text-emerald-700" },
  { key: "completado", i18n: "filterCompletadas", badge: "bg-blue-100 text-blue-700" },
  { key: "cancelado",  i18n: "filterCanceladas",  badge: "bg-gray-100 text-gray-500" },
  { key: "rechazado",  i18n: "filterRechazadas",  badge: "bg-red-100 text-red-600" },
];

// Status badge styles for table rows
const STATUS_BADGE: Record<string, { i18n: string; cls: string }> = {
  pendiente:  { i18n: "statusPendiente",  cls: "bg-amber-100 text-amber-700" },
  confirmado: { i18n: "statusConfirmado", cls: "bg-emerald-100 text-emerald-700" },
  completado: { i18n: "statusCompletado", cls: "bg-blue-100 text-blue-700" },
  cancelado:  { i18n: "statusCancelado",  cls: "bg-gray-100 text-gray-500" },
  rechazado:  { i18n: "statusRechazado",  cls: "bg-red-100 text-red-600" },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
          <div className="w-32 h-3 bg-gray-200 rounded" />
          <div className="flex-1 h-3 bg-gray-200 rounded" />
          <div className="w-24 h-3 bg-gray-200 rounded" />
          <div className="w-20 h-3 bg-gray-200 rounded" />
          <div className="w-16 h-5 bg-gray-200 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmpresaCitasRegistro() {
  const t      = useTranslations("Dashboard.empresa.registroCitas");
  const tCitas = useTranslations("Dashboard.empresa.citas");

  // ── Data state ──────────────────────────────────────────────────────────
  const [citas,   setCitas]   = useState<CitaRegistro[]>([]);
  const [loading, setLoading] = useState(true);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [filter,   setFilter]   = useState<FilterKey>("todas");
  const [search,   setSearch]   = useState("");
  const [page,     setPage]     = useState(0);

  // ── Modal state ──────────────────────────────────────────────────────────
  const [selectedCita, setSelectedCita] = useState<CitaRegistro | null>(null);
  const [modalOpen,    setModalOpen]    = useState(false);

  // ── Action loading per-cita ───────────────────────────────────────────────
  const [aprobandoId,  setAprobandoId]  = useState<string | null>(null);
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);

  // ── Fetch on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("citas")
      .select(`
        id, fecha_hora_cita, para_titular, paciente_nombre,
        paciente_telefono, paciente_correo, paciente_cedula,
        motivo_cita, estado_sync, ea_appointment_id, created_at,
        paciente:users!paciente_id(nombre_completo, telefono, documento_identidad),
        servicio:servicios!citas_ea_service_id_fkey(nombre),
        doctor:doctores!citas_ea_provider_id_fkey(nombre)
      `)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setCitas(data as unknown as CitaRegistro[]);
        }
        setLoading(false);
      });
  }, []);

  // ── Derived counts per filter tab (from full dataset) ───────────────────
  const counts = useMemo<Record<FilterKey, number>>(() => ({
    todas:      citas.length,
    pendiente:  citas.filter((c) => c.estado_sync === "pendiente").length,
    confirmado: citas.filter((c) => c.estado_sync === "confirmado").length,
    completado: citas.filter((c) => c.estado_sync === "completado").length,
    cancelado:  citas.filter((c) => c.estado_sync === "cancelado").length,
    rechazado:  citas.filter((c) => c.estado_sync === "rechazado").length,
  }), [citas]);

  // ── Filtered + searched + paged data ─────────────────────────────────────
  const filtered = useMemo(() => {
    let result = filter === "todas"
      ? citas
      : citas.filter((c) => c.estado_sync === filter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((c) => {
        // "Creado por" — always the submitting user
        const creadoPor  = c.paciente?.nombre_completo?.toLowerCase() ?? "";
        // "Paciente" — third-party name or same user when para_titular
        const paciente   = (c.para_titular ? c.paciente?.nombre_completo : c.paciente_nombre)?.toLowerCase() ?? "";
        const servicio   = c.servicio?.nombre.toLowerCase() ?? "";
        const doctor     = c.doctor?.nombre.toLowerCase() ?? "";
        return creadoPor.includes(q) || paciente.includes(q) || servicio.includes(q) || doctor.includes(q);
      });
    }

    return result;
  }, [citas, filter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset to page 0 when filter or search changes
  const handleFilterChange = (key: FilterKey) => { setFilter(key); setPage(0); };
  const handleSearchChange = (val: string)   => { setSearch(val); setPage(0); };

  // ── Approve action ───────────────────────────────────────────────────────
  const handleAprobar = async (citaId: string) => {
    setAprobandoId(citaId);
    try {
      const res = await fetch("/api/ea/citas/aprobar", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ citaId }),
      });

      if (res.ok) {
        setCitas((prev) =>
          prev.map((c) =>
            c.id === citaId ? { ...c, estado_sync: "confirmado" } : c,
          ),
        );
        // Keep modal open but reflect new status
        if (selectedCita?.id === citaId) {
          setSelectedCita((prev) => prev ? { ...prev, estado_sync: "confirmado" } : prev);
        }
        toast.success(tCitas("aprobada"));
      } else {
        toast.error(tCitas("error_aprobar"));
      }
    } catch {
      toast.error(tCitas("error_aprobar"));
    } finally {
      setAprobandoId(null);
    }
  };

  // ── Reject action ─────────────────────────────────────────────────────────
  const handleRechazar = async (citaId: string) => {
    setRechazandoId(citaId);
    const supabase = createClient();

    const { error } = await supabase
      .from("citas")
      .update({ estado_sync: "rechazado" })
      .eq("id", citaId);

    if (!error) {
      setCitas((prev) =>
        prev.map((c) =>
          c.id === citaId ? { ...c, estado_sync: "rechazado" } : c,
        ),
      );
      if (selectedCita?.id === citaId) {
        setSelectedCita((prev) => prev ? { ...prev, estado_sync: "rechazado" } : prev);
      }
      toast.success(tCitas("rechazada"));
    } else {
      toast.error(tCitas("error_rechazar"));
    }

    setRechazandoId(null);
  };

  // ── Row click → open detail modal ────────────────────────────────────────
  const openModal = (cita: CitaRegistro) => {
    setSelectedCita(cita);
    setModalOpen(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("titulo")}</h1>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      {/* Filter chips + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Filter chips — scrollable on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 shrink-0">
          {FILTER_CONFIG.map(({ key, i18n, badge }) => {
            const isActive = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleFilterChange(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold font-roboto whitespace-nowrap transition-all",
                  isActive
                    ? "border-secondary bg-secondary text-white shadow-sm"
                    : "border-gray-200 bg-white text-gray-600 hover:border-secondary/40",
                )}
              >
                {t(i18n as Parameters<typeof t>[0])}
                {/* Live count badge */}
                <span className={cn(
                  "inline-block min-w-[18px] text-center px-1 py-0.5 rounded-full text-[10px] font-bold",
                  isActive ? "bg-white/20 text-white" : badge,
                )}>
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-white
                       text-sm font-roboto text-gray-800 placeholder:text-gray-400
                       focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10
                       transition-colors"
          />
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4">
            <TableSkeleton />
          </div>
        ) : paged.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center text-center py-16 space-y-3">
            <CalendarCheck className="w-14 h-14 text-gray-200" />
            <p className="text-base font-poppins font-semibold text-gray-500">
              {search || filter !== "todas" ? t("empty") : t("emptyAll")}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/60">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldCreadoPor")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldPaciente")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldServicio")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldDoctor")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldFecha")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldEstado")}
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map((cita) => {
                    const status = STATUS_BADGE[cita.estado_sync] ?? STATUS_BADGE.cancelado;

                    // "Creado por" — always the user who submitted the cita
                    const creadoPor = cita.paciente?.nombre_completo ?? "—";

                    // "Paciente" — third-party name when para_titular=false,
                    //              or the same user when para_titular=true
                    const pacienteNombre = cita.para_titular
                      ? (cita.paciente?.nombre_completo ?? "—")
                      : (cita.paciente_nombre ?? "—");

                    const fecha = formatNiShort(cita.fecha_hora_cita);
                    const isAprobando  = aprobandoId  === cita.id;
                    const isRechazando = rechazandoId === cita.id;
                    const isPendiente  = cita.estado_sync === "pendiente";

                    return (
                      <tr
                        key={cita.id}
                        onClick={() => openModal(cita)}
                        className="hover:bg-gray-50/60 cursor-pointer transition-colors"
                      >
                        {/* Creado por */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="shrink-0 w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-secondary">
                                {creadoPor.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                              </span>
                            </div>
                            <span className="font-poppins font-medium text-gray-900 truncate max-w-[140px]">
                              {creadoPor}
                            </span>
                          </div>
                        </td>
                        {/* Paciente */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-roboto text-gray-700 truncate max-w-[140px]">
                              {pacienteNombre}
                            </span>
                            {/* Badge "Tercero" only when it's not the same person */}
                            {!cita.para_titular && (
                              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                {t("valorTercero")}
                              </span>
                            )}
                          </div>
                        </td>
                        {/* Servicio */}
                        <td className="px-4 py-3.5 font-roboto text-gray-700 truncate max-w-[130px]">
                          {cita.servicio?.nombre ?? "—"}
                        </td>
                        {/* Doctor */}
                        <td className="px-4 py-3.5 font-roboto text-gray-600 truncate max-w-[110px]">
                          {cita.doctor?.nombre ?? "—"}
                        </td>
                        {/* Fecha */}
                        <td className="px-4 py-3.5 font-roboto text-gray-600 whitespace-nowrap">
                          {fecha}
                        </td>
                        {/* Estado badge */}
                        <td className="px-4 py-3.5">
                          <span className={cn(
                            "inline-block text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap",
                            status.cls,
                          )}>
                            {t(status.i18n as Parameters<typeof t>[0])}
                          </span>
                        </td>
                        {/* Inline actions — only for pending, always visible */}
                        <td
                          className="px-4 py-3.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isPendiente && (
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAprobar(cita.id)}
                                disabled={isAprobando || isRechazando}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-roboto
                                           bg-emerald-50 text-emerald-700 border border-emerald-200
                                           hover:bg-emerald-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                              >
                                {isAprobando
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <CheckCircle2 className="w-3.5 h-3.5" />
                                }
                                {t("aprobarBtn")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRechazar(cita.id)}
                                disabled={isAprobando || isRechazando}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-roboto
                                           bg-white text-red-500 border border-red-200
                                           hover:bg-red-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                              >
                                {isRechazando
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <XCircle className="w-3.5 h-3.5" />
                                }
                                {t("rechazarBtn")}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-50">
              {paged.map((cita) => {
                const status        = STATUS_BADGE[cita.estado_sync] ?? STATUS_BADGE.cancelado;
                const creadoPor     = cita.paciente?.nombre_completo ?? "—";
                const pacienteNombre = cita.para_titular
                  ? (cita.paciente?.nombre_completo ?? "—")
                  : (cita.paciente_nombre ?? "—");
                const fecha  = formatNiCompact(cita.fecha_hora_cita);
                const isPend = cita.estado_sync === "pendiente";
                const isBusy = aprobandoId === cita.id || rechazandoId === cita.id;

                return (
                  <div
                    key={cita.id}
                    onClick={() => openModal(cita)}
                    className="px-4 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar (Creado por initials) */}
                      <div className="shrink-0 w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center mt-0.5">
                        <span className="text-xs font-bold text-secondary">
                          {creadoPor.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-0.5">
                        {/* Creado por */}
                        <p className="text-sm font-poppins font-semibold text-gray-900 truncate">
                          {creadoPor}
                        </p>
                        {/* Paciente — only show separately when it's a third party */}
                        {!cita.para_titular && (
                          <p className="text-xs font-roboto text-neutral truncate flex items-center gap-1">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                              {t("valorTercero")}
                            </span>
                            {pacienteNombre}
                          </p>
                        )}
                        <p className="text-xs font-roboto text-neutral/70 truncate">
                          {cita.servicio?.nombre ?? "—"} · {cita.doctor?.nombre ?? "—"}
                        </p>
                        <p className="text-xs font-roboto text-neutral/50">{fecha}</p>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded-full",
                          status.cls,
                        )}>
                          {t(status.i18n as Parameters<typeof t>[0])}
                        </span>
                        {isPend && (
                          <div
                            className="flex gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleAprobar(cita.id)}
                              disabled={isBusy}
                              className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 disabled:opacity-50"
                            >
                              {aprobandoId === cita.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <CheckCircle2 className="w-3.5 h-3.5" />
                              }
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRechazar(cita.id)}
                              disabled={isBusy}
                              className="p-1.5 rounded-lg bg-red-50 text-red-500 disabled:opacity-50"
                            >
                              {rechazandoId === cita.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <XCircle className="w-3.5 h-3.5" />
                              }
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-roboto text-neutral">
            {t("pageInfo", { current: page + 1, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200
                         text-sm font-roboto text-gray-600 hover:border-secondary/50
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {t("prevPage")}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200
                         text-sm font-roboto text-gray-600 hover:border-secondary/50
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t("nextPage")}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <DetalleModal
        open={modalOpen}
        cita={selectedCita}
        aprobando={aprobandoId === selectedCita?.id}
        rechazando={rechazandoId === selectedCita?.id}
        onClose={() => setModalOpen(false)}
        onAprobar={handleAprobar}
        onRechazar={handleRechazar}
      />
    </div>
  );
}
