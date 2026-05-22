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
      .select(`
        id, fecha_hora_cita, fecha_hora_fin, estado_sync, servicio_asociado,
        paciente_nombre, para_titular,
        doctor:doctores(nombre),
        ubicacion:ubicaciones(nombre, direccion)
      `)
      .eq("paciente_id", user.id)
      .order("fecha_hora_cita", { ascending: false }),

    supabase
      .from("users")
      .select("id, rol, empresa_id, titular_id, nombre_completo, telefono, documento_identidad")
      .eq("id", user.id)
      .single(),
  ]);

  return (
    <MisCitas
      // Supabase returns FK joins as arrays even for single FKs; downstream we
      // only consume the (single) related row, so we cast at the boundary.
      citas={(citasRes.data ?? []) as unknown as Parameters<typeof MisCitas>[0]["citas"]}
      userProfile={profileRes.data ?? null}
      locale={locale}
    />
  );
}
