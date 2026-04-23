/**
 * Citas page — Step 5.3
 * Server Component: fetches citas and user profile, passes to MisCitas client component.
 */

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import MisCitas from "@/components/dashboard/miembro/citas/MisCitas";

export default async function CitasPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const [citasRes, profileRes] = await Promise.all([
    supabase
      .from("citas")
      .select("id, fecha_hora_cita, estado_sync, servicio_asociado, ea_appointment_id, paciente_nombre, para_titular")
      .order("fecha_hora_cita", { ascending: false }),

    supabase
      .from("users")
      .select("id, empresa_id, ea_customer_id, nombre_completo, telefono, documento_identidad")
      .eq("id", user.id)
      .single(),
  ]);

  return (
    <MisCitas
      citas={citasRes.data ?? []}
      userProfile={profileRes.data ?? null}
      locale={locale}
    />
  );
}
