"use client";

/**
 * AdminExcepcionesTabla — list view of schedule exceptions with filters.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeNI } from "@/lib/datetime";
import type { ExcepcionScope } from "@/app/[locale]/(dashboard)/dashboard/admin/excepciones/@detail/_components/ExcepcionForm";

interface ExcepcionRow {
  id:           string;
  doctor_id:    string | null;
  ubicacion_id: string | null;
  fecha_inicio: string;
  fecha_fin:    string;
  motivo:       string | null;
  doctor:       { id: string; nombre: string } | null | { id: string; nombre: string }[];
  ubicacion:    { id: string; nombre: string } | null | { id: string; nombre: string }[];
}

interface DoctorOption    { id: string; nombre: string; ubicacion_id: string | null }
interface UbicacionOption { id: string; nombre: string }

function pickOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function scopeOf(row: ExcepcionRow): ExcepcionScope {
  if (row.doctor_id && row.ubicacion_id) return "both";
  if (row.doctor_id)                      return "doctor";
  if (row.ubicacion_id)                   return "ubicacion";
  return "global";
}

const BADGE_BY_SCOPE: Record<ExcepcionScope, string> = {
  global:    "bg-red-100 text-red-700",
  ubicacion: "bg-purple-100 text-purple-700",
  doctor:    "bg-green-100 text-green-700",
  both:      "bg-blue-100 text-blue-700",
};

interface Props {
  doctores:    DoctorOption[];
  ubicaciones: UbicacionOption[];
  doctorFilter?:    string;
  ubicacionFilter?: string;
}

const PAGE_SIZE = 25;

export default function AdminExcepcionesTabla({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  doctores: _doctores, ubicaciones: _ubicaciones, doctorFilter, ubicacionFilter,
}: Props) {
  const t      = useTranslations("Dashboard.admin.excepciones");
  const locale = useLocale() as "es" | "en";
  const router = useRouter();

  const [rows, setRows]       = useState<ExcepcionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Local filters (additional to props from parent)
  const [scopeFilter, setScopeFilter] = useState<"all" | ExcepcionScope>("all");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (scopeFilter !== "all") sp.set("scope", scopeFilter);
      if (doctorFilter)    sp.set("doctor_id",    doctorFilter);
      if (ubicacionFilter) sp.set("ubicacion_id", ubicacionFilter);
      if (desde) sp.set("fecha_desde", desde);
      if (hasta) sp.set("fecha_hasta", hasta);
      const res = await fetch(`/api/admin/excepciones?${sp.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const j = await res.json() as { excepciones: ExcepcionRow[] };
      setRows(j.excepciones ?? []);
      setPage(0);
    } catch {
      setRows([]);
      toast.error(t("errorCargar"));
    } finally {
      setLoading(false);
    }
  }, [scopeFilter, doctorFilter, ubicacionFilter, desde, hasta, t]);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/excepciones/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      toast.success(t("toast.eliminado"));
      void load();
    } catch {
      toast.error(t("toast.errorEliminar"));
    } finally {
      setDeletingId(null);
    }
  }

  function handleRowClick(id: string) {
    router.push(`/${locale}/dashboard/admin/excepciones/${id}`);
  }

  const pageRows = useMemo(
    () => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [rows, page],
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const filterCls = "px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-700 focus:outline-none focus:ring-2 focus:ring-secondary/30";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("filter.scope")}</span>
          <select
            className={filterCls}
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as "all" | ExcepcionScope)}
          >
            <option value="all">{t("scope.all")}</option>
            <option value="global">{t("scope.global")}</option>
            <option value="doctor">{t("scope.doctor")}</option>
            <option value="ubicacion">{t("scope.ubicacion")}</option>
            <option value="both">{t("scope.doctorYUbicacion")}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("filter.desde")}</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={filterCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("filter.hasta")}</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={filterCls} />
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            {t("loading")}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm font-roboto text-gray-400">{t("empty")}</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2">{t("col.scope")}</th>
                  <th className="px-4 py-2">{t("col.doctor")}</th>
                  <th className="px-4 py-2">{t("col.ubicacion")}</th>
                  <th className="px-4 py-2">{t("col.inicio")}</th>
                  <th className="px-4 py-2">{t("col.fin")}</th>
                  <th className="px-4 py-2">{t("col.motivo")}</th>
                  <th className="px-4 py-2 text-right">{t("col.acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageRows.map((row) => {
                  const sc  = scopeOf(row);
                  const doc = pickOne(row.doctor);
                  const ubi = pickOne(row.ubicacion);
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleRowClick(row.id)}
                    >
                      <td className="px-4 py-2">
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-medium", BADGE_BY_SCOPE[sc])}>
                          {t(`scope.${sc === "both" ? "doctorYUbicacion" : sc}`)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{doc?.nombre ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-700">{ubi?.nombre ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-700">{formatDateTimeNI(row.fecha_inicio, locale)}</td>
                      <td className="px-4 py-2 text-gray-700">{formatDateTimeNI(row.fecha_fin, locale)}</td>
                      <td className="px-4 py-2 text-gray-700 truncate max-w-[200px]">{row.motivo ?? "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/${locale}/dashboard/admin/excepciones/${row.id}/editar`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                            aria-label={t("editBtn")}
                            title={t("editBtn")}
                          >
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(row.id)}
                            disabled={deletingId === row.id}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                            aria-label={t("deleteBtn")}
                            title={t("deleteBtn")}
                          >
                            {deletingId === row.id
                              ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                              : <Trash2 className="w-4 h-4" aria-hidden="true" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="px-4 py-3 flex items-center justify-between text-xs text-neutral border-t border-gray-100">
                <span>{page + 1} / {totalPages}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    aria-label={t("pag.prev")}
                    className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <span aria-hidden="true">←</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    aria-label={t("pag.next")}
                    className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
