import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import MfaVerifyForm from "@/components/mfa/MfaVerifyForm";

export default async function MfaVerificarPage() {
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: factors } = await supabase.auth.mfa.listFactors();

  // Delete stale unverified factors so they don't block future challengeAndVerify calls
  const unverified = factors?.totp.filter(f => f.status !== "verified") ?? [];
  if (unverified.length > 0) {
    const admin = createServiceClient();
    await Promise.all(
      unverified.map(f => admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id }))
    );
  }

  const factorId = factors?.totp.find(f => f.status === "verified")?.id ?? null;

  // No verified factor — shouldn't reach here, send to dashboard
  if (!factorId) redirect(`/${locale}/dashboard`);

  return <MfaVerifyForm factorId={factorId} />;
}
