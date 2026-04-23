"use client";

/**
 * MiFamilia — Family management client component (titular only).
 * Shows paginated list of familiares (10 per page).
 * Allows toggling estado: activo ↔ inactivo/pendiente.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Users,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Phone,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

export type FamiliarRow = {
  id:              string;
  nombre_completo: string | null;
  tipo_cuenta:     string;
  telefono:        string | null;
  estado:          string;
};

interface MiFamiliaProps {
  initialData:  FamiliarRow[];
  initialCount: number;
  titularId:    string;
}

// ── Badge configs ─────────────────────────────────────────────────────────

const ESTADO_BADGE: Record<string, string> = {
  activo:    "bg-green-100 text-green-700",
  inactivo:  "bg-gray-100 text-gray-500",
  pendiente: "bg-amber-100 text-amber-700",
};

const TIPO_BADGE: Record<string, string> = {
  titular:  "bg-secondary/10 text-secondary",
  familiar: "bg-purple-100 text-purple-700",
};

export default function MiFamilia({ initialData, initialCount, titularId }: MiFamiliaProps) {
  const t = useTranslations("Dashboard.miembro.familia");

  const [familiares, setFamiliares] = useState<FamiliarRow[]>(initialData);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [page,       setPage]       = useState(0);
  const [loading,    setLoading]    = useState(false);
  // Track which familiar is being toggled
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const mounted    = useRef(false);

  const fetchFamiliares = useCallback(async (currentPage: number) => {
    setLoading(true);
    const supabase = createClient();
    const offset   = currentPage * PAGE_SIZE;

    const { data, count } = await supabase
      .from("users")
      .select("id, nombre_completo, tipo_cuenta, telefono, estado", { count: "exact" })
      .eq("titular_id", titularId)
      .order("nombre_completo", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    setFamiliares((data as FamiliarRow[]) ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [titularId]);

  // Skip first mount — SSR data already loaded
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    fetchFamiliares(page);
  }, [page, fetchFamiliares]);

  async function handleToggleEstado(familiar: FamiliarRow) {
    const newEstado = familiar.estado === "activo" ? "inactivo" : "activo";
    setTogglingId(familiar.id);

    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ estado: newEstado })
      .eq("id", familiar.id);

    if (!error) {
      // Optimistic update — reflect change immediately
      setFamiliares((prev) =>
        prev.map((f) => f.id === familiar.id ? { ...f, estado: newEstado } : f)
      );
    }

    setTogglingId(null);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      {/* List card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-secondary animate-spin" />
          </div>

        ) : familiares.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 space-y-3">
            <Users className="w-14 h-14 text-gray-200" />
            <p className="text-base font-poppins font-semibold text-gray-500">{t("empty")}</p>
            <p className="text-sm font-roboto text-neutral max-w-xs">{t("emptySub")}</p>
          </div>

        ) : (
          <ul className="divide-y divide-gray-50">
            {familiares.map((familiar) => (
              <li key={familiar.id} className="flex items-center gap-3 px-5 py-4">

                {/* Avatar initials */}
                <div className="shrink-0 w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center">
                  <span className="text-xs font-poppins font-bold text-secondary">
                    {(familiar.nombre_completo ?? "?")
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-poppins font-semibold text-gray-900 truncate">
                    {familiar.nombre_completo ?? "—"}
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* tipo_cuenta badge */}
                    <span className={cn(
                      "text-xs font-semibold px-2 py-0.5 rounded-full",
                      TIPO_BADGE[familiar.tipo_cuenta] ?? TIPO_BADGE.familiar,
                    )}>
                      {t(`tipoCuenta.${familiar.tipo_cuenta}` as Parameters<typeof t>[0])}
                    </span>

                    {/* Phone */}
                    {familiar.telefono && (
                      <span className="flex items-center gap-1 text-xs font-roboto text-neutral/70">
                        <Phone className="w-3 h-3" />
                        {familiar.telefono}
                      </span>
                    )}
                  </div>
                </div>

                {/* Estado badge */}
                <span className={cn(
                  "shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full",
                  ESTADO_BADGE[familiar.estado] ?? ESTADO_BADGE.inactivo,
                )}>
                  {t(`estado.${familiar.estado}` as Parameters<typeof t>[0])}
                </span>

                {/* Toggle button */}
                <button
                  type="button"
                  onClick={() => handleToggleEstado(familiar)}
                  disabled={togglingId === familiar.id}
                  title={familiar.estado === "activo" ? t("deactivateBtn") : t("activateBtn")}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold font-roboto border transition-all disabled:opacity-50",
                    familiar.estado === "activo"
                      ? "border-red-200 text-red-500 hover:bg-red-50"
                      : "border-green-200 text-green-600 hover:bg-green-50",
                  )}
                >
                  {togglingId === familiar.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : familiar.estado === "activo" ? (
                    <ToggleRight className="w-3.5 h-3.5" />
                  ) : (
                    <ToggleLeft className="w-3.5 h-3.5" />
                  )}
                  {familiar.estado === "activo" ? t("deactivateBtn") : t("activateBtn")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-roboto text-neutral">
            {t("pageInfo", { current: page + 1, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 text-sm font-roboto
                         text-gray-600 hover:border-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {t("prevPage")}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 text-sm font-roboto
                         text-gray-600 hover:border-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t("nextPage")}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
