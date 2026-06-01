import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminCitasView from "@/components/dashboard/admin/AdminCitasView";
import AdminPagoVerificacion from "@/components/dashboard/admin/AdminPagoVerificacion";
import AdminCitasPendientesAdmin from "@/components/dashboard/admin/AdminCitasPendientesAdmin";
import { getTranslations } from "next-intl/server";

export default async function AdminCitasListPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const t = await getTranslations("Dashboard.admin.citas");

  return (
    <div className="space-y-8">
      <AdminCitasView />

      <section>
        <h2 className="text-base font-poppins font-semibold text-gray-900 mb-4">
          {t("seccion_pagos")}
        </h2>
        <AdminPagoVerificacion />
      </section>

      <section>
        <h2 className="text-base font-poppins font-semibold text-gray-900 mb-4">
          {t("seccion_pendientes_admin")}
        </h2>
        <AdminCitasPendientesAdmin />
      </section>
    </div>
  );
}
