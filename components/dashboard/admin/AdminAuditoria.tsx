"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import AdminAuditoriaFiltros, { type AuditoriaFiltros } from "./AdminAuditoriaFiltros";
import AdminAuditoriaTabla, { type AuditLogRow } from "./AdminAuditoriaTabla";

const PAGE_SIZE = 25;
const DEBOUNCE_MS = 300;

const FILTROS_INICIAL: AuditoriaFiltros = {
  accion:      "",
  entidad:     "",
  actorSearch: "",
  desde:       "",
  hasta:       "",
};

function buildUrl(filtros: AuditoriaFiltros, page: number, format: "json" | "csv"): string {
  const sp = new URLSearchParams();
  if (filtros.accion)      sp.set("accion",       filtros.accion);
  if (filtros.entidad)     sp.set("entidad",      filtros.entidad);
  if (filtros.actorSearch) sp.set("actor_search", filtros.actorSearch);
  if (filtros.desde)       sp.set("desde",        filtros.desde);
  if (filtros.hasta)       sp.set("hasta",        filtros.hasta);
  sp.set("page",      String(page));
  sp.set("page_size", String(PAGE_SIZE));
  sp.set("format",    format);
  return `/api/admin/audit-logs?${sp.toString()}`;
}

export default function AdminAuditoria() {
  const t = useTranslations("Dashboard.admin.auditoria");

  const [filtros,    setFiltros]    = useState<AuditoriaFiltros>(FILTROS_INICIAL);
  const [page,       setPage]       = useState(0);
  const [logs,       setLogs]       = useState<AuditLogRow[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [exporting,  setExporting]  = useState(false);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = useCallback(async (f: AuditoriaFiltros, p: number) => {
    setLoading(true);
    try {
      const res  = await fetch(buildUrl(f, p, "json"));
      if (!res.ok) throw new Error();
      const json = await res.json() as { logs: AuditLogRow[]; total: number };
      setLogs(json.logs);
      setTotal(json.total);
    } catch {
      toast.error(t("errorCarga"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Initial load
  useEffect(() => {
    fetchLogs(filtros, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch on page change (not debounced)
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchLogs(filtros, newPage);
  };

  // Re-fetch on filter change (debounced for text fields)
  const handleFiltroChange = (key: keyof AuditoriaFiltros, value: string) => {
    const next = { ...filtros, [key]: value };
    setFiltros(next);
    setPage(0);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchLogs(next, 0);
    }, key === "actorSearch" ? DEBOUNCE_MS : 0);
  };

  const handleLimpiar = () => {
    setFiltros(FILTROS_INICIAL);
    setPage(0);
    fetchLogs(FILTROS_INICIAL, 0);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const url  = buildUrl(filtros, 0, "csv");
      const res  = await fetch(url);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = href;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      toast.error(t("errorCarga"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-secondary" />
        </div>
        <div>
          <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("titulo")}</h1>
          <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitulo")}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <AdminAuditoriaFiltros
          filtros={filtros}
          exporting={exporting}
          onFiltroChange={handleFiltroChange}
          onLimpiar={handleLimpiar}
          onExportCsv={handleExportCsv}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-5">
        <AdminAuditoriaTabla
          logs={logs}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={loading}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
}
