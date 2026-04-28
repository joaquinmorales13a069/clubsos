"use client";

/**
 * AvisosAdmin — Avisos CRUD for global admin (Step 7.8, Card C).
 *
 * Server-side pagination (20/page). Re-fetches on page change or after create/delete.
 * Edit updates the row in local state without a re-fetch.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import AvisoFormModal from "./AvisoFormModal";

// ── Types (exported for AvisoFormModal) ───────────────────────────────────────

export type AvisoRow = {
  id:              string;
  titulo:          string;
  descripcion:     string | null;
  fecha_inicio:    string | null;
  fecha_fin:       string | null;
  estado_aviso:    "activa" | "expirada";
  empresa_id:      string[] | null;
  aviso_image_url: string | null;
  creado_por:      string | null;
  created_at:      string;
  creado_por_user: { nombre_completo: string } | null;
};

export type EmpresaOption = { id: string; nombre: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const BUCKET    = "beneficios-imagenes";

function extractStoragePath(publicUrl: string): string {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx    = publicUrl.indexOf(marker);
  return idx >= 0 ? decodeURIComponent(publicUrl.slice(idx + marker.length)) : publicUrl;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-NI", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2 py-3 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-gray-200 shrink-0" />
          <div className="flex-1 h-3 bg-gray-200 rounded" />
          <div className="w-20 h-5 bg-gray-200 rounded-full" />
          <div className="w-28 h-3 bg-gray-200 rounded" />
          <div className="w-20 h-3 bg-gray-200 rounded" />
          <div className="flex gap-2">
            <div className="w-7 h-7 bg-gray-200 rounded-lg" />
            <div className="w-7 h-7 bg-gray-200 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  userId:   string;
  empresas: EmpresaOption[];
}

export default function AvisosAdmin({ userId, empresas }: Props) {
  const t = useTranslations("Dashboard.admin.sistema.avisos");

  // ── Data state ─────────────────────────────────────────────────────────────
  const [avisos,     setAvisos]     = useState<AvisoRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [page,    setPage]    = useState(0);
  const [refresh, setRefresh] = useState(0);
  const pageRef   = useRef(0);
  pageRef.current = page;

  // ── Modal ──────────────────────────────────────────────────────────────────
  const [formMode,  setFormMode]  = useState<"crear" | "editar">("crear");
  const [formOpen,  setFormOpen]  = useState(false);
  const [editAviso, setEditAviso] = useState<AvisoRow | null>(null);

  // ── Delete confirm ─────────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAvisos = useCallback(async () => {
    setLoading(true);
    setError(false);
    const offset = pageRef.current * PAGE_SIZE;

    const { data, count, error: fetchError } = await createClient()
      .from("avisos")
      .select("*, creado_por_user:users!creado_por(nombre_completo)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (fetchError) {
      setError(true);
    } else {
      setAvisos((data ?? []) as unknown as AvisoRow[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAvisos(); }, [fetchAvisos, page, refresh]);

  // ── Pagination helpers ─────────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const fromItem   = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const toItem     = Math.min((page + 1) * PAGE_SIZE, totalCount);

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  const openCreate = () => { setEditAviso(null); setFormMode("crear"); setFormOpen(true); };
  const openEdit   = (a: AvisoRow) => { setEditAviso(a); setFormMode("editar"); setFormOpen(true); };

  const handleSaved = (saved: AvisoRow, isNew: boolean) => {
    if (isNew) {
      setTotalCount((n) => n + 1);
      setRefresh((n) => n + 1);
    } else {
      setAvisos((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
    }
    setFormOpen(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const supabase = createClient();
    const target   = avisos.find((a) => a.id === id);

    // Remove image from storage first (best-effort)
    if (target?.aviso_image_url) {
      const path = extractStoragePath(target.aviso_image_url);
      await supabase.storage.from(BUCKET).remove([path]);
    }

    const { error: deleteError } = await supabase.from("avisos").delete().eq("id", id);
    if (!deleteError) {
      setAvisos((prev) => prev.filter((a) => a.id !== id));
      setTotalCount((n) => n - 1);
      toast.success(t("eliminadoOk"));
    } else {
      toast.error(t("errorEliminar"));
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
  };

  // ── Empresa count display ──────────────────────────────────────────────────
  const empresaLabel = useMemo(() => (ids: string[] | null) => {
    if (!ids || ids.length === 0) return t("alcanceGlobal");
    return t("alcanceEmpresas", { count: ids.length });
  }, [t]);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const thCls = "px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap";
  const tdCls = "px-4 py-3 text-sm font-roboto text-gray-800 align-middle";

  return (
    <div className="space-y-4">
      {/* Sub-header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
            <Megaphone className="w-4.5 h-4.5 text-rose-500" />
          </div>
          <div>
            <h2 className="text-base font-poppins font-semibold text-gray-900">{t("titulo")}</h2>
            <p className="text-xs font-roboto text-neutral">{t("subtitle")}</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-roboto font-medium hover:bg-secondary/90 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t("crearBtn")}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="p-8 text-center text-sm font-roboto text-red-500">{t("errorCargar")}</div>
        ) : avisos.length === 0 ? (
          <div className="p-8 text-center text-sm font-roboto text-gray-400">{t("empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls}>{t("colTitulo")}</th>
                  <th className={thCls}>{t("colEstado")}</th>
                  <th className={thCls}>{t("colFechas")}</th>
                  <th className={thCls}>{t("colAlcance")}</th>
                  <th className={thCls}>{t("colCreadoPor")}</th>
                  <th className={cn(thCls, "text-right")}>{t("colAcciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {avisos.map((aviso) => (
                  <tr key={aviso.id} className="hover:bg-gray-50/60 transition-colors">
                    {/* Título + thumbnail */}
                    <td className={cn(tdCls, "max-w-[220px]")}>
                      <div className="flex items-center gap-2.5">
                        {aviso.aviso_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={aviso.aviso_image_url}
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover shrink-0 border border-gray-100"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <span className="font-medium text-gray-900 truncate">{aviso.titulo}</span>
                      </div>
                    </td>

                    {/* Estado */}
                    <td className={tdCls}>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          aviso.estado_aviso === "activa"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500",
                        )}
                      >
                        {aviso.estado_aviso === "activa" ? t("estadoActiva") : t("estadoExpirada")}
                      </span>
                    </td>

                    {/* Fechas */}
                    <td className={cn(tdCls, "text-gray-500 whitespace-nowrap text-xs")}>
                      {formatDate(aviso.fecha_inicio)} – {formatDate(aviso.fecha_fin)}
                    </td>

                    {/* Alcance */}
                    <td className={tdCls}>
                      <span className="text-xs text-gray-500">{empresaLabel(aviso.empresa_id)}</span>
                    </td>

                    {/* Creado por */}
                    <td className={cn(tdCls, "text-gray-500 max-w-[140px] truncate text-xs")}>
                      {aviso.creado_por_user?.nombre_completo ?? "—"}
                    </td>

                    {/* Actions */}
                    <td className={cn(tdCls, "text-right")}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(aviso)}
                          title={t("editarBtn")}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        {confirmDeleteId === aviso.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(aviso.id)}
                              disabled={!!deletingId}
                              className="px-2 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            >
                              {deletingId === aviso.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : t("siEliminar")}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                            >
                              {t("cancelar")}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(aviso.id)}
                            title={t("eliminarBtn")}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* Pagination */}
        {!loading && !error && totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/40">
            <span className="text-xs font-roboto text-gray-500">
              {t("pageInfo", { from: fromItem, to: toItem, total: totalCount })}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-roboto text-gray-600">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Form modal */}
      <AvisoFormModal
        open={formOpen}
        mode={formMode}
        aviso={editAviso}
        empresas={empresas}
        createdBy={userId}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
