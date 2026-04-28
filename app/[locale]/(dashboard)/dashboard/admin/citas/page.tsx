/**
 * Admin — Gestionar Citas (Step 7.3)
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminCitasRegistro from "@/components/dashboard/admin/AdminCitasRegistro";
import AdminPagoVerificacion from "@/components/dashboard/admin/AdminPagoVerificacion";
import AdminCitasPendientesAdmin from "@/components/dashboard/admin/AdminCitasPendientesAdmin";

export default async function AdminCitasPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();

  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return (
    <div className="space-y-8">
      <AdminCitasRegistro />

      <section>
        <h2 className="text-base font-poppins font-semibold text-gray-900 mb-4">Verificación de Pagos</h2>
        <AdminPagoVerificacion />
      </section>

      <section>
        <h2 className="text-base font-poppins font-semibold text-gray-900 mb-4">Aprobaciones (Pago en Clínica)</h2>
        <AdminCitasPendientesAdmin />
      </section>
    </div>
  );
}
