"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Bell, ImageIcon, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type AvisoPreview = {
  id:              string;
  titulo:          string;
  descripcion:     string | null;
  aviso_image_url: string | null;
  created_at:      string;
};

export default function TopbarAvisosPopover() {
  const t      = useTranslations("Dashboard.topbar.avisos");
  const locale = useLocale();

  const [open,    setOpen]    = useState(false);
  const [avisos,  setAvisos]  = useState<AvisoPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch once on first open
  useEffect(() => {
    if (!open || fetched) return;
    setLoading(true);
    createClient()
      .from("avisos")
      .select("id, titulo, descripcion, aviso_image_url, created_at")
      .eq("estado_aviso", "activa")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setAvisos((data ?? []) as AvisoPreview[]);
        setFetched(true);
        setLoading(false);
      });
  }, [open, fetched]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const showDot = !fetched || avisos.length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("titulo")}
        className="relative p-2 rounded-xl text-neutral hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {showDot && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-poppins font-semibold text-gray-900">
              {t("titulo")}
            </span>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          {loading ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-lg bg-gray-200 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-2.5 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : avisos.length === 0 ? (
            <div className="p-6 text-center text-sm font-roboto text-gray-400">
              {t("empty")}
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {avisos.map((aviso) => (
                <div
                  key={aviso.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  {aviso.aviso_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={aviso.aviso_image_url}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-100"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-5 h-5 text-rose-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate font-roboto">
                      {aviso.titulo}
                    </p>
                    {aviso.descripcion && (
                      <p className="text-xs text-gray-400 line-clamp-1 font-roboto mt-0.5">
                        {aviso.descripcion}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
            <Link
              href={`/${locale}/dashboard/avisos`}
              onClick={() => setOpen(false)}
              className="block w-full text-center text-sm font-medium text-secondary hover:text-secondary/80 font-roboto transition-colors"
            >
              {t("verTodos")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
