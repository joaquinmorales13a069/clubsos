import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";

interface PageProps { params: Promise<{ locale: string; id: string }>; }

export default async function EmpresaDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.empresas.detalle");

  const { data: empresa, error } = await supabase
    .from("empresas")
    .select("id, nombre, codigo_empresa, estado, auto_confirmar_citas, ruc, direccion_calle, departamento, notas, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/admin/empresas`);
  if (!empresa) notFound();

  // count users in this empresa
  const { count: usuariosCount } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", id);

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/empresas`} />
      <DetailPanel
        title={empresa.nombre ?? t("untitled")}
        closeHref={`/${locale}/dashboard/admin/empresas`}
        actions={
          <Link
            href={`/${locale}/dashboard/admin/empresas/${id}/editar`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary/80 px-3 py-1.5 rounded-full bg-secondary/5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("editar")}
          </Link>
        }
      >
        <dl className="space-y-3 text-sm font-roboto">
          <Field label={t("codigo")}        value={empresa.codigo_empresa} />
          <Field label={t("estado")}        value={empresa.estado} />
          <Field label={t("autoConfirma")}  value={empresa.auto_confirmar_citas ? t("si") : t("no")} />
          <Field label={t("ruc")}           value={empresa.ruc} />
          <Field label={t("direccion")}     value={empresa.direccion_calle} />
          <Field label={t("departamento")}  value={empresa.departamento} />
          <Field label={t("notas")}         value={empresa.notas} />
          <Field label={t("usuariosCount")} value={String(usuariosCount ?? 0)} />
          <Field label={t("creado")}        value={empresa.created_at ? new Date(empresa.created_at).toLocaleDateString(locale) : null} />
        </dl>
      </DetailPanel>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral">{label}</dt>
      <dd className="text-gray-900 text-right truncate max-w-[60%]">{value ?? "—"}</dd>
    </div>
  );
}
