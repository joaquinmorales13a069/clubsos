"use client";

/**
 * AdminEmpresas — Full CRUD for empresas (Step 7.7).
 *
 * Server-side pagination (20/page). Filters: nombre search (debounced 300ms), estado dropdown.
 * EmpresaFormModal handles create/edit. Toggle estado inline with confirm (no delete exposed).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
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
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const PAGE_SIZE   = 20;
const CODE_CHARS  = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

const DEPARTAMENTOS_NI = [
  "Boaco", "Carazo", "Chinandega", "Chontales", "Estelí", "Granada",
  "Jinotega", "León", "Madriz", "Managua", "Masaya", "Matagalpa",
  "Nueva Segovia", "Río San Juan", "Rivas",
  "RACN (Costa Caribe Norte)", "RACS (Costa Caribe Sur)",
] as const;

function generateCodigo(): string {
  return Array.from(
    { length: CODE_LENGTH },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
  ).join("");
}

function formatDate(iso: string): string {
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

// ── EmpresaFormModal ──────────────────────────────────────────────────────────

interface FormModalProps {
  open:    boolean;
  empresa: EmpresaRow | null; // null = create mode
  onClose: () => void;
  onCreated: (e: EmpresaRow) => void;
  onUpdated: (e: EmpresaRow) => void;
}

function EmpresaFormModal({ open, empresa, onClose, onCreated, onUpdated }: FormModalProps) {
  const t      = useTranslations("Dashboard.admin.empresas");
  const isEdit = !!empresa;

  const [nombre,       setNombre]       = useState("");
  const [codigo,       setCodigo]       = useState("");
  const [notas,        setNotas]        = useState("");
  const [autoConf,     setAutoConf]     = useState(false);
  const [estado,       setEstado]       = useState<"activa" | "inactiva">("activa");
  const [ruc,          setRuc]          = useState("");
  const [dirCalle,     setDirCalle]     = useState("");
  const [departamento, setDepartamento] = useState("");
  const [saving,       setSaving]       = useState(false);
  const [regenConfirm, setRegenConfirm] = useState(false);

  // Populate form on open
  useEffect(() => {
    if (open) {
      setNombre(empresa?.nombre ?? "");
      setCodigo(empresa?.codigo_empresa ?? generateCodigo());
      setNotas(empresa?.notas ?? "");
      setAutoConf(empresa?.auto_confirmar_citas ?? false);
      setEstado(empresa?.estado ?? "activa");
      setRuc(empresa?.ruc ?? "");
      setDirCalle(empresa?.direccion_calle ?? "");
      setDepartamento(empresa?.departamento ?? "");
      setRegenConfirm(false);
    }
  }, [open, empresa]);

  const handleRegen = () => {
    if (!regenConfirm) { setRegenConfirm(true); return; }
    setCodigo(generateCodigo());
    setRegenConfirm(false);
  };

  const handleSave = async () => {
    if (!nombre.trim() || codigo.trim().length < 4) return;
    setSaving(true);

    const payload = {
      nombre:               nombre.trim(),
      codigo_empresa:       codigo.trim().toUpperCase(),
      notas:                notas.trim() || null,
      auto_confirmar_citas: autoConf,
      ruc:                  ruc.trim() || null,
      direccion_calle:      dirCalle.trim() || null,
      departamento:         departamento || null,
      ...(isEdit ? { estado } : {}),
    };

    if (isEdit && empresa) {
      const res = await fetch(`/api/admin/empresas/${empresa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(t("errorGuardar"));
      } else {
        onUpdated(json.empresa as EmpresaRow);
        toast.success(t("actualizado"));
        onClose();
      }
    } else {
      const res = await fetch("/api/admin/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(t("errorGuardar"));
      } else {
        onCreated(json.empresa as EmpresaRow);
        toast.success(t("creado"));
        onClose();
      }
    }
    setSaving(false);
  };

  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1 font-roboto";
  const notasLen = notas.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-poppins font-semibold text-gray-900">
            {isEdit ? t("editarTitulo") : t("crearTitulo")}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Nombre */}
          <div>
            <label className={labelCls}>{t("fieldNombre")} *</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={inputCls}
              maxLength={120}
              placeholder={t("fieldNombrePlaceholder")}
            />
          </div>

          {/* Código empresa */}
          <div>
            <label className={labelCls}>{t("fieldCodigo")} *</label>
            <div className="flex gap-2">
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                className={cn(inputCls, "font-mono flex-1")}
                maxLength={32}
                placeholder="XXXXXXXX"
              />
              <button
                onClick={handleRegen}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap",
                  regenConfirm
                    ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                    : "bg-white border-gray-200 text-gray-600 hover:border-secondary/40 hover:text-secondary",
                )}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {regenConfirm ? t("regenConfirmar") : t("regenBtn")}
              </button>
            </div>
            {regenConfirm && (
              <p className="mt-1 text-xs text-amber-600 font-roboto">{t("regenWarning")}</p>
            )}
          </div>

          {/* RUC */}
          <div>
            <label className={labelCls}>{t("fieldRuc")}</label>
            <input
              value={ruc}
              onChange={(e) => setRuc(e.target.value)}
              className={inputCls}
              maxLength={20}
              placeholder={t("fieldRucPlaceholder")}
            />
          </div>

          {/* Dirección */}
          <div className="space-y-3">
            <label className={labelCls}>{t("fieldDireccion")}</label>
            <input
              value={dirCalle}
              onChange={(e) => setDirCalle(e.target.value)}
              className={inputCls}
              maxLength={255}
              placeholder={t("fieldDireccionCallePlaceholder")}
            />
            <select
              value={departamento}
              onChange={(e) => setDepartamento(e.target.value)}
              className={inputCls}
            >
              <option value="">{t("fieldDepartamentoPlaceholder")}</option>
              {DEPARTAMENTOS_NI.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Auto confirmar */}
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <button
              role="switch"
              aria-checked={autoConf}
              onClick={() => setAutoConf((v) => !v)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
                autoConf ? "bg-secondary" : "bg-gray-300",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  autoConf ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
            <div>
              <p className="text-sm font-medium text-gray-800 font-roboto">{t("fieldAutoConf")}</p>
              <p className="text-xs text-gray-500 font-roboto mt-0.5">{t("fieldAutoConfDesc")}</p>
            </div>
          </div>

          {/* Estado — edit only */}
          {isEdit && (
            <div>
              <label className={labelCls}>{t("fieldEstado")}</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as "activa" | "inactiva")}
                className={inputCls}
              >
                <option value="activa">{t("estadoActiva")}</option>
                <option value="inactiva">{t("estadoInactiva")}</option>
              </select>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className={labelCls}>{t("fieldNotas")}</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className={cn(inputCls, "resize-none h-24")}
              maxLength={1000}
              placeholder={t("fieldNotasPlaceholder")}
            />
            <p className="mt-0.5 text-right text-xs text-gray-400">{notasLen}/1000</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/60">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-roboto text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {t("cancelar")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !nombre.trim() || codigo.trim().length < 4}
            className="px-5 py-2 rounded-xl text-sm font-roboto font-medium bg-secondary text-white hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? t("guardando") : t("guardarBtn")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  userId: string;
}

export default function AdminEmpresas({ userId: _userId }: Props) {
  const t = useTranslations("Dashboard.admin.empresas");

  // ── Data state ─────────────────────────────────────────────────────────────
  const [empresas,   setEmpresas]   = useState<EmpresaRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [page,    setPage]    = useState(0);
  const [refresh, setRefresh] = useState(0);
  const pageRef   = useRef(0);
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

  // ── Modal ──────────────────────────────────────────────────────────────────
  const [formOpen,    setFormOpen]    = useState(false);
  const [editEmpresa, setEditEmpresa] = useState<EmpresaRow | null>(null);

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

  useEffect(() => { fetchEmpresas(); }, [fetchEmpresas, page, refresh]);

  const handleFilterEstadoChange = (val: string) => { setFilterEstado(val); setPage(0); };

  // ── Pagination helpers ─────────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const fromItem   = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const toItem     = Math.min((page + 1) * PAGE_SIZE, totalCount);

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  const handleCreated = (e: EmpresaRow) => {
    setTotalCount((n) => n + 1);
    setRefresh((n) => n + 1);
  };

  const handleUpdated = (updated: EmpresaRow) => {
    setEmpresas((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const openCreate = () => { setEditEmpresa(null); setFormOpen(true); };
  const openEdit   = (e: EmpresaRow) => { setEditEmpresa(e); setFormOpen(true); };

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
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-roboto font-medium hover:bg-secondary/90 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t("crearBtn")}
        </button>
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
                    className="hover:bg-gray-50/60 transition-colors"
                    // Dismiss toggle confirm on outside click
                    onClick={() => {
                      if (toggleConfirmId === empresa.id) return;
                      setToggleConfirmId(null);
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
                      {formatDate(empresa.created_at)}
                    </td>

                    {/* Actions */}
                    <td className={cn(tdCls, "text-right")} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit */}
                        <button
                          onClick={() => openEdit(empresa)}
                          title={t("editarBtn")}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

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

      {/* Form modal */}
      <EmpresaFormModal
        open={formOpen}
        empresa={editEmpresa}
        onClose={() => setFormOpen(false)}
        onCreated={handleCreated}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
