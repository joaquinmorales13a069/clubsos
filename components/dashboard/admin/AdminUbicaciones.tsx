"use client";

/**
 * AdminUbicaciones — CRUD for ubicaciones (clinics).
 *
 * Phase 4 · Step 3 of the native citas module. Loads the full list from
 * /api/admin/ubicaciones (small dataset, no pagination needed yet) and
 * coordinates the create/edit modal + the soft-delete action.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  MapPin,
  Plus,
  Pencil,
  Power,
  PowerOff,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AdminUbicacionFormModal from "./AdminUbicacionFormModal";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UbicacionRow = {
  id:           string;
  nombre:       string;
  direccion:    string | null;
  telefono:     string | null;
  zona_horaria: string;
  activo:       boolean;
  created_at:   string;
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2 py-3 animate-pulse">
          <div className="flex-1 h-3 bg-gray-200 rounded" />
          <div className="w-40 h-3 bg-gray-200 rounded" />
          <div className="w-24 h-3 bg-gray-200 rounded" />
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

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminUbicaciones() {
  const t = useTranslations("Dashboard.admin.ubicaciones");

  const [rows,    setRows]    = useState<UbicacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  // Modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editing,  setEditing]  = useState<UbicacionRow | null>(null);

  // Soft delete confirm state
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId,    setBusyId]    = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/ubicaciones", { cache: "no-store" });
      const j   = (await res.json()) as { ubicaciones?: UbicacionRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "load failed");
      setRows(j.ubicaciones ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit   = (u: UbicacionRow) => { setEditing(u); setFormOpen(true); };

  const handleSaved = () => {
    setFormOpen(false);
    toast.success(t("saved"));
    void load();
  };

  const handleToggleActivo = async (u: UbicacionRow) => {
    // Deactivating requires confirm; reactivating is one-click
    if (u.activo && confirmId !== u.id) {
      setConfirmId(u.id);
      return;
    }
    setBusyId(u.id);
    setConfirmId(null);

    const res = u.activo
      ? await fetch(`/api/admin/ubicaciones/${u.id}`, { method: "DELETE" })
      : await fetch(`/api/admin/ubicaciones/${u.id}`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ activo: true }),
        });

    if (res.ok) {
      setRows((prev) =>
        prev.map((r) => (r.id === u.id ? { ...r, activo: !u.activo } : r)),
      );
      toast.success(u.activo ? t("desactivado") : t("activado"));
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
            <MapPin className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h1 className="text-xl font-poppins font-bold text-gray-900">{t("title")}</h1>
            <p className="text-sm font-roboto text-neutral">{t("subtitle")}</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-roboto font-medium hover:bg-secondary/90 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t("nueva")}
        </button>
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
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls}>{t("col_nombre")}</th>
                  <th className={thCls}>{t("col_direccion")}</th>
                  <th className={thCls}>{t("col_telefono")}</th>
                  <th className={thCls}>{t("col_estado")}</th>
                  <th className={cn(thCls, "text-right")}>{t("col_acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-gray-50/60 transition-colors"
                    onClick={() => {
                      if (confirmId === u.id) return;
                      setConfirmId(null);
                    }}
                  >
                    <td className={cn(tdCls, "font-medium text-gray-900")}>
                      <span className="inline-flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-secondary shrink-0" />
                        {u.nombre}
                      </span>
                    </td>
                    <td className={cn(tdCls, "text-gray-600 max-w-[260px] truncate")}>
                      {u.direccion ?? "—"}
                    </td>
                    <td className={cn(tdCls, "text-gray-600 whitespace-nowrap")}>
                      {u.telefono ?? "—"}
                    </td>
                    <td className={tdCls}>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          u.activo
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500",
                        )}
                      >
                        {u.activo ? t("activo") : t("inactivo")}
                      </span>
                    </td>
                    <td className={cn(tdCls, "text-right")} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          title={t("editar")}
                          aria-label={t("editar")}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        {confirmId === u.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="flex items-center gap-1 text-xs text-amber-600 font-roboto">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {t("toggleConfirm")}
                            </span>
                            <button
                              onClick={() => handleToggleActivo(u)}
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
                            onClick={() => handleToggleActivo(u)}
                            disabled={!!busyId}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 border",
                              u.activo
                                ? "text-red-500 hover:bg-red-50 border-red-100"
                                : "text-emerald-600 hover:bg-emerald-50 border-emerald-100",
                            )}
                          >
                            {busyId === u.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : u.activo ? (
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

      {/* Form modal */}
      <AdminUbicacionFormModal
        open={formOpen}
        ubicacion={editing}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
