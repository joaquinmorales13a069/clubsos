"use client";

/**
 * AdminDocumentos — Medical document management for global admin.
 *
 * Server-side pagination (20/page). Re-fetches on tipo_documento filter or page change.
 * Search is client-side over the current fetched page.
 *
 * Row click → navigates to /[id] detail panel.
 * Pencil icon → <Link href="/[id]/editar">.
 * "+ Subir documento" CTA → <Link href="/nuevo">.
 * Download/View buttons remain as inline actions (createSignedUrl).
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Search,
  Eye,
  Download,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type DocumentoRow = {
  id:               string;
  nombre_documento: string;
  tipo_documento:   string;
  tipo_archivo:     string | null;
  fecha_documento:  string | null;
  estado_archivo:   string;
  file_path:        string;
  created_at:       string;
  usuario: {
    nombre_completo:     string | null;
    documento_identidad: string | null;
    empresa_id:          string | null;
  } | null;
  subido_por_user: { nombre_completo: string | null } | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const BUCKET    = "documentos-medicos";

const TIPO_DOCUMENTO_OPTIONS = [
  "",
  "laboratorio",
  "radiologia",
  "consulta_medica",
  "especialidades",
  "receta",
  "otro",
] as const;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2 py-3 animate-pulse">
          <div className="flex-1 h-3 bg-gray-200 rounded" />
          <div className="w-24 h-5 bg-gray-200 rounded-full" />
          <div className="w-28 h-3 bg-gray-200 rounded" />
          <div className="w-20 h-3 bg-gray-200 rounded" />
          <div className="w-16 h-5 bg-gray-200 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  userId: string;
}

export default function AdminDocumentos({ userId }: Props) {
  const t      = useTranslations("Dashboard.admin.documentos");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  // Derive the active doc ID from the URL if possible
  const activeId = useMemo(() => {
    const match = pathname.match(/\/documentos\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [docs,       setDocs]       = useState<DocumentoRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);

  // ── Pagination + filter ───────────────────────────────────────────────────
  const [page,        setPage]        = useState(0);
  const [tipoFilter,  setTipoFilter]  = useState("");
  const [refresh,     setRefresh]     = useState(0);
  const pageRef = useRef(0);
  pageRef.current = page;

  // ── Client-side search ────────────────────────────────────────────────────
  const [search, setSearch] = useState("");

  // ── Delete confirm ────────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);

  // ── Fetch documents ───────────────────────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(false);
    const offset = pageRef.current * PAGE_SIZE;

    let query = createClient()
      .from("documentos_medicos")
      .select(
        `id, nombre_documento, tipo_documento, tipo_archivo, fecha_documento,
         estado_archivo, file_path, created_at,
         usuario:users!usuario_id(nombre_completo, documento_identidad, empresa_id),
         subido_por_user:users!subido_por(nombre_completo)`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (tipoFilter) query = query.eq("tipo_documento", tipoFilter);

    const { data, count, error: fetchError } = await query;
    if (fetchError) {
      setError(true);
    } else {
      setDocs((data ?? []) as unknown as DocumentoRow[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [tipoFilter]);

  useEffect(() => { fetchDocs(); }, [fetchDocs, page, refresh]);

  // Reset page on filter change
  const handleTipoChange = (val: string) => { setTipoFilter(val); setPage(0); };

  // ── Client-side search ────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    if (!search.trim()) return docs;
    const q = search.toLowerCase();
    return docs.filter((d) => {
      const nombre  = d.nombre_documento.toLowerCase();
      const usuario = d.usuario?.nombre_completo?.toLowerCase() ?? "";
      return nombre.includes(q) || usuario.includes(q);
    });
  }, [docs, search]);

  // ── Pagination helpers ────────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const fromItem   = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const toItem     = Math.min((page + 1) * PAGE_SIZE, totalCount);

  // ── Ver / Descargar via signed URL ────────────────────────────────────────
  const handleVer = async (e: React.MouseEvent, doc: DocumentoRow) => {
    e.stopPropagation();
    const { data, error: signErr } = await createClient().storage
      .from(BUCKET).createSignedUrl(doc.file_path, 300);
    if (signErr || !data?.signedUrl) { toast.error(t("errorSignedUrl")); return; }
    window.open(data.signedUrl, "_blank");
  };

  const handleDescargar = async (e: React.MouseEvent, doc: DocumentoRow) => {
    e.stopPropagation();
    const { data, error: signErr } = await createClient().storage
      .from(BUCKET).createSignedUrl(doc.file_path, 60);
    if (signErr || !data?.signedUrl) { toast.error(t("errorSignedUrl")); return; }
    const a = document.createElement("a");
    a.href     = data.signedUrl;
    a.download = doc.nombre_documento;
    a.click();
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    const supabase = createClient();
    const target   = docs.find((d) => d.id === id);

    if (target?.file_path) {
      await supabase.storage.from(BUCKET).remove([target.file_path]);
    }

    const { error: deleteErr } = await supabase.from("documentos_medicos").delete().eq("id", id);
    if (!deleteErr) {
      setDocs((prev) => prev.filter((d) => d.id !== id));
      setTotalCount((n) => n - 1);
      toast.success(t("eliminadoOk"));
      // If we were viewing the deleted doc, navigate back to list
      if (activeId === id) {
        router.push(`/${locale}/dashboard/admin/documentos`);
      }
    } else {
      toast.error(t("errorEliminar"));
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
  };

  const tipoBadgeColors: Record<string, string> = {
    laboratorio:     "bg-blue-100 text-blue-700",
    radiologia:      "bg-purple-100 text-purple-700",
    consulta_medica: "bg-teal-100 text-teal-700",
    especialidades:  "bg-orange-100 text-orange-700",
    receta:          "bg-rose-100 text-rose-700",
    otro:            "bg-gray-100 text-gray-600",
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("titulo")}</h1>
          <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
        </div>
        <Link
          href={`/${locale}/dashboard/admin/documentos/nuevo`}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-white
                     text-sm font-roboto font-semibold hover:bg-secondary/90 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t("subirBtn")}</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={tipoFilter}
          onChange={(e) => handleTipoChange(e.target.value)}
          className="sm:w-52 shrink-0 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors"
        >
          {TIPO_DOCUMENTO_OPTIONS.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo === "" ? t("filterTodos") : t(`tipo_${tipo}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors"
          />
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center text-center py-12">
            <p className="text-sm font-roboto text-red-500">{t("errorCargar")}</p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 space-y-3">
            <FileText className="w-14 h-14 text-gray-200" />
            <p className="text-base font-poppins font-semibold text-gray-500">
              {search || tipoFilter ? t("emptyFilter") : t("empty")}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/60">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("colNombre")}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("colTipo")}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("colUsuario")}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("colFecha")}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("colEstado")}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("colSubidoPor")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayed.map((doc) => {
                    const isConfirming = confirmDeleteId === doc.id;
                    const isDeleting   = deletingId      === doc.id;
                    const isActive     = activeId        === doc.id;
                    return (
                      <tr
                        key={doc.id}
                        data-active={isActive || undefined}
                        onClick={() => router.push(`/${locale}/dashboard/admin/documentos/${doc.id}`)}
                        className={cn(
                          "cursor-pointer hover:bg-gray-50/50 transition-colors",
                          isActive && "bg-secondary/5 border-l-2 border-l-secondary",
                        )}
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-poppins font-medium text-gray-900 truncate max-w-[160px]">{doc.nombre_documento}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", tipoBadgeColors[doc.tipo_documento] ?? tipoBadgeColors.otro)}>
                            {t(`tipo_${doc.tipo_documento}` as Parameters<typeof t>[0])}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-roboto text-gray-700 text-xs truncate max-w-[130px]">{doc.usuario?.nombre_completo ?? "—"}</p>
                          <p className="font-roboto text-gray-400 text-[10px] truncate max-w-[130px]">{doc.usuario?.documento_identidad ?? ""}</p>
                        </td>
                        <td className="px-4 py-3.5 font-roboto text-xs text-gray-600 whitespace-nowrap">{formatDate(doc.fecha_documento)}</td>
                        <td className="px-4 py-3.5">
                          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", doc.estado_archivo === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500")}>
                            {doc.estado_archivo === "activo" ? t("estadoActivo") : t("estadoInactivo")}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-roboto text-xs text-gray-500 truncate max-w-[110px]">{doc.subido_por_user?.nombre_completo ?? "—"}</td>
                        <td className="px-4 py-3.5">
                          {isConfirming ? (
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <span className="text-xs text-red-600 font-medium font-roboto whitespace-nowrap">{t("confirmarEliminar")}</span>
                              <button type="button" onClick={(e) => handleDelete(e, doc.id)} disabled={isDeleting}
                                className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50">
                                {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : t("siEliminar")}
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-roboto text-gray-600">
                                {t("cancelar")}
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <button type="button" onClick={(e) => handleVer(e, doc)} title={t("verBtn")}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors">
                                <Eye className="w-4 h-4" />
                              </button>
                              <button type="button" onClick={(e) => handleDescargar(e, doc)} title={t("descargarBtn")}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors">
                                <Download className="w-4 h-4" />
                              </button>
                              <Link
                                href={`/${locale}/dashboard/admin/documentos/${doc.id}/editar`}
                                title={t("editarBtn")}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </Link>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(doc.id); }} title={t("eliminarBtn")}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
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
              {displayed.map((doc) => {
                const isConfirming = confirmDeleteId === doc.id;
                const isDeleting   = deletingId      === doc.id;
                const isActive     = activeId        === doc.id;
                return (
                  <div
                    key={doc.id}
                    data-active={isActive || undefined}
                    onClick={() => router.push(`/${locale}/dashboard/admin/documentos/${doc.id}`)}
                    className={cn(
                      "px-4 py-4 cursor-pointer transition-colors",
                      isActive && "bg-secondary/5 border-l-2 border-l-secondary",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-purple-500" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-sm font-poppins font-semibold text-gray-900 truncate">{doc.nombre_documento}</p>
                        <p className="text-xs font-roboto text-neutral truncate">{doc.usuario?.nombre_completo ?? "—"}</p>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", tipoBadgeColors[doc.tipo_documento] ?? tipoBadgeColors.otro)}>
                            {t(`tipo_${doc.tipo_documento}` as Parameters<typeof t>[0])}
                          </span>
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", doc.estado_archivo === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500")}>
                            {doc.estado_archivo === "activo" ? t("estadoActivo") : t("estadoInactivo")}
                          </span>
                          <span className="text-[10px] font-roboto text-gray-400">{formatDate(doc.fecha_documento)}</span>
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col gap-1 items-end" onClick={(e) => e.stopPropagation()}>
                        {isConfirming ? (
                          <>
                            <button type="button" onClick={(e) => handleDelete(e, doc.id)} disabled={isDeleting}
                              className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50">
                              {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : t("siEliminar")}
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                              className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-600">
                              {t("cancelar")}
                            </button>
                          </>
                        ) : (
                          <div className="flex gap-0.5">
                            <button type="button" onClick={(e) => handleVer(e, doc)} className="p-1.5 rounded-lg text-gray-400 hover:text-secondary"><Eye className="w-4 h-4" /></button>
                            <button type="button" onClick={(e) => handleDescargar(e, doc)} className="p-1.5 rounded-lg text-gray-400 hover:text-secondary"><Download className="w-4 h-4" /></button>
                            <Link
                              href={`/${locale}/dashboard/admin/documentos/${doc.id}/editar`}
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-secondary"
                            >
                              <Pencil className="w-4 h-4" />
                            </Link>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(doc.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
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
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 text-sm font-roboto text-gray-600 hover:border-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-4 h-4" />{t("prevPage")}
            </button>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 text-sm font-roboto text-gray-600 hover:border-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {t("nextPage")}<ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
