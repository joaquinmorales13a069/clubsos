import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import AdminEmpresas from "@/components/dashboard/admin/AdminEmpresas";
import AdminContratosManager from "@/components/dashboard/admin/AdminContratosManager";

export default async function EmpresasListPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return (
    <>
      <AdminEmpresas userId={user.id} />
      <section className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <AdminContratosManager />
      </section>
    </>
  );
}
