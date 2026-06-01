"use client";

/**
 * AdminDoctores — list + filter doctores.
 *
 * Phase 4 · Step 6 of the native citas module. Lists doctores from
 * /api/admin/doctores, allows filtering by ubicacion and estado, and
 * provides per-row toggle activar/desactivar + navigation to /[id].
 * Create/edit now go through dedicated parallel-route pages.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Stethoscope,
  Plus,
  Eye,
  Pencil,
  Power,
  PowerOff,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DoctorRow = {
  id:               string;
  nombre:           string;
  correo:           string | null;
  activo:           boolean;
  ubicacion:        { id: string; nombre: string } | null;
  doctor_servicios?: Array<{ count: number }>;
};

export type UbicacionMini = { id: string; nombre: string };

interface Props {
  locale: string;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2 py-3 animate-pulse">
          <div className="flex-1 h-3 bg-gray-200 rounded" />
          <div className="w-40 h-3 bg-gray-200 rounded" />
          <div className="w-40 h-3 bg-gray-200 rounded" />
          <div className="w-16 h-3 bg-gray-200 rounded" />
          <div className="w-16 h-5 bg-gray-200 rounded-full" />
          <div className="flex gap-2">
            <div className="w-7 h-7 bg-gray-200 rounded-lg" />
            <div className="w-20 h-7 bg-gray-200 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function servicioCount(d: DoctorRow): number {
  return d.doctor_servicios?.[0]?.count ?? 0;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminDoctores({ locale }: Props) {
  const t      = useTranslations("Dashboard.admin.doctores");
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const activeId = params?.id ?? null;

  const [rows,    setRows]    = useState<DoctorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  // Ubicaciones for filter
  const [ubicaciones, setUbicaciones] = useState<UbicacionMini[]>([]);

  // Filters
  const [filtroUbicacion, setFiltroUbicacion] = useState<string>("");
  const [filtroEstado,    setFiltroEstado]    = useState<"todos" | "activo" | "inactivo">("activo");

  // Soft delete confirm state
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId,    setBusyId]    = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/doctores", { cache: "no-store" });
      const j   = (await res.json()) as { doctores?: DoctorRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "load failed");
      setRows(j.doctores ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUbicaciones = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ubicaciones", { cache: "no-store" });
      const j   = (await res.json()) as { ubicaciones?: UbicacionMini[] };
      setUbicaciones(j.ubicaciones ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadUbicaciones();
  }, [load, loadUbicaciones]);

  // ── Derived list (apply filters client-side) ───────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter((d) => {
      if (filtroUbicacion && d.ubicacion?.id !== filtroUbicacion) return false;
      if (filtroEstado === "activo"   && !d.activo) return false;
      if (filtroEstado === "inactivo" &&  d.activo) return false;
      return true;
    });
  }, [rows, filtroUbicacion, filtroEstado]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleToggleActivo = async (d: DoctorRow) => {
    if (d.activo && confirmId !== d.id) {
      setConfirmId(d.id);
      return;
    }
    setBusyId(d.id);
    setConfirmId(null);

    const res = d.activo
      ? await fetch(`/api/admin/doctores/${d.id}`, { method: "DELETE" })
      : await fetch(`/api/admin/doctores/${d.id}`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ activo: true }),
        });

    if (res.ok) {
      setRows((prev) =>
        prev.map((r) => (r.id === d.id ? { ...r, activo: !d.activo } : r)),
      );
      toast.success(d.activo ? t("desactivado") : t("activado"));
    } else {
      toast.error(t("errorGuardar"));
    }
    setBusyId(null);
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const thCls = "px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap";
  const tdCls = "px-4 py-3 text-sm font-roboto text-gray-800 align-middle";

  const selectCls =
    "px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-700 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h1 className="text-xl font-poppins font-bold text-gray-900">{t("title")}</h1>
            <p className="text-sm font-roboto text-neutral">{t("subtitle")}</p>
          </div>
        </div>
        <Link
          href={`/${locale}/dashboard/admin/doctores/nuevo`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-roboto font-medium hover:bg-secondary/90 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t("nuevo")}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          aria-label={t("filtroUbicacion")}
          value={filtroUbicacion}
          onChange={(e) => setFiltroUbicacion(e.target.value)}
          className={selectCls}
        >
          <option value="">{t("filtroUbicacion")}</option>
          {ubicaciones.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>

        <select
          aria-label={t("filtroEstado")}
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as "todos" | "activo" | "inactivo")}
          className={selectCls}
        >
          <option value="activo">{t("activo")}</option>
          <option value="inactivo">{t("inactivo")}</option>
          <option value="todos">{t("filtroTodos")}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="p-8 text-center text-sm font-roboto text-red-500">
            {t("errorCargar")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm font-roboto text-gray-400">
            {t("empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls}>{t("col_nombre")}</th>
                  <th className={thCls}>{t("col_ubicacion")}</th>
                  <th className={cn(thCls, "hidden md:table-cell")}>{t("col_correo")}</th>
                  <th className={thCls}>{t("col_servicios")}</th>
                  <th className={thCls}>{t("col_estado")}</th>
                  <th className={cn(thCls, "text-right")}>{t("col_acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((d) => (
                  <tr
                    key={d.id}
                    data-active={d.id === activeId ? "true" : undefined}
                    className="hover:bg-gray-50/60 transition-colors cursor-pointer data-[active=true]:bg-primary/5 data-[active=true]:border-l-2 data-[active=true]:border-primary"
                    onClick={() => {
                      if (confirmId === d.id) return;
                      setConfirmId(null);
                      router.push(`/${locale}/dashboard/admin/doctores/${d.id}`);
                    }}
                  >
                    <td className={cn(tdCls, "font-medium text-gray-900")}>
                      <span className="inline-flex items-center gap-2">
                        <Stethoscope className="w-4 h-4 text-secondary shrink-0" />
                        {d.nombre}
                      </span>
                    </td>
                    <td className={cn(tdCls, "text-gray-600 whitespace-nowrap")}>
                      {d.ubicacion?.nombre ?? "—"}
                    </td>
                    <td className={cn(tdCls, "hidden md:table-cell text-gray-600 max-w-[260px] truncate")}>
                      {d.correo ?? "—"}
                    </td>
                    <td className={cn(tdCls, "text-gray-600 whitespace-nowrap")}>
                      {servicioCount(d)}
                    </td>
                    <td className={tdCls}>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          d.activo
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500",
                        )}
                      >
                        {d.activo ? t("activo") : t("inactivo")}
                      </span>
                    </td>
                    <td className={cn(tdCls, "text-right")} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/${locale}/dashboard/admin/doctores/${d.id}`}
                          title={t("verDetalle")}
                          aria-label={t("verDetalle")}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/${locale}/dashboard/admin/doctores/${d.id}/editar`}
                          title={t("editar")}
                          aria-label={t("editar")}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>

                        {confirmId === d.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="flex items-center gap-1 text-xs text-amber-600 font-roboto">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {t("toggleConfirm")}
                            </span>
                            <button
                              onClick={() => handleToggleActivo(d)}
                              disabled={!!busyId}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            >
                              {t("siDesactivar")}
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleToggleActivo(d)}
                            disabled={!!busyId}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 border",
                              d.activo
                                ? "text-red-500 hover:bg-red-50 border-red-100"
                                : "text-emerald-600 hover:bg-emerald-50 border-emerald-100",
                            )}
                          >
                            {busyId === d.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : d.activo ? (
                              <>
                                <PowerOff className="w-3.5 h-3.5" />
                                {t("desactivarBtn")}
                              </>
                            ) : (
                              <>
                                <Power className="w-3.5 h-3.5" />
                                {t("activarBtn")}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
