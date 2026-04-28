/**
 * Admin — Gestionar Empresas (Step 7.7)
 *
 * Server Component: verifies admin role, then renders AdminEmpresas.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminEmpresas from "@/components/dashboard/admin/AdminEmpresas";
import AdminContratosManager from "@/components/dashboard/admin/AdminContratosManager";

export default async function AdminEmpresasPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return (
    <>
      <AdminEmpresas userId={user.id} />
      <section className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <AdminContratosManager />
      </section>
    </>
  );
}
