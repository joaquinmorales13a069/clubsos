"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BarChart3, Loader2, AlertCircle, RefreshCw, Filter, Info } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import AdminReportesCitas,      { type CitasReportData }      from "./AdminReportesCitas";
import AdminReportesUsuarios,   { type UsuariosReportData }   from "./AdminReportesUsuarios";
import AdminReportesEmpresas,   { type EmpresasReportData }   from "./AdminReportesEmpresas";
import AdminReportesDocumentos, { type DocumentosReportData } from "./AdminReportesDocumentos";
import AdminReportesBeneficios, { type BeneficiosReportData } from "./AdminReportesBeneficios";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "citas" | "usuarios" | "empresas" | "documentos" | "beneficios";

type Filters = {
  empresa_id: string;
  desde:      string;
  hasta:      string;
};

type EmpresaOption = { id: string; nombre: string };

type CacheEntry =
  | { tab: "citas";       data: CitasReportData }
  | { tab: "usuarios";    data: UsuariosReportData }
  | { tab: "empresas";    data: EmpresasReportData }
  | { tab: "documentos";  data: DocumentosReportData }
  | { tab: "beneficios";  data: BeneficiosReportData };

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRpcParams(tab: TabId, filters: Filters) {
  const params: Record<string, string | null> = {};

  if (tab === "empresas" || tab === "beneficios") return params;

  if (filters.empresa_id) params.p_empresa_id = filters.empresa_id;

  if (tab === "citas") {
    if (filters.desde) params.p_desde = `${filters.desde}T00:00:00Z`;
    if (filters.hasta) params.p_hasta = `${filters.hasta}T23:59:59Z`;
  }
  if (tab === "documentos") {
    if (filters.desde) params.p_desde = filters.desde;
    if (filters.hasta) params.p_hasta = filters.hasta;
  }

  return params;
}

function rpcName(tab: TabId): string {
  return `get_admin_report_${tab}`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ReporteSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-xl h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-gray-100 rounded-xl h-52" />
        <div className="bg-gray-100 rounded-xl h-52" />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminReportes() {
  const t = useTranslations("Dashboard.admin.reportes");

  const TABS: { id: TabId; label: string }[] = [
    { id: "citas",       label: t("tab_citas") },
    { id: "usuarios",    label: t("tab_usuarios") },
    { id: "empresas",    label: t("tab_empresas") },
    { id: "documentos",  label: t("tab_documentos") },
    { id: "beneficios",  label: t("tab_beneficios") },
  ];

  const [activeTab,      setActiveTab]      = useState<TabId>("citas");
  const [formFilters,    setFormFilters]    = useState<Filters>({ empresa_id: "", desde: "", hasta: "" });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({ empresa_id: "", desde: "", hasta: "" });
  const [empresaOptions, setEmpresaOptions] = useState<EmpresaOption[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(false);
  const [cachedData,     setCachedData]     = useState<CacheEntry | null>(null);

  const cacheRef = useRef<Map<TabId, CacheEntry>>(new Map());

  // Show empresa filter only for filterable tabs
  const showEmpresa    = activeTab !== "empresas" && activeTab !== "beneficios";
  const showDateRange  = activeTab === "citas" || activeTab === "documentos";

  // ── Load empresa options once ─────────────────────────────────────────────
  useEffect(() => {
    createClient()
      .from("empresas")
      .select("id, nombre")
      .eq("estado", "activa")
      .order("nombre")
      .then(({ data }) => {
        if (data) setEmpresaOptions(data as EmpresaOption[]);
      });
  }, []);

  // ── Fetch report for current tab ─────────────────────────────────────────
  const fetchTab = useCallback(async (tab: TabId, filters: Filters) => {
    const cached = cacheRef.current.get(tab);
    if (cached) {
      setCachedData(cached);
      return;
    }

    setLoading(true);
    setError(false);
    setCachedData(null);

    const supabase = createClient();
    const params   = buildRpcParams(tab, filters);

    const { data, error: rpcError } = await supabase.rpc(rpcName(tab), params as Record<string, never>);

    if (rpcError || !data) {
      toast.error(t("errorCargar"));
      setError(true);
      setLoading(false);
      return;
    }

    const entry = { tab, data } as CacheEntry;
    cacheRef.current.set(tab, entry);
    setCachedData(entry);
    setLoading(false);
  }, [t]);

  // Fetch when tab or applied filters change
  useEffect(() => {
    fetchTab(activeTab, appliedFilters);
  }, [activeTab, appliedFilters, fetchTab]);

  function handleApply() {
    cacheRef.current.clear();
    setAppliedFilters({ ...formFilters });
  }

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
  }

  // ── Render tab content ────────────────────────────────────────────────────

  function renderContent() {
    if (loading)    return <ReporteSkeleton />;
    if (error)      return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertCircle className="w-10 h-10 text-red-300" />
        <p className="text-sm font-roboto text-neutral/60">{t("errorCargar")}</p>
        <button
          type="button"
          onClick={() => fetchTab(activeTab, appliedFilters)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-roboto font-medium
                     border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t("reintentar")}
        </button>
      </div>
    );
    if (!cachedData) return null;

    if (cachedData.tab === "citas")
      return <AdminReportesCitas data={cachedData.data} />;
    if (cachedData.tab === "usuarios")
      return <AdminReportesUsuarios data={cachedData.data} empresaActiva={!!appliedFilters.empresa_id} />;
    if (cachedData.tab === "empresas")
      return <AdminReportesEmpresas data={cachedData.data} />;
    if (cachedData.tab === "documentos")
      return <AdminReportesDocumentos data={cachedData.data} />;
    if (cachedData.tab === "beneficios")
      return <AdminReportesBeneficios data={cachedData.data} />;
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/5">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-poppins font-bold text-xl text-gray-900">{t("titulo")}</h1>
          <p className="text-sm font-roboto text-neutral/60 mt-0.5">{t("subtitulo")}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100/70 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleTabChange(id)}
            className={cn(
              "px-4 py-2 text-sm font-roboto font-medium rounded-lg transition-colors",
              activeTab === id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-neutral/60 hover:text-gray-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <div className="flex items-start gap-2 px-1">
        <Info className="w-3.5 h-3.5 text-secondary/70 mt-0.5 shrink-0" />
        <p className="text-xs font-roboto text-neutral/70 leading-relaxed">
          {t(`desc_${activeTab}` as Parameters<typeof t>[0])}
        </p>
      </div>

      {/* Filter panel */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-sm font-roboto text-neutral/50 shrink-0">
            <Filter className="w-4 h-4" />
          </div>

          {showEmpresa && (
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-xs font-roboto text-neutral/60">{t("filtro_empresa")}</label>
              <select
                value={formFilters.empresa_id}
                onChange={(e) => setFormFilters((f) => ({ ...f, empresa_id: e.target.value }))}
                className="text-sm font-roboto border border-gray-200 rounded-lg px-3 py-2
                           bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30"
              >
                <option value="">{t("filtro_todas_empresas")}</option>
                {empresaOptions.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {showDateRange && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-roboto text-neutral/60">{t("filtro_desde")}</label>
                <input
                  type="date"
                  value={formFilters.desde}
                  onChange={(e) => setFormFilters((f) => ({ ...f, desde: e.target.value }))}
                  className="text-sm font-roboto border border-gray-200 rounded-lg px-3 py-2
                             bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-roboto text-neutral/60">{t("filtro_hasta")}</label>
                <input
                  type="date"
                  value={formFilters.hasta}
                  onChange={(e) => setFormFilters((f) => ({ ...f, hasta: e.target.value }))}
                  className="text-sm font-roboto border border-gray-200 rounded-lg px-3 py-2
                             bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30"
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={handleApply}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-roboto font-medium
                       bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t("aplicar_filtros")}
          </button>
        </div>
      </div>

      {/* Report content */}
      <div className="min-h-[300px]">
        {renderContent()}
      </div>
    </div>
  );
}
