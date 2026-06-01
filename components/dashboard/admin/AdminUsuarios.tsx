"use client";

/**
 * AdminUsuarios — Global user management for admin (Step 7.6).
 *
 * Server-side pagination (20/page). Filters: empresa, estado, rol, search (debounced 300ms).
 * Row click navigates to /@detail/[id]. Pencil icon navigates to /@detail/[id]/editar.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  UserCog,
  Search,
  Pencil,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type UsuarioRow = {
  id:                  string;
  nombre_completo:     string;
  email:               string | null;
  telefono:            string | null;
  rol:                 "admin" | "empresa_admin" | "miembro";
  tipo_cuenta:         "titular" | "familiar";
  estado:              "activo" | "inactivo" | "pendiente";
  documento_identidad: string | null;
  empresa_id:          string | null;
  titular_id:          string | null;
  created_at:          string;
  empresa:             { nombre: string } | null;
};

type EmpresaOption = { id: string; nombre: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const ESTADO_OPTIONS = ["activo", "inactivo", "pendiente"] as const;
const ROL_OPTIONS    = ["miembro", "empresa_admin"] as const;

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2 py-3 animate-pulse">
          <div className="flex-1 h-3 bg-gray-200 rounded" />
          <div className="w-24 h-5 bg-gray-200 rounded-full" />
          <div className="w-20 h-5 bg-gray-200 rounded-full" />
          <div className="w-16 h-5 bg-gray-200 rounded-full" />
          <div className="w-28 h-3 bg-gray-200 rounded" />
          <div className="w-6 h-6 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

function RolBadge({ rol, t }: { rol: string; t: ReturnType<typeof useTranslations> }) {
  const colors: Record<string, string> = {
    admin:         "bg-red-100 text-red-700",
    empresa_admin: "bg-orange-100 text-orange-700",
    miembro:       "bg-gray-100 text-gray-600",
  };
  const labels: Record<string, string> = {
    admin:         t("rolAdmin"),
    empresa_admin: t("rolEmpresaAdmin"),
    miembro:       t("rolMiembro"),
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", colors[rol] ?? "bg-gray-100 text-gray-600")}>
      {labels[rol] ?? rol}
    </span>
  );
}

function EstadoBadge({ estado, t }: { estado: string; t: ReturnType<typeof useTranslations> }) {
  const colors: Record<string, string> = {
    activo:    "bg-emerald-100 text-emerald-700",
    inactivo:  "bg-red-100 text-red-700",
    pendiente: "bg-amber-100 text-amber-700",
  };
  const labels: Record<string, string> = {
    activo:    t("estadoActivo"),
    inactivo:  t("estadoInactivo"),
    pendiente: t("estadoPendiente"),
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", colors[estado] ?? "bg-gray-100 text-gray-600")}>
      {labels[estado] ?? estado}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  userId: string;
}

export default function AdminUsuarios({ userId: _userId }: Props) {
  const t = useTranslations("Dashboard.admin.usuarios");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const activeId = (params?.id as string | undefined) ?? null;

  // ── Data state ─────────────────────────────────────────────────────────────
  const [usuarios,   setUsuarios]   = useState<UsuarioRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);
  const [empresas,   setEmpresas]   = useState<EmpresaOption[]>([]);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [page, setPage] = useState(0);
  const pageRef         = useRef(0);
  pageRef.current       = page;

  // ── Filters (server-side) ──────────────────────────────────────────────────
  const [filterEmpresa, setFilterEmpresa] = useState("");
  const [filterEstado,  setFilterEstado]  = useState("");
  const [filterRol,     setFilterRol]     = useState("");
  const [searchRaw,     setSearchRaw]     = useState("");
  const [searchQ,       setSearchQ]       = useState("");

  // Debounce search 300 ms
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearchRaw(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQ(val);
      setPage(0);
    }, 300);
  };

  // ── Fetch empresas once ────────────────────────────────────────────────────
  useEffect(() => {
    createClient()
      .from("empresas")
      .select("id, nombre")
      .order("nombre")
      .then(({ data }) => setEmpresas((data ?? []) as EmpresaOption[]));
  }, []);

  // ── Fetch usuarios ─────────────────────────────────────────────────────────
  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    setError(false);
    const offset = pageRef.current * PAGE_SIZE;

    let query = createClient()
      .from("users")
      .select("*, empresa:empresas!empresa_id(nombre)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (filterEmpresa) query = query.eq("empresa_id", filterEmpresa);
    if (filterEstado)  query = query.eq("estado",     filterEstado);
    if (filterRol)     query = query.eq("rol",         filterRol);
    if (searchQ.trim()) {
      const q = searchQ.trim();
      query = query.or(`nombre_completo.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data, count, error: fetchError } = await query;
    if (fetchError) {
      setError(true);
    } else {
      setUsuarios((data ?? []) as unknown as UsuarioRow[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [filterEmpresa, filterEstado, filterRol, searchQ]);

  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios, page]);

  // Reset page on filter change
  const handleFilterChange = (setter: (v: string) => void) => (val: string) => {
    setter(val);
    setPage(0);
  };

  // ── Pagination helpers ─────────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const fromItem   = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const toItem     = Math.min((page + 1) * PAGE_SIZE, totalCount);

  // ── Table column styles ───────────────────────────────────────────────────
  const thCls = "px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap";
  const tdCls = "px-4 py-3 text-sm font-roboto text-gray-800 align-middle";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
            <UserCog className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h1 className="text-xl font-poppins font-bold text-gray-900">{t("titulo")}</h1>
            <p className="text-sm font-roboto text-neutral">{t("subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchRaw}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-roboto text-gray-800 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors"
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

        {/* Dropdowns row */}
        <div className="flex flex-wrap gap-3">
          {/* Empresa */}
          <select
            value={filterEmpresa}
            onChange={(e) => handleFilterChange(setFilterEmpresa)(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-700 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors min-w-[160px]"
          >
            <option value="">{t("filterTodasEmpresas")}</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>

          {/* Rol */}
          <select
            value={filterRol}
            onChange={(e) => handleFilterChange(setFilterRol)(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-700 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors min-w-[140px]"
          >
            <option value="">{t("filterTodosRoles")}</option>
            {ROL_OPTIONS.map((r) => (
              <option key={r} value={r}>{t(`filterRol_${r}`)}</option>
            ))}
          </select>

          {/* Estado chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {(["", ...ESTADO_OPTIONS] as const).map((est) => (
              <button
                key={est}
                onClick={() => handleFilterChange(setFilterEstado)(est)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                  filterEstado === est
                    ? "bg-secondary text-white border-secondary"
                    : "bg-white text-gray-600 border-gray-200 hover:border-secondary/40",
                )}
              >
                {est === "" ? t("filterTodosEstados") : t(`filterEstado_${est}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="p-8 text-center text-sm font-roboto text-red-500">{t("errorCargar")}</div>
        ) : usuarios.length === 0 ? (
          <div className="p-8 text-center text-sm font-roboto text-gray-400">
            {filterEmpresa || filterEstado || filterRol || searchQ ? t("emptyFilter") : t("empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls}>{t("colNombre")}</th>
                  <th className={thCls}>{t("colEmpresa")}</th>
                  <th className={thCls}>{t("colRol")}</th>
                  <th className={thCls}>{t("colTipoCuenta")}</th>
                  <th className={thCls}>{t("colEstado")}</th>
                  <th className={thCls}>{t("colTelefono")}</th>
                  <th className={thCls}>{t("colEmail")}</th>
                  <th className={cn(thCls, "text-right")}>{t("colAcciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {usuarios.map((u) => (
                  <tr
                    key={u.id}
                    data-active={u.id === activeId ? "true" : undefined}
                    onClick={() => router.push(`/${locale}/dashboard/admin/usuarios/${u.id}`)}
                    className="hover:bg-gray-50/60 data-[active=true]:bg-primary/5 data-[active=true]:border-l-2 data-[active=true]:border-primary cursor-pointer transition-colors"
                  >
                    <td className={cn(tdCls, "font-medium text-gray-900 max-w-[180px] truncate")}>
                      {u.nombre_completo}
                    </td>
                    <td className={cn(tdCls, "text-gray-500 max-w-[140px] truncate")}>
                      {u.empresa?.nombre ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className={tdCls}>
                      <RolBadge rol={u.rol} t={t} />
                    </td>
                    <td className={tdCls}>
                      <span className="text-xs text-gray-500 capitalize">
                        {u.tipo_cuenta === "titular" ? t("tipoCuentaTitular") : t("tipoCuentaFamiliar")}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <EstadoBadge estado={u.estado} t={t} />
                    </td>
                    <td className={cn(tdCls, "text-gray-500 whitespace-nowrap")}>
                      {u.telefono ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className={cn(tdCls, "text-gray-500 max-w-[180px] truncate")}>
                      {u.email ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className={cn(tdCls, "text-right")}>
                      <Link
                        href={`/${locale}/dashboard/admin/usuarios/${u.id}/editar`}
                        onClick={(e) => e.stopPropagation()}
                        title={t("editarBtn")}
                        className="inline-flex p-1.5 rounded-lg text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </Link>
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
