"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { ServicioFormState } from "../_components/ServicioForm";

export async function crearServicioAction(
  _prev: ServicioFormState,
  formData: FormData,
): Promise<ServicioFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (actor?.rol !== "admin") return { error: "FORBIDDEN" };

  const nombre        = String(formData.get("nombre") ?? "").trim();
  const descripcion   = String(formData.get("descripcion") ?? "").trim();
  const duracion_raw  = String(formData.get("duracion") ?? "").trim();
  const slot_raw      = String(formData.get("slot_duracion") ?? "").trim();
  const precio_raw    = String(formData.get("precio") ?? "").trim();
  const activo        = formData.get("activo") === "true";
  const locale        = String(formData.get("locale") ?? "es");

  if (!nombre) return { error: "NOMBRE_REQUERIDO" };
  const slot_duracion = Number(slot_raw);
  if (!Number.isFinite(slot_duracion) || slot_duracion < 1) return { error: "SLOT_INVALIDO" };

  const { data: inserted, error } = await supabase
    .from("servicios")
    .insert({
      nombre,
      descripcion: descripcion || null,
      duracion: duracion_raw ? Number(duracion_raw) : null,
      slot_duracion,
      precio: precio_raw ? Number(precio_raw) : null,
      activo,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "INSERT_FAILED" };

  revalidatePath(`/${locale}/dashboard/admin/servicios`);
  redirect(`/${locale}/dashboard/admin/servicios/${inserted.id}`);
}
