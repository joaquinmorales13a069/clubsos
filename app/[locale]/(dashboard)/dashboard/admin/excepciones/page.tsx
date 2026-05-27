/**
 * Admin · Excepciones de Horario — page entry.
 * Auth gate inside (dashboard) layout handles login redirect; we additionally
 * verify the role here so non-admins land on /dashboard.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminExcepcionesView from "@/components/dashboard/admin/AdminExcepcionesView";

export default async function AdminExcepcionesPage() {
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

  return <AdminExcepcionesView />;
}
