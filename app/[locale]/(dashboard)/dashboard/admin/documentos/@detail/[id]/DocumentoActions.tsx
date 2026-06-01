"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, Download, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

const BUCKET = "documentos-medicos";

interface Props {
  filePath: string;
  nombreDocumento: string;
  ns?: "admin" | "miembro";
}

export default function DocumentoActions({ filePath, nombreDocumento, ns = "admin" }: Props) {
  const tAdmin   = useTranslations("Dashboard.admin.documentos.detalle");
  const tMiembro = useTranslations("Dashboard.miembro.documentos.detalle");
  const t        = ns === "miembro" ? tMiembro : tAdmin;

  const [loading, setLoading] = useState<"view" | "download" | null>(null);

  async function getSignedUrl(seconds = 300): Promise<string | null> {
    const { data, error } = await createClient().storage
      .from(BUCKET)
      .createSignedUrl(filePath, seconds);
    if (error || !data?.signedUrl) {
      toast.error("No se pudo generar el enlace. Intenta de nuevo.");
      return null;
    }
    return data.signedUrl;
  }

  async function handleVer() {
    setLoading("view");
    const url = await getSignedUrl(300);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    setLoading(null);
  }

  async function handleDescargar() {
    setLoading("download");
    const url = await getSignedUrl(60);
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreDocumento;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setLoading(null);
  }

  return (
    <div className="flex gap-2 mt-2">
      <button
        type="button"
        onClick={handleVer}
        disabled={loading !== null}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary/10 text-secondary
                   text-sm font-roboto font-semibold hover:bg-secondary/20 disabled:opacity-50 transition-colors"
      >
        {loading === "view"
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Eye className="w-4 h-4" />}
        {t("verBtn")}
      </button>
      <button
        type="button"
        onClick={handleDescargar}
        disabled={loading !== null}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary/10 text-primary
                   text-sm font-roboto font-semibold hover:bg-primary/20 disabled:opacity-50 transition-colors"
      >
        {loading === "download"
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Download className="w-4 h-4" />}
        {t("descargarBtn")}
      </button>
    </div>
  );
}
