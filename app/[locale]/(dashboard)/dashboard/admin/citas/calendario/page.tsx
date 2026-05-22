/**
 * Admin — Calendario de Citas (Phase 4 · Step 8)
 *
 * Server Component: verifies admin role, then renders AdminCalendarioCitas
 * (client component wrapping FullCalendar).
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminCalendarioCitas from "@/components/dashboard/admin/AdminCalendarioCitas";

export default async function AdminCalendarioPage() {
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

  return <AdminCalendarioCitas />;
}
