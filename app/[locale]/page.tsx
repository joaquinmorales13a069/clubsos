/**
 * Root page — acts as a gateway.
 * Checks auth session and redirects to the correct dashboard based on role,
 * or to /login if there is no active session.
 */

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";

const ROLE_DASHBOARD: Record<string, string> = {
  admin:         "dashboard/admin",
  empresa_admin: "dashboard/empresa",
  miembro:       "dashboard",
};

export default async function RootPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();

  const rol  = profile?.rol ?? "miembro";
  const path = ROLE_DASHBOARD[rol] ?? "dashboard";

  redirect(`/${locale}/${path}`);
}
