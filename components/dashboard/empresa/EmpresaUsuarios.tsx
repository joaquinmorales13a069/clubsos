"use client";

/**
 * EmpresaUsuarios — User management for empresa admin (Step 6.4).
 *
 * - Fetches all empresa users on mount (RLS users_empresa_admin_read scopes automatically).
 * - Table desktop / cards mobile — same pattern as EmpresaCitasRegistro.
 * - Client-side search on nombre_completo and telefono.
 * - Client-side pagination (20 per page).
 * - Row → EditarUsuarioModal (Sheet panel) for editing.
 * - Optimistic updates on save.
 */

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import EditarUsuarioModal from "./EditarUsuarioModal";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UsuarioEmpresa = {
  id:                  string;
  nombre_completo:     string | null;
  email:               string | null;
  telefono:            string | null;
  documento_identidad: string | null;
  rol:                 string;
  tipo_cuenta:         string;
  estado:              string;
  created_at:          string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// Role badge styles
const ROL_BADGE: Record<string, string> = {
  empresa_admin: "bg-orange-100 text-orange-700",
  miembro:       "bg-gray-100 text-gray-600",
};

// Estado badge styles
const ESTADO_BADGE: Record<string, { cls: string; i18n: string }> = {
  activo:    { cls: "bg-emerald-100 text-emerald-700", i18n: "estadoActivo" },
  inactivo:  { cls: "bg-red-100 text-red-600",        i18n: "estadoInactivo" },
  pendiente: { cls: "bg-amber-100 text-amber-700",    i18n: "estadoPendiente" },
};

// Tipo cuenta chip styles
const TIPO_CHIP: Record<string, { cls: string; i18n: string }> = {
  titular:  { cls: "bg-secondary/10 text-secondary", i18n: "tipoCuentaTitular" },
  familiar: { cls: "bg-purple-100 text-purple-700",  i18n: "tipoCuentaFamiliar" },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-gray-200" />
          <div className="flex-1 h-3 bg-gray-200 rounded" />
          <div className="w-20 h-5 bg-gray-200 rounded-full" />
          <div className="w-16 h-5 bg-gray-200 rounded-full" />
          <div className="w-20 h-5 bg-gray-200 rounded-full" />
          <div className="w-28 h-3 bg-gray-200 rounded" />
          <div className="w-16 h-8 bg-gray-200 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

// ── Avatar initials helper ────────────────────────────────────────────────────

function initials(name: string | null) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmpresaUsuarios() {
  const t = useTranslations("Dashboard.empresa.gestionarUsuarios");

  // ── Data state ──────────────────────────────────────────────────────────
  const [usuarios, setUsuarios] = useState<UsuarioEmpresa[]>([]);
  const [loading,  setLoading]  = useState(true);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [page,   setPage]   = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // ── Modal state ──────────────────────────────────────────────────────────
  const [selectedUser, setSelectedUser] = useState<UsuarioEmpresa | null>(null);
  const [modalOpen,    setModalOpen]    = useState(false);

  // ── Fetch on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("users")
      .select("id, nombre_completo, email, telefono, documento_identidad, rol, tipo_cuenta, estado, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setUsuarios(data as UsuarioEmpresa[]);
        } else if (error) {
          toast.error(t("errorCargar"));
        }
        setLoading(false);
      });
  }, [t]);

  // ── Fetch current user ID ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  // ── Filtered + paged data ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return usuarios;
    const q = search.trim().toLowerCase();
    return usuarios.filter((u) =>
      (u.nombre_completo?.toLowerCase() ?? "").includes(q) ||
      (u.telefono?.toLowerCase() ?? "").includes(q),
    );
  }, [usuarios, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSearchChange = (val: string) => { setSearch(val); setPage(0); };

  // ── Open modal ────────────────────────────────────────────────────────────
  const openModal = (user: UsuarioEmpresa) => {
    setSelectedUser(user);
    setModalOpen(true);
  };

  // ── Optimistic update after save ─────────────────────────────────────────
  const handleSaved = (updated: UsuarioEmpresa) => {
    setUsuarios((prev) =>
      prev.map((u) => (u.id === updated.id ? updated : u)),
    );
    // Keep modal in sync
    setSelectedUser(updated);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("titulo")}</h1>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      {/* Search + count */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-white
                       text-sm font-roboto text-gray-800 placeholder:text-gray-400
                       focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10
                       transition-colors"
          />
        </div>
        {!loading && (
          <span className="text-xs font-roboto text-neutral shrink-0">
            {t("totalCount", { count: filtered.length })}
          </span>
        )}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4">
            <TableSkeleton />
          </div>
        ) : paged.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center text-center py-16 space-y-3">
            <Users className="w-14 h-14 text-gray-200" />
            <p className="text-base font-poppins font-semibold text-gray-500">
              {search ? t("empty") : t("emptyAll")}
            </p>
          </div>
        ) : (
          <>
            {/* ── Desktop table ─────────────────────────────────────────────── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/60">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldNombre")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldRol")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldTipoCuenta")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldEstado")}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t("fieldTelefono")}
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map((user) => {
                    const rolCls   = ROL_BADGE[user.rol]   ?? ROL_BADGE.miembro;
                    const estadoCfg = ESTADO_BADGE[user.estado] ?? ESTADO_BADGE.inactivo;
                    const tipoCfg   = TIPO_CHIP[user.tipo_cuenta] ?? TIPO_CHIP.familiar;

                    return (
                      <tr
                        key={user.id}
                        className="hover:bg-gray-50/60 transition-colors"
                      >
                        {/* Nombre */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="shrink-0 w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-secondary">
                                {initials(user.nombre_completo)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-poppins font-medium text-gray-900 truncate max-w-[160px]">
                                {user.nombre_completo ?? "—"}
                              </p>
                              <p className="text-xs font-roboto text-neutral/60 truncate max-w-[160px]">
                                {user.email ?? "—"}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Rol */}
                        <td className="px-4 py-3.5">
                          <span className={cn(
                            "inline-block text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap",
                            rolCls,
                          )}>
                            {t(user.rol === "empresa_admin" ? "rolEmpresaAdmin" : "rolMiembro")}
                          </span>
                        </td>

                        {/* Tipo cuenta */}
                        <td className="px-4 py-3.5">
                          <span className={cn(
                            "inline-block text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap",
                            tipoCfg.cls,
                          )}>
                            {t(tipoCfg.i18n as Parameters<typeof t>[0])}
                          </span>
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3.5">
                          <span className={cn(
                            "inline-block text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap",
                            estadoCfg.cls,
                          )}>
                            {t(estadoCfg.i18n as Parameters<typeof t>[0])}
                          </span>
                        </td>

                        {/* Teléfono */}
                        <td className="px-4 py-3.5 font-roboto text-gray-600 text-sm">
                          {user.telefono ?? "—"}
                        </td>

                        {/* Edit action */}
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => openModal(user)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-roboto
                                       bg-secondary/5 text-secondary border border-secondary/20
                                       hover:bg-secondary/10 transition-colors whitespace-nowrap"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            {t("editarBtn")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile cards ──────────────────────────────────────────────── */}
            <div className="md:hidden divide-y divide-gray-50">
              {paged.map((user) => {
                const rolCls    = ROL_BADGE[user.rol] ?? ROL_BADGE.miembro;
                const estadoCfg = ESTADO_BADGE[user.estado] ?? ESTADO_BADGE.inactivo;
                const tipoCfg   = TIPO_CHIP[user.tipo_cuenta] ?? TIPO_CHIP.familiar;

                return (
                  <div
                    key={user.id}
                    className="px-4 py-4"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="shrink-0 w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center mt-0.5">
                        <span className="text-xs font-bold text-secondary">
                          {initials(user.nombre_completo)}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-poppins font-semibold text-gray-900 truncate">
                          {user.nombre_completo ?? "—"}
                        </p>
                        <p className="text-xs font-roboto text-neutral/60 truncate">
                          {user.email ?? "—"}
                        </p>
                        {user.telefono && (
                          <p className="text-xs font-roboto text-neutral/70">{user.telefono}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", rolCls)}>
                            {t(user.rol === "empresa_admin" ? "rolEmpresaAdmin" : "rolMiembro")}
                          </span>
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", tipoCfg.cls)}>
                            {t(tipoCfg.i18n as Parameters<typeof t>[0])}
                          </span>
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", estadoCfg.cls)}>
                            {t(estadoCfg.i18n as Parameters<typeof t>[0])}
                          </span>
                        </div>
                      </div>

                      {/* Edit button */}
                      <button
                        type="button"
                        onClick={() => openModal(user)}
                        className="shrink-0 p-2 rounded-xl bg-secondary/5 text-secondary border border-secondary/20
                                   hover:bg-secondary/10 transition-colors"
                        aria-label={t("editarBtn")}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
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
            {t("pageInfo", { current: page + 1, total: totalPages })}
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

      {/* Edit modal (Sheet) */}
      <EditarUsuarioModal
        open={modalOpen}
        user={selectedUser}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        currentUserId={currentUserId}
      />
    </div>
  );
}
