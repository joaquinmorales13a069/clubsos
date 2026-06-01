/**
 * Admin — Gestionar Usuarios (Step 7.6)
 *
 * Server Component: verifies admin role, then renders AdminUsuarios.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminUsuarios from "@/components/dashboard/admin/AdminUsuarios";

export default async function AdminUsuariosPage() {
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

  return <AdminUsuarios userId={user.id} />;
}
