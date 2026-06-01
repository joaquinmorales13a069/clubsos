import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import DocumentoEditarForm from "./_DocumentoEditarForm";
import { editarDocumentoAction } from "./actions";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function EditarDocumentoPage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.documentos.form");

  const { data: doc } = await supabase
    .from("documentos_medicos")
    .select("id, nombre_documento, tipo_documento, fecha_documento, estado_archivo")
    .eq("id", id)
    .maybeSingle();

  if (!doc) notFound();

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/documentos/${id}`} />
      <DetailPanel title={t("editarTitle")} closeHref={`/${locale}/dashboard/admin/documentos/${id}`}>
        <DocumentoEditarForm
          action={editarDocumentoAction}
          initial={{
            id:               doc.id,
            nombre_documento: doc.nombre_documento ?? "",
            tipo_documento:   doc.tipo_documento   ?? "laboratorio",
            fecha_documento:  doc.fecha_documento  ?? "",
            estado_archivo:   doc.estado_archivo   ?? "activo",
          }}
          locale={locale}
        />
      </DetailPanel>
    </>
  );
}
