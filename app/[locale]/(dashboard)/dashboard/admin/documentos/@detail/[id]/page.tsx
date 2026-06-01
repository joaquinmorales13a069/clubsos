import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Pencil, FileText } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import { cn } from "@/lib/utils";
import DocumentoActions from "./DocumentoActions";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

const TIPO_BADGE: Record<string, string> = {
  laboratorio:     "bg-blue-100 text-blue-700",
  radiologia:      "bg-purple-100 text-purple-700",
  consulta_medica: "bg-teal-100 text-teal-700",
  especialidades:  "bg-orange-100 text-orange-700",
  receta:          "bg-rose-100 text-rose-700",
  otro:            "bg-gray-100 text-gray-600",
};

const ESTADO_BADGE: Record<string, string> = {
  activo:     "bg-emerald-100 text-emerald-700",
  archivado:  "bg-amber-100 text-amber-700",
  eliminado:  "bg-red-100 text-red-700",
};

export default async function DocumentoDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.documentos.detalle");
  const tTipo = await getTranslations("Dashboard.admin.documentos");

  const { data: doc, error } = await supabase
    .from("documentos_medicos")
    .select(`
      id, usuario_id, nombre_documento, tipo_documento, fecha_documento,
      file_path, tipo_archivo, estado_archivo, created_at, subido_por,
      usuario:users(nombre_completo, documento_identidad)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/admin/documentos`);
  if (!doc) notFound();

  const owner = doc.usuario as unknown as { nombre_completo: string | null; documento_identidad: string | null } | null;

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    return new Date(dateStr.slice(0, 10) + "T12:00:00").toLocaleDateString(locale);
  }

  const tipoBadge   = TIPO_BADGE[doc.tipo_documento]   ?? TIPO_BADGE.otro;
  const estadoBadge = ESTADO_BADGE[doc.estado_archivo] ?? "bg-gray-100 text-gray-500";

  const estadoLabel = doc.estado_archivo === "activo"
    ? t("estadoActivo")
    : doc.estado_archivo === "archivado"
      ? t("estadoArchivado")
      : t("estadoEliminado");

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/documentos`} />
      <DetailPanel
        title={doc.nombre_documento ?? t("untitled")}
        closeHref={`/${locale}/dashboard/admin/documentos`}
        actions={
          <Link
            href={`/${locale}/dashboard/admin/documentos/${id}/editar`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary/80 px-3 py-1.5 rounded-full bg-secondary/5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("editar")}
          </Link>
        }
      >
        <div className="space-y-4">
          {/* Icon + type badge */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
            <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm">
              <FileText className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", tipoBadge)}>
                {tTipo(`tipo_${doc.tipo_documento}` as Parameters<typeof tTipo>[0])}
              </span>
            </div>
          </div>

          {/* Status */}
          <div className="flex flex-wrap gap-2">
            <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", estadoBadge)}>
              {estadoLabel}
            </span>
          </div>

          {/* Fields */}
          <dl className="space-y-3 text-sm font-roboto">
            <Field label={t("usuario")}   value={owner?.nombre_completo ?? "—"} />
            <Field label={t("cedula")}    value={owner?.documento_identidad ?? "—"} />
            <Field label={t("fechaDocumento")} value={formatDate(doc.fecha_documento)} />
            {doc.tipo_archivo && (
              <Field label={t("tipoArchivo")} value={doc.tipo_archivo} />
            )}
            <Field label={t("creado")}    value={formatDate(doc.created_at)} />
          </dl>

          {/* View / Download actions */}
          <DocumentoActions
            filePath={doc.file_path}
            nombreDocumento={doc.nombre_documento ?? "documento"}
            ns="admin"
          />
        </div>
      </DetailPanel>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral shrink-0">{label}</dt>
      <dd className="text-gray-900 text-right truncate max-w-[60%]">{value ?? "—"}</dd>
    </div>
  );
}
