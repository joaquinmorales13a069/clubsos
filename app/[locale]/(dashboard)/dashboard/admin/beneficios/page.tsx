/**
 * Admin — Gestionar Beneficios (Step 7.4)
 * Placeholder until AdminBeneficios is implemented.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import { Gift } from "lucide-react";

export default async function AdminBeneficiosPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();

  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center">
        <Gift className="w-8 h-8 text-rose-500" />
      </div>
      <h1 className="text-2xl font-poppins font-bold text-gray-900">Gestionar Beneficios</h1>
      <p className="text-sm font-roboto text-neutral max-w-sm">
        CRUD de beneficios y descuentos del sistema. Disponible en el Paso 7.4.
      </p>
    </div>
  );
}
