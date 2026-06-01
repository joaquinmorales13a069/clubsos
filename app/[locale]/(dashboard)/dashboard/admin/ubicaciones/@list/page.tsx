import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import AdminUbicaciones from "@/components/dashboard/admin/AdminUbicaciones";

export default async function UbicacionesListPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return <AdminUbicaciones />;
}
