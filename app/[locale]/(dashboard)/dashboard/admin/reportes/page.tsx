/**
 * Admin — Generar Reportes (Step 7.9)
 * Placeholder until AdminReportes is implemented.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import { BarChart3 } from "lucide-react";

export default async function AdminReportesPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();

  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
        <BarChart3 className="w-8 h-8 text-emerald-600" />
      </div>
      <h1 className="text-2xl font-poppins font-bold text-gray-900">Generar Reportes</h1>
      <p className="text-sm font-roboto text-neutral max-w-sm">
        Analítica global del sistema con gráficas y exportación CSV. Disponible en el Paso 7.9.
      </p>
    </div>
  );
}
