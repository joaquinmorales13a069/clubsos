import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import AdminDoctores from "@/components/dashboard/admin/AdminDoctores";

export default async function DoctoresListPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return <AdminDoctores locale={locale} />;
}
