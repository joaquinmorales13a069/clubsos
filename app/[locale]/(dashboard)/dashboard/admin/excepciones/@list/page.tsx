import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import AdminExcepcionesView from "@/components/dashboard/admin/AdminExcepcionesView";

export default async function ExcepcionesListPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return <AdminExcepcionesView />;
}
