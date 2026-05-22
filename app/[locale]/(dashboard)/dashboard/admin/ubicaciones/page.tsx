/**
 * Admin — Gestionar Ubicaciones (Phase 4 · Step 3)
 *
 * Server Component: verifies admin role, then renders AdminUbicaciones.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminUbicaciones from "@/components/dashboard/admin/AdminUbicaciones";

export default async function AdminUbicacionesPage() {
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

  return <AdminUbicaciones />;
}
