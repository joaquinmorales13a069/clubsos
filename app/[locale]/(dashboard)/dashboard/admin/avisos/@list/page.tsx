import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import AvisosAdmin from "@/components/dashboard/admin/AvisosAdmin";

export default async function AvisosListPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, nombre")
    .eq("estado", "activa")
    .order("nombre");

  return <AvisosAdmin userId={user.id} empresas={empresas ?? []} />;
}
