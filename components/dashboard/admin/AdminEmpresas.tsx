"use client";

/**
 * AdminEmpresas — Full CRUD for empresas (Step 7.7).
 *
 * Server-side pagination (20/page). Filters: nombre search (debounced 300ms), estado dropdown.
 * Rows navigate to /admin/empresas/[id] (split-pane detail). Toggle estado inline with confirm (no delete exposed).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { formatDateShortNI } from "@/lib/datetime";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  Search,
  Pencil,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type EmpresaRow = {
  id:                  string;
  nombre:              string;
  codigo_empresa:      string | null;
  notas:               string | null;
  auto_confirmar_citas: boolean;
  estado:              "activa" | "inactiva";
  ruc:                 string | null;
  direccion_calle:     string | null;
  departamento:        string | null;
  created_at:          string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function formatDate(iso: string, locale: "es" | "en"): string {
  return formatDateShortNI(iso, locale);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2 py-3 animate-pulse">
          <div className="flex-1 h-3 bg-gray-200 rounded" />
          <div className="w-28 h-3 bg-gray-200 rounded font-mono" />
          <div className="w-16 h-5 bg-gray-200 rounded-full" />
          <div className="w-12 h-5 bg-gray-200 rounded-full" />
          <div className="w-24 h-3 bg-gray-200 rounded" />
          <div className="flex gap-2">
            <div className="w-7 h-7 bg-gray-200 rounded-lg" />
            <div className="w-20 h-7 bg-gray-200 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── CodigoCell — copy to clipboard ────────────────────────────────────────────

function CodigoCell({ codigo }: { codigo: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!codigo) return;
    await navigator.clipboard.writeText(codigo);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!codigo) return <span className="text-gray-300">—</span>;

  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-xs text-gray-700">{codigo}</span>
      <button
        onClick={handleCopy}
        className="p-1 rounded text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
        title="Copiar"
      >
        {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      </button>
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  userId: string;
}

export default function AdminEmpresas({ userId: _userId }: Props) {
  const t      = useTranslations("Dashboard.admin.empresas");
  const locale = useLocale() as "es" | "en";
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const activeId = params?.id ?? null;

  // ── Data state ─────────────────────────────────────────────────────────────
  const [empresas,   setEmpresas]   = useState<EmpresaRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [page,  setPage]  = useState(0);
  const pageRef = useRef(0);
  pageRef.current = page;

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterEstado, setFilterEstado] = useState("");
  const [searchRaw,    setSearchRaw]    = useState("");
  const [searchQ,      setSearchQ]      = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearchRaw(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQ(val);
      setPage(0);
    }, 300);
  };

  // ── Toggle estado confirm ──────────────────────────────────────────────────
  const [toggleConfirmId, setToggleConfirmId] = useState<string | null>(null);
  const [togglingId,      setTogglingId]      = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchEmpresas = useCallback(async () => {
    setLoading(true);
    setError(false);
    const offset = pageRef.current * PAGE_SIZE;

    let query = createClient()
      .from("empresas")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (filterEstado) query = query.eq("estado", filterEstado);
    if (searchQ.trim()) query = query.ilike("nombre", `%${searchQ.trim()}%`);

    const { data, count, error: fetchError } = await query;
    if (fetchError) {
      setError(true);
    } else {
      setEmpresas((data ?? []) as EmpresaRow[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [filterEstado, searchQ]);

  useEffect(() => { fetchEmpresas(); }, [fetchEmpresas, page]);

  const handleFilterEstadoChange = (val: string) => { setFilterEstado(val); setPage(0); };

  // ── Pagination helpers ─────────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const fromItem   = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const toItem     = Math.min((page + 1) * PAGE_SIZE, totalCount);

  // Toggle estado inline
  const handleToggleEstado = async (empresa: EmpresaRow) => {
    // Deactivating requires confirm first
    if (empresa.estado === "activa" && toggleConfirmId !== empresa.id) {
      setToggleConfirmId(empresa.id);
      return;
    }
    setTogglingId(empresa.id);
    setToggleConfirmId(null);
    const nuevoEstado = empresa.estado === "activa" ? "inactiva" : "activa";
    const res = await fetch(`/api/admin/empresas/${empresa.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado }),
    });

    if (res.ok) {
      setEmpresas((prev) =>
        prev.map((e) => (e.id === empresa.id ? { ...e, estado: nuevoEstado } : e)),
      );
      toast.success(nuevoEstado === "activa" ? t("activado") : t("desactivado"));
    } else {
      toast.error(t("errorGuardar"));
    }
    setTogglingId(null);
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
            <Building2 className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h1 className="text-xl font-poppins font-bold text-gray-900">{t("titulo")}</h1>
            <p className="text-sm font-roboto text-neutral">{t("subtitle")}</p>
          </div>
        </div>
        <Link
          href={`/${locale}/dashboard/admin/empresas/nuevo`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-roboto font-medium hover:bg-secondary/90 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t("crearBtn")}
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchRaw}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-roboto text-gray-800 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors"
            />
            {searchRaw && (
              <button
                onClick={() => { setSearchRaw(""); setSearchQ(""); setPage(0); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Estado dropdown */}
          <select
            value={filterEstado}
            onChange={(e) => handleFilterEstadoChange(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-700 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors min-w-[150px]"
          >
            <option value="">{t("filterTodosEstados")}</option>
            <option value="activa">{t("estadoActiva")}</option>
            <option value="inactiva">{t("estadoInactiva")}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="p-8 text-center text-sm font-roboto text-red-500">{t("errorCargar")}</div>
        ) : empresas.length === 0 ? (
          <div className="p-8 text-center text-sm font-roboto text-gray-400">
            {filterEstado || searchQ ? t("emptyFilter") : t("empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls}>{t("colNombre")}</th>
                  <th className={thCls}>{t("colCodigo")}</th>
                  <th className={thCls}>{t("colEstado")}</th>
                  <th className={thCls}>{t("colAutoConf")}</th>
                  <th className={thCls}>{t("colCreado")}</th>
                  <th className={cn(thCls, "text-right")}>{t("colAcciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {empresas.map((empresa) => (
                  <tr
                    key={empresa.id}
                    data-active={empresa.id === activeId ? "true" : undefined}
                    className="hover:bg-gray-50/60 transition-colors cursor-pointer data-[active=true]:bg-primary/5 data-[active=true]:border-l-2 data-[active=true]:border-primary"
                    onClick={() => {
                      if (toggleConfirmId === empresa.id) return;
                      setToggleConfirmId(null);
                      router.push(`/${locale}/dashboard/admin/empresas/${empresa.id}`);
                    }}
                  >
                    {/* Nombre */}
                    <td className={cn(tdCls, "font-medium text-gray-900 max-w-[200px] truncate")}>
                      {empresa.nombre}
                    </td>

                    {/* Código */}
                    <td className={tdCls}>
                      <CodigoCell codigo={empresa.codigo_empresa} />
                    </td>

                    {/* Estado badge */}
                    <td className={tdCls}>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          empresa.estado === "activa"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500",
                        )}
                      >
                        {empresa.estado === "activa" ? t("estadoActiva") : t("estadoInactiva")}
                      </span>
                    </td>

                    {/* Auto confirmar chip */}
                    <td className={tdCls}>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          empresa.auto_confirmar_citas
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-500",
                        )}
                      >
                        {empresa.auto_confirmar_citas ? t("autoConfSi") : t("autoConfNo")}
                      </span>
                    </td>

                    {/* Created at */}
                    <td className={cn(tdCls, "text-gray-500 whitespace-nowrap")}>
                      {formatDate(empresa.created_at, locale)}
                    </td>

                    {/* Actions */}
                    <td className={cn(tdCls, "text-right")} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit */}
                        <Link
                          href={`/${locale}/dashboard/admin/empresas/${empresa.id}/editar`}
                          title={t("editarBtn")}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>

                        {/* Toggle estado */}
                        {toggleConfirmId === empresa.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="flex items-center gap-1 text-xs text-amber-600 font-roboto">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {t("toggleConfirm")}
                            </span>
                            <button
                              onClick={() => handleToggleEstado(empresa)}
                              disabled={!!togglingId}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            >
                              {t("siDesactivar")}
                            </button>
                            <button
                              onClick={() => setToggleConfirmId(null)}
                              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleToggleEstado(empresa)}
                            disabled={!!togglingId}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50",
                              empresa.estado === "activa"
                                ? "text-red-500 hover:bg-red-50 border border-red-100"
                                : "text-emerald-600 hover:bg-emerald-50 border border-emerald-100",
                            )}
                          >
                            {togglingId === empresa.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : empresa.estado === "activa" ? (
                              t("desactivarBtn")
                            ) : (
                              t("activarBtn")
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

    </div>
  );
}
