"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Megaphone, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type AvisoRow = {
  id:              string;
  titulo:          string;
  descripcion:     string | null;
  fecha_inicio:    string | null;
  fecha_fin:       string | null;
  estado_aviso:    "activa" | "expirada";
  aviso_image_url: string | null;
  created_at:      string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-NI", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
      <div className="h-40 bg-gray-200" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-2/3" />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MisAvisos() {
  const t = useTranslations("Dashboard.miembro.avisos");

  const [avisos,     setAvisos]     = useState<AvisoRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);
  const [page,       setPage]       = useState(0);

  const pageRef   = useRef(0);
  pageRef.current = page;

  const fetchAvisos = useCallback(async () => {
    setLoading(true);
    setError(false);
    const offset = pageRef.current * PAGE_SIZE;

    const { data, count, error: fetchError } = await createClient()
      .from("avisos")
      .select("id, titulo, descripcion, fecha_inicio, fecha_fin, estado_aviso, aviso_image_url, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (fetchError) {
      setError(true);
    } else {
      setAvisos((data ?? []) as AvisoRow[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAvisos(); }, [fetchAvisos, page]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const fromItem   = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const toItem     = Math.min((page + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
          <Megaphone className="w-5 h-5 text-rose-500" />
        </div>
        <div>
          <h1 className="text-xl font-poppins font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm font-roboto text-neutral">{t("subtitle")}</p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="py-12 text-center text-sm font-roboto text-red-500">{t("errorCargar")}</div>
      ) : avisos.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto">
            <Megaphone className="w-7 h-7 text-rose-300" />
          </div>
          <p className="text-sm font-medium text-gray-700 font-roboto">{t("empty")}</p>
          <p className="text-xs text-gray-400 font-roboto">{t("emptySub")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {avisos.map((aviso) => (
            <div
              key={aviso.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col"
            >
              {/* Image */}
              {aviso.aviso_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={aviso.aviso_image_url}
                  alt={aviso.titulo}
                  className="w-full aspect-square object-cover"
                />
              ) : (
                <div className="w-full aspect-square bg-rose-50 flex items-center justify-center">
                  <ImageIcon className="w-10 h-10 text-rose-200" />
                </div>
              )}

              {/* Body */}
              <div className="p-4 flex flex-col flex-1 gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-poppins font-semibold text-gray-900 leading-snug line-clamp-2">
                    {aviso.titulo}
                  </h2>
                  <span
                    className={cn(
                      "shrink-0 px-2 py-0.5 rounded-full text-xs font-medium",
                      aviso.estado_aviso === "activa"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {aviso.estado_aviso === "activa" ? t("estadoActiva") : t("estadoExpirada")}
                  </span>
                </div>

                {aviso.descripcion && (
                  <p className="text-xs font-roboto text-gray-500 line-clamp-3 flex-1">
                    {aviso.descripcion}
                  </p>
                )}

                {(aviso.fecha_inicio || aviso.fecha_fin) && (
                  <p className="text-xs font-roboto text-gray-400 mt-auto pt-1 border-t border-gray-50">
                    {formatDate(aviso.fecha_inicio)} – {formatDate(aviso.fecha_fin)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between px-1">
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
  );
}
