/**
 * Empresa Admin — Ajustes de Empresa (Step 6.5).
 *
 * Server Component: fetches the empresa data server-side to avoid a
 * client-side waterfall (auth → users → empresas).
 * Passes initial data to the EmpresaAjustes client component.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import EmpresaAjustes from "@/components/dashboard/empresa/EmpresaAjustes";
import MfaSection from "@/components/mfa/MfaSection";

export default async function EmpresaAjustesPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  // Defence-in-depth session check (middleware already handles redirect)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Fetch empresa_id from the user's profile
  const { data: profile } = await supabase
    .from("users")
    .select("empresa_id, rol")
    .eq("id", user.id)
    .single();

  // Guard: only empresa_admin with a linked empresa should reach this page
  if (profile?.rol !== "empresa_admin" || !profile?.empresa_id) {
    redirect(`/${locale}/dashboard`);
  }

  // Fetch full empresa data
  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nombre, codigo_empresa, notas, created_at, auto_confirmar_citas, ruc, direccion_calle, departamento")
    .eq("id", profile.empresa_id)
    .single();

  if (!empresa) redirect(`/${locale}/dashboard`);

  const { data: mfaFactors } = await supabase.auth.mfa.listFactors();
  const mfaEnrolled = mfaFactors?.totp.some(f => f.status === "verified") ?? false;
  const mfaFactorId = mfaFactors?.totp.find(f => f.status === "verified")?.id ?? null;

  return (
    <div className="space-y-6">
      <EmpresaAjustes
        empresa={{
          id:                   empresa.id,
          nombre:               empresa.nombre         ?? "",
          codigo_empresa:       empresa.codigo_empresa ?? "",
          notas:                empresa.notas          ?? null,
          created_at:           empresa.created_at,
          auto_confirmar_citas: empresa.auto_confirmar_citas ?? false,
          ruc:                  empresa.ruc            ?? null,
          direccion_calle:      empresa.direccion_calle ?? null,
          departamento:         empresa.departamento   ?? null,
        }}
      />
      <MfaSection enrolled={mfaEnrolled} factorId={mfaFactorId} />
    </div>
  );
}
