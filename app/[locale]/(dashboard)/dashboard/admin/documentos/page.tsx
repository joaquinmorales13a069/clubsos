/**
 * Admin — Gestionar Documentos (Step 7.5)
 * Placeholder until AdminDocumentos is implemented.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import { FileText } from "lucide-react";

export default async function AdminDocumentosPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();

  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center">
        <FileText className="w-8 h-8 text-purple-500" />
      </div>
      <h1 className="text-2xl font-poppins font-bold text-gray-900">Gestionar Documentos</h1>
      <p className="text-sm font-roboto text-neutral max-w-sm">
        Subida y gestión de documentos médicos para todos los miembros. Disponible en el Paso 7.5.
      </p>
    </div>
  );
}
