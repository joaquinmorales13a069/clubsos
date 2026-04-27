import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminReportes from "@/components/dashboard/admin/AdminReportes";

export default async function AdminReportesPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();

  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return <AdminReportes />;
}
