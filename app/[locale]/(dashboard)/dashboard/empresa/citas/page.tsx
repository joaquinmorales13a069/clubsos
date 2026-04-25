/**
 * Empresa Admin — Registro de Citas (Step 6.3)
 *
 * Server Component: guards the route to empresa_admin only,
 * then renders the EmpresaCitasRegistro client component which
 * handles all data fetching, filtering, search, and pagination.
 */

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import EmpresaCitasRegistro from "@/components/dashboard/empresa/EmpresaCitasRegistro";

export default async function EmpresaCitasPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "empresa_admin") {
    redirect(`/${locale}/dashboard`);
  }

  return <EmpresaCitasRegistro />;
}
