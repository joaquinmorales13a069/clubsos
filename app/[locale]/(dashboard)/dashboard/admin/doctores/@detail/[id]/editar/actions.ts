"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { DoctorFormState } from "../../_components/DoctorForm";

export async function actualizarDoctorAction(
  _prev: DoctorFormState,
  formData: FormData,
): Promise<DoctorFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (actor?.rol !== "admin") return { error: "FORBIDDEN" };

  const id           = String(formData.get("id") ?? "");
  const nombre       = String(formData.get("nombre") ?? "").trim();
  const correo       = String(formData.get("correo") ?? "").trim();
  const telefono     = String(formData.get("telefono") ?? "").trim();
  const especialidad = String(formData.get("especialidad") ?? "").trim();
  const activo       = formData.get("activo") === "true";
  const ubicacion_raw = formData.get("ubicacion_id");
  const ubicacion_id  = ubicacion_raw && String(ubicacion_raw) !== "" ? String(ubicacion_raw) : null;
  const servicios_ids = formData.getAll("servicios_ids").map(s => String(s));
  const locale        = String(formData.get("locale") ?? "es");

  if (!nombre) return { error: "NOMBRE_REQUERIDO" };

  // Update doctor row
  const { error: updErr } = await supabase
    .from("doctores")
    .update({
      nombre,
      correo:       correo || null,
      telefono:     telefono || null,
      especialidad: especialidad || null,
      activo,
      ubicacion_id,
    })
    .eq("id", id);
  if (updErr) return { error: updErr.message };

  // Sync doctor_servicios pivote: delete-then-insert
  const { error: delErr } = await supabase
    .from("doctor_servicios")
    .delete()
    .eq("doctor_id", id);
  if (delErr) return { error: delErr.message };

  if (servicios_ids.length > 0) {
    const { error: insErr } = await supabase
      .from("doctor_servicios")
      .insert(servicios_ids.map(sid => ({ doctor_id: id, servicio_id: sid })));
    if (insErr) return { error: insErr.message };
  }

  revalidatePath(`/${locale}/dashboard/admin/doctores`);
  redirect(`/${locale}/dashboard/admin/doctores/${id}`);
}
