import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import AdminBeneficios from "@/components/dashboard/admin/AdminBeneficios";

export default async function BeneficiosListPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return <AdminBeneficios userId={user.id} />;
}
