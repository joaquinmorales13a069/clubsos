"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { DoctorFormState } from "../_components/DoctorForm";

export async function crearDoctorAction(
  _prev: DoctorFormState,
  formData: FormData,
): Promise<DoctorFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (actor?.rol !== "admin") return { error: "FORBIDDEN" };

  const nombre        = String(formData.get("nombre") ?? "").trim();
  const correo        = String(formData.get("correo") ?? "").trim();
  const telefono      = String(formData.get("telefono") ?? "").trim();
  const especialidad  = String(formData.get("especialidad") ?? "").trim();
  const activo        = formData.get("activo") === "true";
  const ubicacion_raw = formData.get("ubicacion_id");
  const ubicacion_id  = ubicacion_raw && String(ubicacion_raw) !== "" ? String(ubicacion_raw) : null;
  const servicios_ids = formData.getAll("servicios_ids").map(s => String(s));
  const locale        = String(formData.get("locale") ?? "es");

  if (!nombre) return { error: "NOMBRE_REQUERIDO" };

  const { data: inserted, error: insErr } = await supabase
    .from("doctores")
    .insert({
      nombre,
      correo:       correo || null,
      telefono:     telefono || null,
      especialidad: especialidad || null,
      activo,
      ubicacion_id,
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { error: insErr?.message ?? "INSERT_FAILED" };

  if (servicios_ids.length > 0) {
    const { error: pivErr } = await supabase
      .from("doctor_servicios")
      .insert(servicios_ids.map(sid => ({ doctor_id: inserted.id, servicio_id: sid })));
    if (pivErr) return { error: pivErr.message };
  }

  revalidatePath(`/${locale}/dashboard/admin/doctores`);
  redirect(`/${locale}/dashboard/admin/doctores/${inserted.id}`);
}
