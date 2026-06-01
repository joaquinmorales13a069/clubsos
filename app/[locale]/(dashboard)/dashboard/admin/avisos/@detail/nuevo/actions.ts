"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { AvisoFormState } from "../_components/AvisoForm";

export async function crearAvisoAction(
  _prev: AvisoFormState,
  formData: FormData,
): Promise<AvisoFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (actor?.rol !== "admin") return { error: "FORBIDDEN" };

  const locale           = String(formData.get("locale") ?? "es");
  const titulo           = String(formData.get("titulo") ?? "").trim();
  const descripcion      = String(formData.get("descripcion") ?? "").trim();
  const estado_aviso     = String(formData.get("estado_aviso") ?? "activa") as "activa" | "expirada";
  const fecha_inicio     = String(formData.get("fecha_inicio") ?? "").trim();
  const fecha_fin        = String(formData.get("fecha_fin") ?? "").trim();
  const aviso_image_url  = String(formData.get("aviso_image_url") ?? "").trim() || null;
  const empresa_ids      = formData.getAll("empresa_ids").map(String).filter(Boolean);

  if (!titulo) return { error: "TITULO_REQUERIDO" };
  if (fecha_inicio && fecha_fin && fecha_fin < fecha_inicio) return { error: "FECHA_FIN_INVALIDA" };

  const { data: inserted, error } = await supabase
    .from("avisos")
    .insert({
      titulo,
      descripcion:     descripcion || null,
      estado_aviso,
      fecha_inicio:    fecha_inicio  || null,
      fecha_fin:       fecha_fin     || null,
      empresa_id:      empresa_ids.length > 0 ? empresa_ids : null,
      aviso_image_url,
      creado_por:      user.id,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "INSERT_FAILED" };

  revalidatePath(`/${locale}/dashboard/admin/avisos`);
  redirect(`/${locale}/dashboard/admin/avisos/${inserted.id}`);
}
