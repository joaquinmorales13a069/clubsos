"use client";

/**
 * AdminServicios — CRUD for servicios (catalog of medical services).
 *
 * Phase 4 · Step 4 of the native citas module. Loads the full list from
 * /api/admin/servicios (small dataset, no pagination needed yet) and
 * provides per-row navigate-to-detail, activate/deactivate toggle.
 * Create/edit now go through dedicated parallel-route pages.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import {
  Stethoscope,
  Plus,
  Pencil,
  Power,
  PowerOff,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ServicioRow = {
  id:             string;
  nombre:         string;
  descripcion:    string | null;
  duracion:       number | null;       // minutes, informativa
  slot_duracion:  number;              // slots consumed in doctor grid
  precio:         number | null;
  activo:         boolean;
  // From the embed `doctor_servicios(count)` — supabase returns an array
  // with a single { count } row.
  doctor_servicios?: Array<{ count: number }>;
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2 py-3 animate-pulse">
          <div className="flex-1 h-3 bg-gray-200 rounded" />
          <div className="w-40 h-3 bg-gray-200 rounded" />
          <div className="w-20 h-3 bg-gray-200 rounded" />
          <div className="w-20 h-3 bg-gray-200 rounded" />
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

function formatPrecio(p: number | null): string {
  if (p === null || p === undefined) return "—";
  return `$${Number(p).toFixed(2)}`;
}

function doctorCount(s: ServicioRow): number {
  return s.doctor_servicios?.[0]?.count ?? 0;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminServicios() {
  const t      = useTranslations("Dashboard.admin.servicios");
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const activeId = params?.id ?? null;
  const locale = useLocale();

  const [rows,    setRows]    = useState<ServicioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  // Soft delete confirm state
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId,    setBusyId]    = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/servicios", { cache: "no-store" });
      const j   = (await res.json()) as { servicios?: ServicioRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "load failed");
      setRows(j.servicios ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleToggleActivo = async (s: ServicioRow) => {
    // Deactivating requires confirm; reactivating is one-click
    if (s.activo && confirmId !== s.id) {
      setConfirmId(s.id);
      return;
    }
    setBusyId(s.id);
    setConfirmId(null);

    const res = s.activo
      ? await fetch(`/api/admin/servicios/${s.id}`, { method: "DELETE" })
      : await fetch(`/api/admin/servicios/${s.id}`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ activo: true }),
        });

    if (res.ok) {
      setRows((prev) =>
        prev.map((r) => (r.id === s.id ? { ...r, activo: !s.activo } : r)),
      );
      toast.success(s.activo ? t("desactivado") : t("activado"));
    } else {
      toast.error(t("errorGuardar"));
    }
    setBusyId(null);
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const thCls = "px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap";
  const tdCls = "px-4 py-3 text-sm font-roboto text-gray-800 align-middle";

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
          href={`/${locale}/dashboard/admin/servicios/nuevo`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-roboto font-medium hover:bg-secondary/90 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t("nueva")}
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="p-8 text-center text-sm font-roboto text-red-500">
            {t("errorCargar")}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm font-roboto text-gray-400">
            {t("empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls}>{t("col_nombre")}</th>
                  <th className={cn(thCls, "hidden md:table-cell")}>{t("col_descripcion")}</th>
                  <th className={thCls}>{t("col_duracion")}</th>
                  <th className={thCls}>{t("col_slot_duracion")}</th>
                  <th className={thCls}>{t("col_precio")}</th>
                  <th className={thCls}>{t("col_doctores")}</th>
                  <th className={thCls}>{t("col_estado")}</th>
                  <th className={cn(thCls, "text-right")}>{t("col_acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    data-active={activeId === s.id}
                    className="hover:bg-gray-50/60 transition-colors cursor-pointer data-[active=true]:bg-primary/5 data-[active=true]:border-l-2 data-[active=true]:border-primary"
                    onClick={() => {
                      if (confirmId === s.id) return;
                      setConfirmId(null);
                      router.push(`/${locale}/dashboard/admin/servicios/${s.id}`);
                    }}
                  >
                    <td className={cn(tdCls, "font-medium text-gray-900")}>
                      <span className="inline-flex items-center gap-2">
                        <Stethoscope className="w-4 h-4 text-secondary shrink-0" />
                        {s.nombre}
                      </span>
                    </td>
                    <td className={cn(tdCls, "hidden md:table-cell text-gray-600 max-w-[260px] truncate")}>
                      {s.descripcion ?? "—"}
                    </td>
                    <td className={cn(tdCls, "text-gray-600 whitespace-nowrap")}>
                      {s.duracion ? `${s.duracion} min` : "—"}
                    </td>
                    <td className={cn(tdCls, "text-gray-600 whitespace-nowrap")}>
                      {s.slot_duracion === 1 ? "1 slot" : `${s.slot_duracion} slots`}
                    </td>
                    <td className={cn(tdCls, "text-gray-600 whitespace-nowrap")}>
                      {formatPrecio(s.precio)}
                    </td>
                    <td className={cn(tdCls, "text-gray-600 whitespace-nowrap")}>
                      {doctorCount(s)}
                    </td>
                    <td className={tdCls}>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          s.activo
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500",
                        )}
                      >
                        {s.activo ? t("activo") : t("inactivo")}
                      </span>
                    </td>
                    <td className={cn(tdCls, "text-right")} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/${locale}/dashboard/admin/servicios/${s.id}/editar`}
                          title={t("editar")}
                          aria-label={t("editar")}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>

                        {confirmId === s.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="flex items-center gap-1 text-xs text-amber-600 font-roboto">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {t("toggleConfirm")}
                            </span>
                            <button
                              onClick={() => handleToggleActivo(s)}
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
                            onClick={() => handleToggleActivo(s)}
                            disabled={!!busyId}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 border",
                              s.activo
                                ? "text-red-500 hover:bg-red-50 border-red-100"
                                : "text-emerald-600 hover:bg-emerald-50 border-emerald-100",
                            )}
                          >
                            {busyId === s.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : s.activo ? (
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
