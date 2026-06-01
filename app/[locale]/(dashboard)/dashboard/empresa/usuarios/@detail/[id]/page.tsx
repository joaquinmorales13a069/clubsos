import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function EmpresaUsuarioDetallePage({ params }: PageProps) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Dashboard.empresa.usuarios.detalle");

  // ── Empresa-scope guard ──────────────────────────────────────────────────
  const { data: { user: actor } } = await supabase.auth.getUser();
  if (!actor) redirect(`/${locale}/login`);

  const { data: actorRow } = await supabase
    .from("users")
    .select("empresa_id")
    .eq("id", actor.id)
    .single();
  if (!actorRow?.empresa_id) redirect(`/${locale}/dashboard/empresa/usuarios`);

  const { data: targetScope } = await supabase
    .from("users")
    .select("empresa_id")
    .eq("id", id)
    .single();
  if (targetScope?.empresa_id !== actorRow.empresa_id) {
    notFound(); // do not reveal cross-empresa users
  }

  // ── Fetch full user data ─────────────────────────────────────────────────
  const { data: usuario } = await supabase
    .from("users")
    .select("id, nombre_completo, email, telefono, documento_identidad, estado, fecha_nacimiento, sexo, tipo_cuenta, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!usuario) notFound();

  // Format fecha_nacimiento
  const fechaNac = usuario.fecha_nacimiento
    ? new Date(usuario.fecha_nacimiento).toLocaleDateString(locale === "en" ? "en-US" : "es-NI", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  // Format created_at
  const creado = usuario.created_at
    ? new Date(usuario.created_at).toLocaleDateString(locale === "en" ? "en-US" : "es-NI", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  // Format sexo
  const sexoLabel =
    usuario.sexo === "M" ? t("sexoM") :
    usuario.sexo === "F" ? t("sexoF") :
    null;

  return (
    <>
      <BackButton href={`/${locale}/dashboard/empresa/usuarios`} />
      <DetailPanel
        title={usuario.nombre_completo ?? t("untitled")}
        closeHref={`/${locale}/dashboard/empresa/usuarios`}
        actions={
          <Link
            href={`/${locale}/dashboard/empresa/usuarios/${id}/editar`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary/80 px-3 py-1.5 rounded-full bg-secondary/5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("editar")}
          </Link>
        }
      >
        <dl className="space-y-3 text-sm font-roboto">
          <Field label={t("email")}           value={usuario.email} />
          <Field label={t("telefono")}        value={usuario.telefono} />
          <Field label={t("documento")}       value={usuario.documento_identidad} />
          <Field label={t("estado")}          value={usuario.estado} />
          <Field label={t("tipoCuenta")}      value={usuario.tipo_cuenta} />
          <Field label={t("fechaNacimiento")} value={fechaNac} />
          <Field label={t("sexo")}            value={sexoLabel} />
          <Field label={t("creado")}          value={creado} />
        </dl>
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
