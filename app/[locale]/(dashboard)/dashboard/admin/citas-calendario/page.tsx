/**
 * Admin — Calendario de Citas
 *
 * Full-bleed calendar view (FullCalendar). Clicking an event navigates to
 * the cita detail panel at /admin/citas/[id].
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminCalendarioCitas from "@/components/dashboard/admin/AdminCalendarioCitas";

export default async function AdminCitasCalendarioPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();

  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return (
    <div className="space-y-8">
      <AdminCalendarioCitas />
    </div>
  );
}
