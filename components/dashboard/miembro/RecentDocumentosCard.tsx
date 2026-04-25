"use client";

/**
 * RecentDocumentosCard — Home info card showing the 3 latest medical documents.
 * Client Component — needs browser Supabase client to generate signed storage URLs.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { FileText, ChevronRight, Eye, Download, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

const STORAGE_BUCKET = "documentos-medicos";

type Documento = {
  id: string;
  nombre_documento: string;
  tipo_documento: string;
  file_path: string;
  tipo_archivo: string | null;
  fecha_documento: string | null;
  created_at: string;
};

interface RecentDocumentosCardProps {
  documentos: Documento[];
  locale: string;
}

/** Color badge per document type */
const TIPO_COLORS: Record<string, string> = {
  laboratorio:    "bg-blue-100 text-blue-700",
  radiologia:     "bg-purple-100 text-purple-700",
  receta:         "bg-green-100 text-green-700",
  consulta_medica:"bg-amber-100 text-amber-700",
  especialidades: "bg-secondary/10 text-secondary",
  otro:           "bg-gray-100 text-gray-600",
};

export default function RecentDocumentosCard({ documentos, locale }: RecentDocumentosCardProps) {
  const t = useTranslations("Dashboard.miembro.inicio.documentos");
  // Tracks which button is loading: "<id>-view" | "<id>-dl" | null
  const [loadingId, setLoadingId] = useState<string | null>(null);

  /** Open document in a new tab via signed URL */
  async function handleView(doc: Documento) {
    const key = `${doc.id}-view`;
    setLoadingId(key);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(doc.file_path, 300); // 5 min TTL
      if (error || !data?.signedUrl) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      // Storage not yet configured — silently ignore for now
    } finally {
      setLoadingId(null);
    }
  }

  /** Trigger download via signed URL */
  async function handleDownload(doc: Documento) {
    const key = `${doc.id}-dl`;
    setLoadingId(key);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(doc.file_path, 60); // 1 min TTL for download
      if (error || !data?.signedUrl) throw error;
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = doc.nombre_documento;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // Storage not yet configured — silently ignore for now
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-secondary" />
          <span className="text-sm font-poppins font-semibold text-gray-900">{t("title")}</span>
        </div>
        <Link
          href={`/${locale}/dashboard/documentos`}
          className="flex items-center gap-0.5 text-xs font-roboto text-secondary hover:text-secondary/80 transition-colors"
        >
          {t("viewAll")}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Body */}
      <div className="p-4">
        {documentos.length > 0 ? (
          <ul className="space-y-2.5">
            {documentos.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2">
                {/* Type badge */}
                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full max-w-[80px] truncate",
                    TIPO_COLORS[doc.tipo_documento] ?? TIPO_COLORS.otro,
                  )}
                >
                  {t(`typeLabels.${doc.tipo_documento}` as Parameters<typeof t>[0])}
                </span>

                {/* Document name */}
                <p className="flex-1 text-sm font-roboto text-gray-800 truncate min-w-0">
                  {doc.nombre_documento}
                </p>

                {/* Action buttons */}
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleView(doc)}
                    disabled={loadingId === `${doc.id}-view`}
                    title={t("view")}
                    className="p-1.5 rounded-lg hover:bg-secondary/10 text-secondary transition-colors disabled:opacity-50"
                  >
                    {loadingId === `${doc.id}-view` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={loadingId === `${doc.id}-dl`}
                    title={t("download")}
                    className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors disabled:opacity-50"
                  >
                    {loadingId === `${doc.id}-dl` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center text-center py-3 space-y-1">
            <FileText className="w-8 h-8 text-gray-200" />
            <p className="text-sm font-roboto font-medium text-gray-500">{t("empty")}</p>
            <p className="text-xs font-roboto text-neutral">{t("emptySub")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
