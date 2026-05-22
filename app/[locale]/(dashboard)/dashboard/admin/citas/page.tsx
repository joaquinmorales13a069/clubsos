/**
 * Admin — Gestionar Citas
 *
 * Single page with a toggle between two views:
 *   - Lista (AdminCitasRegistro): paginated table with filters/search
 *   - Calendario (AdminCalendarioCitas): FullCalendar with Realtime
 *
 * Both views share the same actions (confirmar/rechazar/cancelar) wired
 * through the new /api/admin/citas/[id]/* endpoints.
 *
 * Pagos (verificación + pendientes admin) stay as separate sections below
 * the active view — they are workflow-specific and don't belong inside the
 * calendar.
 */
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminCitasView from "@/components/dashboard/admin/AdminCitasView";
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
