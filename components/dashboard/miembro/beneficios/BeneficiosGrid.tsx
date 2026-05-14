"use client";

/**
 * BeneficiosGrid — Client component for the Benefits browser.
 * Handles:
 *  - Filter chips by tipo_beneficio (all | descuento | promocion)
 *  - Paginated grid (12 per page) via Supabase browser client
 *  - Loading / empty states
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Gift, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import BeneficioCard, { type BeneficioRow } from "./BeneficioCard";
import BeneficioDetailModal from "./BeneficioDetailModal";

const PAGE_SIZE = 12;

type FilterType = "all" | "descuento" | "promocion";

interface BeneficiosGridProps {
  /** Server-prefetched first page for instant render */
  initialData: BeneficioRow[];
  initialCount: number;
}

export default function BeneficiosGrid({ initialData, initialCount }: BeneficiosGridProps) {
  const t = useTranslations("Dashboard.miembro.beneficios");

  const [filter, setFilter]         = useState<FilterType>("all");
  const [page, setPage]             = useState(0);
  const [beneficios, setBeneficios] = useState<BeneficioRow[]>(initialData);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [loading, setLoading]       = useState(false);
  const [selectedBeneficio, setSelectedBeneficio] = useState<BeneficioRow | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch whenever filter or page changes — skip initial render (use SSR data)
  const fetch = useCallback(
    async (currentFilter: FilterType, currentPage: number) => {
      setLoading(true);

      const supabase = createClient();
      const offset   = currentPage * PAGE_SIZE;

      let query = supabase
        .from("beneficios")
        .select("id, titulo, descripcion, fecha_inicio, fecha_fin, tipo_beneficio, beneficio_image_url", {
          count: "exact",
        })
        .eq("estado_beneficio", "activa")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (currentFilter !== "all") {
        query = query.eq("tipo_beneficio", currentFilter);
      }

      const { data, count } = await query;

      setBeneficios(data ?? []);
      setTotalCount(count ?? 0);
      setLoading(false);
    },
    [],
  );

  // Track mount to skip the very first effect run (SSR data already loaded)
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    fetch(filter, page);
  }, [filter, page, fetch]);

  function handleFilterChange(newFilter: FilterType) {
    setFilter(newFilter);
    setPage(0); // reset pagination
  }

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "all",       label: t("filterAll")       },
    { key: "descuento", label: t("filterDiscount")  },
    { key: "promocion", label: t("filterPromotion") },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleFilterChange(key)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold font-roboto border transition-all ${
              filter === key
                ? "bg-secondary text-white border-secondary shadow-sm"
                : "bg-white text-neutral border-gray-200 hover:border-secondary/50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        /* Loading skeleton */
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-secondary animate-spin" />
        </div>
      ) : beneficios.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center text-center py-16 space-y-3">
          <Gift className="w-14 h-14 text-gray-200" />
          <p className="text-base font-poppins font-semibold text-gray-500">{t("empty")}</p>
          <p className="text-sm font-roboto text-neutral max-w-xs">{t("emptySub")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {beneficios.map((b) => (
            <BeneficioCard key={b.id} beneficio={b} onClick={() => setSelectedBeneficio(b)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-between pt-2">
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
      <BeneficioDetailModal
        open={selectedBeneficio !== null}
        beneficio={selectedBeneficio}
        onClose={() => setSelectedBeneficio(null)}
      />
    </div>
  );
}
