/**
 * Dashboard — Empresa Admin Inicio (Step 6.2)
 *
 * Server Component: fetches the authenticated user's first name,
 * then renders the EmpresaInicio client component which handles
 * all section-level data fetching and skeletons independently.
 */

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import EmpresaInicio from "@/components/dashboard/empresa/EmpresaInicio";

export default async function EmpresaDashboardPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  // Defence-in-depth session check (middleware already handles redirect)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Fetch minimal profile data needed for the greeting
  const { data: profile } = await supabase
    .from("users")
    .select("nombre_completo, rol, empresa_id")
    .eq("id", user.id)
    .single();

  // Guard: only empresa_admin should reach this page
  if (profile?.rol !== "empresa_admin") {
    redirect(`/${locale}/dashboard`);
  }

  const firstName  = profile?.nombre_completo?.split(" ")[0] ?? "Admin";
  const empresaId  = profile?.empresa_id ?? null;

  return <EmpresaInicio firstName={firstName} empresaId={empresaId} />;
}
