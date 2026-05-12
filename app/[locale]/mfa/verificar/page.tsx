import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import MfaVerifyForm from "@/components/mfa/MfaVerifyForm";

export default async function MfaVerificarPage() {
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factorId = factors?.totp[0]?.id ?? null;

  // No enrolled factor — shouldn't reach here, send to dashboard
  if (!factorId) redirect(`/${locale}/dashboard`);

  return <MfaVerifyForm factorId={factorId} />;
}
