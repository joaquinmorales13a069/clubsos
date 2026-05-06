"use client";

/**
 * DocumentoCard — Single medical document card.
 * Shows type icon + badge, nombre, fecha, uploaded-by.
 * View: signed URL → new tab. Download: same URL → <a download>.
 * One createSignedUrl call (300 s) serves both actions.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  FlaskConical,
  ScanLine,
  ClipboardList,
  Stethoscope,
  Award,
  FileText,
  Eye,
  Download,
  Loader2,
  CalendarDays,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";

const STORAGE_BUCKET = "documentos-medicos";

export type DocumentoRow = {
  id: string;
  nombre_documento: string;
  tipo_documento: string;
  file_path: string;
  tipo_archivo: string | null;
  fecha_documento: string | null;
  created_at: string;
  subido_por_user: { nombre_completo: string } | null;
};

interface DocumentoCardProps {
  documento: DocumentoRow;
}

/** Icon + color config per document type */
const TIPO_CONFIG: Record<
  string,
  { icon: React.ElementType; badge: string; bg: string }
> = {
  laboratorio:    { icon: FlaskConical,   badge: "bg-blue-100 text-blue-700",     bg: "bg-blue-50"   },
  radiologia:     { icon: ScanLine,       badge: "bg-purple-100 text-purple-700", bg: "bg-purple-50" },
  receta:         { icon: ClipboardList,  badge: "bg-green-100 text-green-700",   bg: "bg-green-50"  },
  consulta_medica:{ icon: Stethoscope,    badge: "bg-amber-100 text-amber-700",   bg: "bg-amber-50"  },
  especialidades: { icon: Award,          badge: "bg-secondary/10 text-secondary", bg: "bg-blue-50/50"},
  otro:           { icon: FileText,       badge: "bg-gray-100 text-gray-600",     bg: "bg-gray-50"   },
};

function formatFecha(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-NI", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function DocumentoCard({ documento }: DocumentoCardProps) {
  const t = useTranslations("Dashboard.miembro.documentos");
  const [loading, setLoading] = useState<"view" | "download" | null>(null);

  const config = TIPO_CONFIG[documento.tipo_documento] ?? TIPO_CONFIG.otro;
  const Icon   = config.icon;
  const fecha  = formatFecha(documento.fecha_documento);

  /** Generate one signed URL (300 s) and perform the action */
  async function getSignedUrl(): Promise<string | null> {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(documento.file_path, 300);
    if (error || !data?.signedUrl) {
      toast.error(t("errorUrl"));
      return null;
    }
    return data.signedUrl;
  }

  async function handleView() {
    setLoading("view");
    const url = await getSignedUrl();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    setLoading(null);
  }

  async function handleDownload() {
    setLoading("download");
    const url = await getSignedUrl();
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = documento.nombre_documento;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setLoading(null);
  }

  return (
    <article className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      {/* Colored top strip + icon */}
      <div className={cn("flex items-center gap-3 px-4 py-3", config.bg)}>
        <div className={cn("p-2 rounded-xl", config.badge.replace("text-", "bg-").replace("bg-", "bg-opacity-20 "))}>
          <Icon className={cn("w-5 h-5", config.badge.split(" ")[1])} />
        </div>
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", config.badge)}>
          {t(`typeLabels.${documento.tipo_documento}` as Parameters<typeof t>[0])}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-poppins font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
          {documento.nombre_documento}
        </h3>

        {/* Metadata */}
        <div className="space-y-1 mt-auto">
          {fecha && (
            <div className="flex items-center gap-1.5 text-xs font-roboto text-neutral/70">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              <span>{fecha}</span>
            </div>
          )}
          {documento.subido_por_user?.nombre_completo && (
            <div className="flex items-center gap-1.5 text-xs font-roboto text-neutral/70">
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{documento.subido_por_user.nombre_completo}</span>
            </div>
          )}
        </div>

      </div>

      {/* Actions */}
      <div className="flex border-t border-gray-50">
        <button
          type="button"
          onClick={handleView}
          disabled={loading !== null}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold font-roboto
                     text-secondary hover:bg-secondary/5 disabled:opacity-50 transition-colors"
        >
          {loading === "view" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          {t("view")}
        </button>

        <div className="w-px bg-gray-50" />

        <button
          type="button"
          onClick={handleDownload}
          disabled={loading !== null}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold font-roboto
                     text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors"
        >
          {loading === "download" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          {t("download")}
        </button>
      </div>
    </article>
  );
}
