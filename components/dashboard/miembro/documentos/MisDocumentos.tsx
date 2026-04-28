"use client";

/**
 * MisDocumentos — Client component for the Medical Documents browser.
 * Handles:
 *   - Filter chips by tipo_documento
 *   - Paginated grid (12 per page) via Supabase browser client
 *   - Loading / empty states
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { FileText, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import DocumentoCard, { type DocumentoRow } from "./DocumentoCard";

const PAGE_SIZE = 12;

type FilterType =
  | "all"
  | "laboratorio"
  | "radiologia"
  | "receta"
  | "consulta_medica"
  | "especialidades"
  | "otro";

interface MisDocumentosProps {
  userId:       string;
  initialData:  DocumentoRow[];
  initialCount: number;
}

export default function MisDocumentos({ userId, initialData, initialCount }: MisDocumentosProps) {
  const t = useTranslations("Dashboard.miembro.documentos");

  const [filter, setFilter]         = useState<FilterType>("all");
  const [page, setPage]             = useState(0);
  const [documentos, setDocumentos] = useState<DocumentoRow[]>(initialData);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [loading, setLoading]       = useState(false);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const mounted    = useRef(false);

  const fetchDocumentos = useCallback(async (currentFilter: FilterType, currentPage: number) => {
    setLoading(true);

    const supabase = createClient();
    const offset   = currentPage * PAGE_SIZE;

    let query = supabase
      .from("documentos_medicos")
      .select("id, nombre_documento, tipo_documento, file_path, tipo_archivo, fecha_documento, created_at, subido_por_user:users!subido_por(nombre_completo)", {
        count: "exact",
      })
      .eq("usuario_id", userId)
      .eq("estado_archivo", "activo")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (currentFilter !== "all") {
      query = query.eq("tipo_documento", currentFilter);
    }

    const { data, count } = await query;

    setDocumentos((data as unknown as DocumentoRow[]) ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [userId]);

  // Skip first mount — SSR data already loaded
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    fetchDocumentos(filter, page);
  }, [filter, page, fetchDocumentos]);

  function handleFilterChange(newFilter: FilterType) {
    setFilter(newFilter);
    setPage(0);
  }

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "all",             label: t("filterAll")           },
    { key: "laboratorio",     label: t("filterLaboratorio")   },
    { key: "radiologia",      label: t("filterRadiologia")    },
    { key: "receta",          label: t("filterReceta")        },
    { key: "consulta_medica", label: t("filterConsulta")      },
    { key: "especialidades",  label: t("filterEspecialidades") },
    { key: "otro",            label: t("filterOtro")          },
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
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-secondary animate-spin" />
        </div>
      ) : documentos.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 space-y-3">
          <FileText className="w-14 h-14 text-gray-200" />
          <p className="text-base font-poppins font-semibold text-gray-500">{t("empty")}</p>
          <p className="text-sm font-roboto text-neutral max-w-xs">{t("emptySub")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documentos.map((doc) => (
            <DocumentoCard key={doc.id} documento={doc} />
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
    </div>
  );
}
