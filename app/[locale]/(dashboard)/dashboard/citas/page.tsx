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
      .select("id, fecha_hora_cita, estado_sync, servicio_asociado, paciente_nombre, para_titular")
      .eq("paciente_id", user.id)
      .order("fecha_hora_cita", { ascending: false }),

    supabase
      .from("users")
      .select("id, rol, empresa_id, titular_id, nombre_completo, telefono, documento_identidad")
      .eq("id", user.id)
      .single(),
  ]);

  // The legacy ea_appointment_id / ea_customer_id fields were dropped from the
  // schema by the citas native module migration. Phase 3 will refactor the
  // wizard types to remove them entirely; until then we synthesise null values
  // so the deferred CitaRow / WizardUserProfile shapes still compile.
  const citasWithLegacy = (citasRes.data ?? []).map((c) => ({
    ...c,
    ea_appointment_id: null,
  }));
  const profileWithLegacy = profileRes.data
    ? { ...profileRes.data, ea_customer_id: null }
    : null;

  return (
    <MisCitas
      citas={citasWithLegacy}
      userProfile={profileWithLegacy}
      locale={locale}
    />
  );
}
