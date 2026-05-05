"use client";

/**
 * AdminCitasRegistro — Global appointment registry for admin (Step 7.3).
 *
 * Server-side pagination (20/page). Re-fetches when status filter,
 * empresa filter, or page changes. Search is client-side over the
 * current fetched page (CONTEXT §7.3: "sobre la página actual cargada").
 *
 * Approve: POST /api/ea/citas/aprobar (only when ea_appointment_id IS NULL)
 * Reject:  direct Supabase JS update
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Eye,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import DetalleModalAdmin from "./DetalleModalAdmin";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CitaRegistroAdmin = {
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
    email:               string | null;
    telefono:            string | null;
    documento_identidad: string | null;
  } | null;
  servicio: { nombre: string } | null;
  doctor:   { nombre: string } | null;
  empresa:  { nombre: string } | null;
};

type EmpresaOption = { id: string; nombre: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

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

type FilterKey = "todas" | "pendiente" | "pendiente_empresa" | "pendiente_pago" | "pendiente_admin" | "confirmado" | "completado" | "cancelado" | "rechazado";

const FILTER_CONFIG: Array<{ key: FilterKey; i18n: string; badge: string }> = [
  { key: "todas",             i18n: "filterTodas",            badge: "bg-gray-100 text-gray-600" },
  { key: "pendiente",         i18n: "filterPendientes",        badge: "bg-amber-100 text-amber-700" },
  { key: "pendiente_empresa", i18n: "filterPendienteEmpresa",  badge: "bg-orange-100 text-orange-700" },
  { key: "pendiente_pago",    i18n: "filterPendientePago",     badge: "bg-yellow-100 text-yellow-700" },
  { key: "pendiente_admin",   i18n: "filterPendienteAdmin",    badge: "bg-purple-100 text-purple-700" },
  { key: "confirmado",        i18n: "filterAprobadas",         badge: "bg-emerald-100 text-emerald-700" },
  { key: "completado",        i18n: "filterCompletadas",       badge: "bg-blue-100 text-blue-700" },
  { key: "cancelado",         i18n: "filterCanceladas",        badge: "bg-gray-100 text-gray-500" },
  { key: "rechazado",         i18n: "filterRechazadas",        badge: "bg-red-100 text-red-600" },
];

const STATUS_BADGE: Record<string, { i18n: string; cls: string }> = {
  pendiente:          { i18n: "statusPendiente",         cls: "bg-amber-100 text-amber-700" },
  pendiente_empresa:  { i18n: "statusPendienteEmpresa",  cls: "bg-orange-100 text-orange-700" },
  pendiente_pago:     { i18n: "statusPendientePago",     cls: "bg-yellow-100 text-yellow-700" },
  pendiente_admin:    { i18n: "statusPendienteAdmin",    cls: "bg-purple-100 text-purple-700" },
  confirmado:         { i18n: "statusConfirmado",        cls: "bg-emerald-100 text-emerald-700" },
  completado:         { i18n: "statusCompletado",        cls: "bg-blue-100 text-blue-700" },
  cancelado:          { i18n: "statusCancelado",         cls: "bg-gray-100 text-gray-500" },
  rechazado:          { i18n: "statusRechazado",         cls: "bg-red-100 text-red-600" },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2 py-3 animate-pulse">
          <div className="w-28 h-3 bg-gray-200 rounded" />
          <div className="w-24 h-3 bg-gray-200 rounded" />
          <div className="flex-1 h-3 bg-gray-200 rounded" />
          <div className="w-28 h-3 bg-gray-200 rounded" />
          <div className="w-16 h-5 bg-gray-200 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminCitasRegistro() {
  const t      = useTranslations("Dashboard.admin.citas");
  const tGlobal = useTranslations("Dashboard.empresa.citas");

  // ── Server-fetched data ──────────────────────────────────────────────────
  const [citas,      setCitas]      = useState<CitaRegistroAdmin[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);

  // ── Filter / pagination state (each change triggers server re-fetch) ─────
  const [filter,        setFilter]        = useState<FilterKey>("todas");
  const [empresaFilter, setEmpresaFilter] = useState<string>("");
  const [page,          setPage]          = useState(0);

  // ── Client-side search over current page ─────────────────────────────────
  const [search, setSearch] = useState("");

  // ── Empresa dropdown options (fetched once) ───────────────────────────────
  const [empresas,        setEmpresas]        = useState<EmpresaOption[]>([]);
  const [empresasLoading, setEmpresasLoading] = useState(true);

  // ── Modal ─────────────────────────────────────────────────────────────────
  const [selectedCita, setSelectedCita] = useState<CitaRegistroAdmin | null>(null);
  const [modalOpen,    setModalOpen]    = useState(false);

  // ── Per-row action loading ─────────────────────────────────────────────────
  const [aprobandoId,  setAprobandoId]  = useState<string | null>(null);
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);

  // ── Fetch empresa options (once on mount) ─────────────────────────────────
  useEffect(() => {
    createClient()
      .from("empresas")
      .select("id, nombre")
      .order("nombre")
      .then(({ data }) => {
        setEmpresas((data ?? []) as EmpresaOption[]);
        setEmpresasLoading(false);
      });
  }, []);

  // ── Server-side fetch (triggered by filter / empresa / page changes) ──────
  const fetchCitas = useCallback(async () => {
    setLoading(true);
    setError(false);

    const supabase = createClient();
    const offset   = page * PAGE_SIZE;

    let query = supabase
      .from("citas")
      .select(
        `id, fecha_hora_cita, para_titular, paciente_nombre,
         paciente_telefono, paciente_correo, paciente_cedula,
         motivo_cita, estado_sync, ea_appointment_id, created_at,
         paciente:users!paciente_id(nombre_completo, email, telefono, documento_identidad),
         servicio:servicios!citas_ea_service_id_fkey(nombre),
         doctor:doctores!citas_ea_provider_id_fkey(nombre),
         empresa:empresas!empresa_id(nombre)`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (filter !== "todas")  query = query.eq("estado_sync", filter);
    if (empresaFilter)       query = query.eq("empresa_id", empresaFilter);

    const { data, count, error: fetchError } = await query;

    if (fetchError) {
      setError(true);
    } else {
      setCitas((data ?? []) as unknown as CitaRegistroAdmin[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [filter, empresaFilter, page]);

  useEffect(() => { fetchCitas(); }, [fetchCitas]);

  // Re-fetch when another section on this page mutates a cita
  useEffect(() => {
    const handler = () => { void fetchCitas(); };
    window.addEventListener("citas:mutated", handler);
    return () => window.removeEventListener("citas:mutated", handler);
  }, [fetchCitas]);

  // Re-fetch when user returns to this tab so new citas appear without manual refresh
  useEffect(() => {
    const handler = () => { if (document.visibilityState === "visible") void fetchCitas(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchCitas]);

  // Reset to page 0 on filter/empresa changes
  const handleFilterChange = (key: FilterKey) => { setFilter(key); setPage(0); };
  const handleEmpresaChange = (id: string)    => { setEmpresaFilter(id); setPage(0); };

  // ── Client-side search over current page ─────────────────────────────────
  const displayedCitas = useMemo(() => {
    if (!search.trim()) return citas;
    const q = search.toLowerCase();
    return citas.filter((c) => {
      const paciente = c.paciente?.nombre_completo?.toLowerCase() ?? "";
      const empresa  = c.empresa?.nombre?.toLowerCase() ?? "";
      return paciente.includes(q) || empresa.includes(q);
    });
  }, [citas, search]);

  // ── Pagination helpers ────────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const fromItem   = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const toItem     = Math.min((page + 1) * PAGE_SIZE, totalCount);

  // ── Approve ───────────────────────────────────────────────────────────────
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
          prev.map((c) => c.id === citaId ? { ...c, estado_sync: "confirmado" } : c),
        );
        if (selectedCita?.id === citaId) {
          setSelectedCita((prev) => prev ? { ...prev, estado_sync: "confirmado" } : prev);
        }
        toast.success(tGlobal("aprobada"));
        window.dispatchEvent(new CustomEvent("citas:mutated"));
      } else {
        toast.error(tGlobal("error_aprobar"));
      }
    } catch {
      toast.error(tGlobal("error_aprobar"));
    } finally {
      setAprobandoId(null);
    }
  };

  // ── Reject ────────────────────────────────────────────────────────────────
  const handleRechazar = async (citaId: string) => {
    setRechazandoId(citaId);
    const { error: updateError } = await createClient()
      .from("citas")
      .update({ estado_sync: "rechazado" })
      .eq("id", citaId);

    if (!updateError) {
      setCitas((prev) =>
        prev.map((c) => c.id === citaId ? { ...c, estado_sync: "rechazado" } : c),
      );
      if (selectedCita?.id === citaId) {
        setSelectedCita((prev) => prev ? { ...prev, estado_sync: "rechazado" } : prev);
      }
      toast.success(tGlobal("rechazada"));
      window.dispatchEvent(new CustomEvent("citas:mutated"));
    } else {
      toast.error(tGlobal("error_rechazar"));
    }
    setRechazandoId(null);
  };

  const openModal = (cita: CitaRegistroAdmin) => { setSelectedCita(cita); setModalOpen(true); };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("titulo")}</h1>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-3">
        {/* Status chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
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
              </button>
            );
          })}
        </div>

        {/* Empresa dropdown + Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={empresaFilter}
            onChange={(e) => handleEmpresaChange(e.target.value)}
            disabled={empresasLoading}
            className="sm:w-56 shrink-0 px-3 py-2 rounded-xl border border-gray-200 bg-white
                       text-sm font-roboto text-gray-800
                       focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10
                       disabled:opacity-50 transition-colors"
          >
            <option value="">{t("filterEmpresaAll")}</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-white
                         text-sm font-roboto text-gray-800 placeholder:text-gray-400
                         focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10
                         transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center text-center py-12 space-y-2">
            <p className="text-sm font-roboto text-red-500">{t("errorCargar")}</p>
          </div>
        ) : displayedCitas.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 space-y-3">
            <CalendarCheck className="w-14 h-14 text-gray-200" />
            <p className="text-base font-poppins font-semibold text-gray-500">
              {search || filter !== "todas" || empresaFilter ? t("empty") : t("emptyAll")}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto min-w-[720px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/60">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldPaciente")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldEmpresa")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldServicio")}
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
                  {displayedCitas.map((cita) => {
                    const status       = STATUS_BADGE[cita.estado_sync] ?? STATUS_BADGE.cancelado;
                    const nombre       = cita.paciente?.nombre_completo ?? "—";
                    const empresa      = cita.empresa?.nombre ?? "—";
                    const fecha        = formatNiShort(cita.fecha_hora_cita);
                    const isPendiente  = cita.estado_sync === "pendiente";
                    const canAprobar   = isPendiente && !cita.ea_appointment_id;
                    const isAprobando  = aprobandoId  === cita.id;
                    const isRechazando = rechazandoId === cita.id;

                    return (
                      <tr
                        key={cita.id}
                        className="hover:bg-gray-50/60 transition-colors"
                      >
                        {/* Paciente */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="shrink-0 w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-secondary">
                                {nombre.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-poppins font-medium text-gray-900 truncate max-w-[140px]">
                                {nombre}
                              </p>
                              {!cita.para_titular && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                  {t("valorTercero")}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        {/* Empresa */}
                        <td className="px-4 py-3.5 font-roboto text-gray-600 truncate max-w-[120px]">
                          {empresa}
                        </td>
                        {/* Servicio */}
                        <td className="px-4 py-3.5 font-roboto text-gray-700 truncate max-w-[130px]">
                          {cita.servicio?.nombre ?? "—"}
                        </td>
                        {/* Fecha */}
                        <td className="px-4 py-3.5 font-roboto text-gray-600 whitespace-nowrap text-xs">
                          {fecha}
                        </td>
                        {/* Estado */}
                        <td className="px-4 py-3.5">
                          <span className={cn(
                            "inline-block text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap",
                            status.cls,
                          )}>
                            {t(status.i18n as Parameters<typeof t>[0])}
                          </span>
                        </td>
                        {/* Actions */}
                        <td
                          className="px-4 py-3.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1.5">
                            {/* Eye / detail */}
                            <button
                              type="button"
                              onClick={() => openModal(cita)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                              title={t("verDetalle")}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {/* Approve — only when pendiente and not yet in EA */}
                            {canAprobar && (
                              <button
                                type="button"
                                onClick={() => handleAprobar(cita.id)}
                                disabled={isAprobando || isRechazando}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold font-roboto
                                           bg-emerald-50 text-emerald-700 border border-emerald-200
                                           hover:bg-emerald-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                              >
                                {isAprobando
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <CheckCircle2 className="w-3 h-3" />
                                }
                                {t("aprobarBtn")}
                              </button>
                            )}
                            {/* Reject — only when pendiente */}
                            {isPendiente && (
                              <button
                                type="button"
                                onClick={() => handleRechazar(cita.id)}
                                disabled={isAprobando || isRechazando}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold font-roboto
                                           bg-white text-red-500 border border-red-200
                                           hover:bg-red-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                              >
                                {isRechazando
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <XCircle className="w-3 h-3" />
                                }
                                {t("rechazarBtn")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-50">
              {displayedCitas.map((cita) => {
                const status       = STATUS_BADGE[cita.estado_sync] ?? STATUS_BADGE.cancelado;
                const nombre       = cita.paciente?.nombre_completo ?? "—";
                const empresa      = cita.empresa?.nombre ?? "—";
                const fecha        = formatNiCompact(cita.fecha_hora_cita);
                const isPendiente  = cita.estado_sync === "pendiente";
                const canAprobar   = isPendiente && !cita.ea_appointment_id;
                const isBusy       = aprobandoId === cita.id || rechazandoId === cita.id;

                return (
                  <div
                    key={cita.id}
                    onClick={() => openModal(cita)}
                    className="px-4 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center mt-0.5">
                        <span className="text-xs font-bold text-secondary">
                          {nombre.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-poppins font-semibold text-gray-900 truncate">{nombre}</p>
                        <div className="flex items-center gap-1 text-xs font-roboto">
                          <span className="font-semibold text-gray-400 uppercase tracking-wide text-[10px]">{t("fieldEmpresa")}</span>
                          <span className="text-neutral/70 truncate">{empresa}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-roboto">
                          <span className="font-semibold text-gray-400 uppercase tracking-wide text-[10px]">{t("fieldServicio")}</span>
                          <span className="text-neutral/70 truncate">{cita.servicio?.nombre ?? "—"}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-roboto">
                          <span className="font-semibold text-gray-400 uppercase tracking-wide text-[10px]">{t("fieldDoctor")}</span>
                          <span className="text-neutral/70 truncate">{cita.doctor?.nombre ?? "—"}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-roboto">
                          <span className="font-semibold text-gray-400 uppercase tracking-wide text-[10px]">{t("fieldFecha")}</span>
                          <span className="text-neutral/50">{fecha}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", status.cls)}>
                          {t(status.i18n as Parameters<typeof t>[0])}
                        </span>
                        {isPendiente && (
                          <div
                            className="flex gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canAprobar && (
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
                            )}
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
            {t("pageInfo", { from: fromItem, to: toItem, total: totalCount })}
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
      <DetalleModalAdmin
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
