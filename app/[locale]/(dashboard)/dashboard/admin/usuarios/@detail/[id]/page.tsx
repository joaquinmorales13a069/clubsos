import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import AdminUsuarioContratosUsage from "@/components/dashboard/admin/AdminUsuarioContratosUsage";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function UsuarioDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.admin.usuarios.detalle");

  const { data: usuario, error } = await supabase
    .from("users")
    .select("id, nombre_completo, email, telefono, rol, estado, fecha_nacimiento, tipo_cuenta, empresas(nombre)")
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/${locale}/dashboard/admin/usuarios`);
  if (!usuario) notFound();

  const empresa = Array.isArray(usuario.empresas)
    ? (usuario.empresas[0] as { nombre: string } | undefined)?.nombre ?? null
    : (usuario.empresas as { nombre: string } | null)?.nombre ?? null;

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/usuarios`} />
      <DetailPanel
        title={usuario.nombre_completo ?? t("untitled")}
        closeHref={`/${locale}/dashboard/admin/usuarios`}
        actions={
          <Link
            href={`/${locale}/dashboard/admin/usuarios/${id}/editar`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary/80 px-3 py-1.5 rounded-full bg-secondary/5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("editar")}
          </Link>
        }
      >
        <dl className="space-y-3 text-sm font-roboto">
          <Field label={t("email")}            value={usuario.email} />
          <Field label={t("telefono")}         value={usuario.telefono} />
          <Field label={t("rol")}              value={usuario.rol} />
          <Field label={t("tipoCuenta")}       value={usuario.tipo_cuenta} />
          <Field label={t("estado")}           value={usuario.estado} />
          <Field label={t("empresa")}          value={empresa} />
          <Field label={t("fechaNacimiento")}  value={usuario.fecha_nacimiento} />
        </dl>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <h3 className="text-sm font-poppins font-semibold text-gray-900 mb-2">
            {t("contratos")}
          </h3>
          <AdminUsuarioContratosUsage userId={id} />
        </div>
      </DetailPanel>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral">{label}</dt>
      <dd className="text-gray-900 text-right truncate max-w-[60%]">
        {value ?? "—"}
      </dd>
    </div>
  );
}
