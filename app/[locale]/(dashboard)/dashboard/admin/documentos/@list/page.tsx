import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import AdminDocumentos from "@/components/dashboard/admin/AdminDocumentos";

export default async function DocumentosListPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return <AdminDocumentos userId={user.id} />;
}
