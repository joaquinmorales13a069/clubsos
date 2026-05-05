"use client";

/**
 * AdminBeneficios — Full CRUD for beneficios (Step 7.4).
 *
 * Server-side pagination (20/page). Re-fetches on page change or after
 * create/delete. Edit updates the row in local state without a re-fetch.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Gift,
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
import BeneficioFormModal from "./BeneficioFormModal";
import BeneficioDetailModal from "@/components/dashboard/miembro/beneficios/BeneficioDetailModal";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BeneficioRow = {
  id:                  string;
  titulo:              string;
  descripcion:         string | null;
  fecha_inicio:        string | null;
  fecha_fin:           string | null;
  estado_beneficio:    "activa" | "expirada";
  tipo_beneficio:      "descuento" | "promocion";
  empresa_id:          string[] | null;
  beneficio_image_url: string | null;
  creado_por:          string | null;
  created_at:          string;
  creado_por_user:     { nombre_completo: string } | null;
};

export type EmpresaOption = { id: string; nombre: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE  = 20;
const BUCKET     = "beneficios-imagenes";

function extractStoragePath(publicUrl: string): string {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx    = publicUrl.indexOf(marker);
  return idx >= 0 ? decodeURIComponent(publicUrl.slice(idx + marker.length)) : publicUrl;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-NI", { day: "numeric", month: "short", year: "numeric" });
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
          <div className="w-16 h-5 bg-gray-200 rounded-full" />
          <div className="w-28 h-3 bg-gray-200 rounded" />
          <div className="w-24 h-3 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  userId: string;
}

export default function AdminBeneficios({ userId }: Props) {
  const t = useTranslations("Dashboard.admin.beneficios");

  // ── Data state ────────────────────────────────────────────────────────────
  const [beneficios,  setBeneficios]  = useState<BeneficioRow[]>([]);
  const [totalCount,  setTotalCount]  = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);

  // ── Pagination (pageRef allows stable fetchBeneficios callback) ───────────
  const [page,    setPage]    = useState(0);
  const [refresh, setRefresh] = useState(0);
  const pageRef = useRef(0);
  pageRef.current = page;

  // ── Empresa options for form (fetched once) ───────────────────────────────
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);

  // ── Form modal ────────────────────────────────────────────────────────────
  const [formOpen,         setFormOpen]         = useState(false);
  const [editingBeneficio, setEditingBeneficio] = useState<BeneficioRow | null>(null);

  // ── Delete confirm ────────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);

  // ── Detail modal ──────────────────────────────────────────────────────────
  const [detailBeneficio, setDetailBeneficio] = useState<BeneficioRow | null>(null);

  // ── Fetch beneficios ──────────────────────────────────────────────────────
  const fetchBeneficios = useCallback(async () => {
    setLoading(true);
    setError(false);
    const offset = pageRef.current * PAGE_SIZE;

    const { data, count, error: fetchError } = await createClient()
      .from("beneficios")
      .select("*, creado_por_user:users!creado_por(nombre_completo)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (fetchError) {
      setError(true);
    } else {
      setBeneficios((data ?? []) as BeneficioRow[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, []);

  // Re-fetch when page or refresh key changes
  useEffect(() => { fetchBeneficios(); }, [fetchBeneficios, page, refresh]);

  // Fetch empresas once on mount
  useEffect(() => {
    createClient()
      .from("empresas")
      .select("id, nombre")
      .eq("estado", "activa")
      .order("nombre")
      .then(({ data }) => setEmpresas((data ?? []) as EmpresaOption[]));
  }, []);

  // ── Pagination helpers ────────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const fromItem   = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const toItem     = Math.min((page + 1) * PAGE_SIZE, totalCount);

  // ── Create / Edit handlers ────────────────────────────────────────────────
  const openCrear = () => { setEditingBeneficio(null); setFormOpen(true); };
  const openEditar = (b: BeneficioRow) => { setEditingBeneficio(b); setFormOpen(true); };

  const handleSaved = (saved: BeneficioRow, isNew: boolean) => {
    setFormOpen(false);
    setEditingBeneficio(null);
    if (isNew) {
      // Go to page 0 and re-fetch so new item appears first
      setPage(0);
      setRefresh((r) => r + 1);
    } else {
      // Update row in place — no re-fetch needed
      setBeneficios((prev) => prev.map((b) => (b.id === saved.id ? saved : b)));
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const supabase = createClient();
    const target   = beneficios.find((b) => b.id === id);

    // Delete storage image if exists
    if (target?.beneficio_image_url) {
      const path = extractStoragePath(target.beneficio_image_url);
      await supabase.storage.from(BUCKET).remove([path]);
    }

    const { error: deleteError } = await supabase.from("beneficios").delete().eq("id", id);
    if (!deleteError) {
      setBeneficios((prev) => prev.filter((b) => b.id !== id));
      setTotalCount((n) => n - 1);
      toast.success(t("eliminadoOk"));
    } else {
      toast.error(t("errorEliminar"));
    }

    setDeletingId(null);
    setConfirmDeleteId(null);
  };

  // ── Badge helpers ─────────────────────────────────────────────────────────
  const tipoBadge = (tipo: string) => ({
    descuento: "bg-blue-100 text-blue-700",
    promocion: "bg-purple-100 text-purple-700",
  }[tipo] ?? "bg-gray-100 text-gray-600");

  const estadoBadge = (estado: string) => ({
    activa:    "bg-emerald-100 text-emerald-700",
    expirada:  "bg-gray-100 text-gray-500",
  }[estado] ?? "bg-gray-100 text-gray-500");

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("titulo")}</h1>
          <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={openCrear}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-white
                     text-sm font-roboto font-semibold hover:bg-secondary/90 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t("crearBtn")}</span>
        </button>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center text-center py-12">
            <p className="text-sm font-roboto text-red-500">{t("errorCargar")}</p>
          </div>
        ) : beneficios.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 space-y-3">
            <Gift className="w-14 h-14 text-gray-200" />
            <p className="text-base font-poppins font-semibold text-gray-500">{t("empty")}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/60">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-12" />
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldTitulo")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldTipo")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldEstado")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldVigencia")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldEmpresas")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldCreadoPor")}
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {beneficios.map((b) => {
                    const isConfirming = confirmDeleteId === b.id;
                    const isDeleting   = deletingId === b.id;

                    return (
                      <tr
                        key={b.id}
                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => setDetailBeneficio(b)}
                      >
                        {/* Thumbnail */}
                        <td className="px-5 py-3.5">
                          {b.beneficio_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={b.beneficio_image_url}
                              alt={b.titulo}
                              className="w-8 h-8 rounded-lg object-cover border border-gray-100"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-gray-300" />
                            </div>
                          )}
                        </td>
                        {/* Título */}
                        <td className="px-4 py-3.5">
                          <p className="font-poppins font-medium text-gray-900 truncate max-w-[180px]">{b.titulo}</p>
                        </td>
                        {/* Tipo */}
                        <td className="px-4 py-3.5">
                          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", tipoBadge(b.tipo_beneficio))}>
                            {b.tipo_beneficio === "descuento" ? t("tipoBadgeDescuento") : t("tipoBadgePromocion")}
                          </span>
                        </td>
                        {/* Estado */}
                        <td className="px-4 py-3.5">
                          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", estadoBadge(b.estado_beneficio))}>
                            {b.estado_beneficio === "activa" ? t("estadoBadgeActiva") : t("estadoBadgeExpirada")}
                          </span>
                        </td>
                        {/* Vigencia */}
                        <td className="px-4 py-3.5 font-roboto text-xs text-gray-600 whitespace-nowrap">
                          {formatDate(b.fecha_inicio)} – {formatDate(b.fecha_fin)}
                        </td>
                        {/* Empresas */}
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-roboto text-gray-600">
                            {!b.empresa_id || b.empresa_id.length === 0
                              ? t("empresasGlobal")
                              : t("empresasCount", { count: b.empresa_id.length })}
                          </span>
                        </td>
                        {/* Creado por */}
                        <td className="px-4 py-3.5 font-roboto text-xs text-gray-500 truncate max-w-[120px]">
                          {b.creado_por_user?.nombre_completo ?? "—"}
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          {isConfirming ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-600 font-medium font-roboto whitespace-nowrap">
                                {t("confirmarEliminar")}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDelete(b.id)}
                                disabled={isDeleting}
                                className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
                              >
                                {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : t("siEliminar")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-roboto text-gray-600 hover:bg-gray-50"
                              >
                                {t("cancelar")}
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditar(b)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                                title={t("editarBtn")}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(b.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title={t("eliminarBtn")}
                              >
                                <Trash2 className="w-4 h-4" />
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
              {beneficios.map((b) => {
                const isConfirming = confirmDeleteId === b.id;
                const isDeleting   = deletingId === b.id;

                return (
                  <div
                    key={b.id}
                    className="px-4 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
                    onClick={() => setDetailBeneficio(b)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Thumbnail */}
                      {b.beneficio_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.beneficio_image_url}
                          alt={b.titulo}
                          className="shrink-0 w-10 h-10 rounded-xl object-cover border border-gray-100"
                        />
                      ) : (
                        <div className="shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-gray-300" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-poppins font-semibold text-gray-900 truncate">{b.titulo}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", tipoBadge(b.tipo_beneficio))}>
                            {b.tipo_beneficio === "descuento" ? t("tipoBadgeDescuento") : t("tipoBadgePromocion")}
                          </span>
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", estadoBadge(b.estado_beneficio))}>
                            {b.estado_beneficio === "activa" ? t("estadoBadgeActiva") : t("estadoBadgeExpirada")}
                          </span>
                          <span className="text-[10px] font-roboto text-gray-500 px-2 py-0.5">
                            {!b.empresa_id || b.empresa_id.length === 0 ? t("empresasGlobal") : t("empresasCount", { count: b.empresa_id.length })}
                          </span>
                        </div>
                        <p className="text-[10px] font-roboto text-gray-400">
                          {formatDate(b.fecha_inicio)} – {formatDate(b.fecha_fin)}
                        </p>
                      </div>
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        {isConfirming ? (
                          <div className="flex flex-col gap-1.5 items-end">
                            <button
                              type="button"
                              onClick={() => handleDelete(b.id)}
                              disabled={isDeleting}
                              className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50"
                            >
                              {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : t("siEliminar")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-600"
                            >
                              {t("cancelar")}
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => openEditar(b)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(b.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
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
      <BeneficioDetailModal
        open={detailBeneficio !== null}
        beneficio={detailBeneficio}
        onClose={() => setDetailBeneficio(null)}
      />

      {/* Create / Edit modal */}
      <BeneficioFormModal
        open={formOpen}
        mode={editingBeneficio ? "editar" : "crear"}
        beneficio={editingBeneficio}
        empresas={empresas}
        createdBy={userId}
        onClose={() => { setFormOpen(false); setEditingBeneficio(null); }}
        onSaved={handleSaved}
      />
    </div>
  );
}
