/**
 * Admin — Gestionar Usuarios (Step 7.6)
 * Placeholder until AdminUsuarios is implemented.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import { UserCog } from "lucide-react";

export default async function AdminUsuariosPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();

  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center">
        <UserCog className="w-8 h-8 text-secondary" />
      </div>
      <h1 className="text-2xl font-poppins font-bold text-gray-900">Gestionar Usuarios</h1>
      <p className="text-sm font-roboto text-neutral max-w-sm">
        Vista global de todos los usuarios del sistema. Disponible en el Paso 7.6.
      </p>
    </div>
  );
}
