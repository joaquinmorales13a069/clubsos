/**
 * Dashboard — Global Admin Inicio (Step 7.2)
 *
 * Server Component: verifies admin role, then renders AdminInicio
 * which handles all section-level data fetching and skeletons.
 */

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminInicio from "@/components/dashboard/admin/AdminInicio";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users")
    .select("nombre_completo, rol")
    .eq("id", user.id)
    .single();

  // Guard: only global admin reaches this page
  if (profile?.rol !== "admin") {
    redirect(`/${locale}/dashboard`);
  }

  const firstName = profile?.nombre_completo?.split(" ")[0] ?? "Admin";

  return <AdminInicio firstName={firstName} />;
}
