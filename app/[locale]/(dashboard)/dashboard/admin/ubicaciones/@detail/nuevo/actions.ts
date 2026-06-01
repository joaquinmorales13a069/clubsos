"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { UbicacionFormState } from "../_components/UbicacionForm";

export async function crearUbicacionAction(
  _prev: UbicacionFormState,
  formData: FormData,
): Promise<UbicacionFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (actor?.rol !== "admin") return { error: "FORBIDDEN" };

  const nombre       = String(formData.get("nombre") ?? "").trim();
  const direccion    = String(formData.get("direccion") ?? "").trim();
  const telefono     = String(formData.get("telefono") ?? "").trim();
  const zona_horaria = String(formData.get("zona_horaria") ?? "").trim() || "America/Managua";
  const activo       = formData.get("activo") === "true";
  const locale       = String(formData.get("locale") ?? "es");

  if (!nombre) return { error: "NOMBRE_REQUERIDO" };

  const { data: inserted, error } = await supabase
    .from("ubicaciones")
    .insert({
      nombre,
      direccion: direccion || null,
      telefono: telefono || null,
      zona_horaria,
      activo,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "INSERT_FAILED" };

  revalidatePath(`/${locale}/dashboard/admin/ubicaciones`);
  redirect(`/${locale}/dashboard/admin/ubicaciones/${inserted.id}`);
}
