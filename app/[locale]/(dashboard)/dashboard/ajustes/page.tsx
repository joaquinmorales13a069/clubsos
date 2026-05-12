/**
 * AjustesPage — Step 5.6
 * Server Component: fetches user profile + auth email, passes to AjustesForm.
 */

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AjustesForm from "@/components/dashboard/miembro/ajustes/AjustesForm";
import MfaSection from "@/components/mfa/MfaSection";

export default async function AjustesPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const [{ data: profile }, { data: mfaFactors }] = await Promise.all([
    supabase
      .from("users")
      .select("id, nombre_completo, documento_identidad, rol, tipo_cuenta, fecha_nacimiento, username, telefono")
      .eq("id", user.id)
      .single(),
    supabase.auth.mfa.listFactors(),
  ]);

  const mfaEnrolled = (mfaFactors?.totp?.length ?? 0) > 0;
  const mfaFactorId = mfaFactors?.totp[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <AjustesForm
        profile={{
          id:                  user.id,
          nombre_completo:     profile?.nombre_completo     ?? null,
          documento_identidad: profile?.documento_identidad ?? null,
          rol:                 profile?.rol                 ?? "miembro",
          tipo_cuenta:         profile?.tipo_cuenta         ?? "familiar",
          fecha_nacimiento:    profile?.fecha_nacimiento    ?? null,
          username:            profile?.username            ?? null,
          telefono:            profile?.telefono            ?? null,
          email:               user.email                  ?? null,
        }}
      />
      <MfaSection enrolled={mfaEnrolled} factorId={mfaFactorId} />
    </div>
  );
}
