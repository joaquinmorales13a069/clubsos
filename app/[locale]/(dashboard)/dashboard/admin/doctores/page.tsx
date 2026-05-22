/**
 * Admin — Gestionar Doctores (Phase 4 · Step 6)
 *
 * Server Component: verifies admin role, then renders AdminDoctores.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminDoctores from "@/components/dashboard/admin/AdminDoctores";

export default async function AdminDoctoresPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return <AdminDoctores locale={locale} />;
}
