import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import AdminUsuarios from "@/components/dashboard/admin/AdminUsuarios";

export default async function UsuariosListPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  return <AdminUsuarios userId={user.id} />;
}
