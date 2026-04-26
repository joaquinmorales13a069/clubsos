"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";

const ROLE_DASHBOARD: Record<string, string> = {
  admin:         "dashboard/admin",
  empresa_admin: "dashboard/empresa",
  miembro:       "dashboard",
};

/**
 * Re-checks the current user's `estado` in public.users.
 * If now `activo` → redirects to their role-based dashboard.
 * If still `pendiente` → returns { stillPending: true } so the
 * client can show a feedback toast without a page reload.
 */
export async function checkActivationStatusAction(): Promise<{ stillPending: true } | void> {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users")
    .select("estado, rol")
    .eq("id", user!.id)
    .single();

  if (profile?.estado === "activo") {
    const path = ROLE_DASHBOARD[profile.rol] ?? "dashboard";
    redirect(`/${locale}/${path}`);
  }

  return { stillPending: true };
}
