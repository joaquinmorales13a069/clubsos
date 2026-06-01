"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { BeneficioFormState } from "../_components/BeneficioForm";

export async function crearBeneficioAction(
  _prev: BeneficioFormState,
  formData: FormData,
): Promise<BeneficioFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (actor?.rol !== "admin") return { error: "FORBIDDEN" };

  const locale             = String(formData.get("locale") ?? "es");
  const titulo             = String(formData.get("titulo") ?? "").trim();
  const descripcion        = String(formData.get("descripcion") ?? "").trim();
  const tipo_beneficio     = String(formData.get("tipo_beneficio") ?? "descuento") as "descuento" | "promocion";
  const estado_beneficio   = String(formData.get("estado_beneficio") ?? "activa") as "activa" | "expirada";
  const fecha_inicio       = String(formData.get("fecha_inicio") ?? "").trim();
  const fecha_fin          = String(formData.get("fecha_fin") ?? "").trim();
  const porcentaje_raw     = String(formData.get("porcentaje_descuento") ?? "").trim();
  const beneficio_image_url = String(formData.get("beneficio_image_url") ?? "").trim() || null;
  const empresa_ids        = formData.getAll("empresa_ids").map(String).filter(Boolean);

  if (!titulo) return { error: "TITULO_REQUERIDO" };
  if (fecha_inicio && fecha_fin && fecha_fin < fecha_inicio) return { error: "FECHA_FIN_INVALIDA" };

  const { data: inserted, error } = await supabase
    .from("beneficios")
    .insert({
      titulo,
      descripcion:          descripcion || null,
      tipo_beneficio,
      estado_beneficio,
      fecha_inicio:         fecha_inicio  || null,
      fecha_fin:            fecha_fin     || null,
      empresa_id:           empresa_ids.length > 0 ? empresa_ids : null,
      beneficio_image_url,
      porcentaje_descuento: tipo_beneficio === "descuento" && porcentaje_raw ? porcentaje_raw : null,
      creado_por:           user.id,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "INSERT_FAILED" };

  revalidatePath(`/${locale}/dashboard/admin/beneficios`);
  redirect(`/${locale}/dashboard/admin/beneficios/${inserted.id}`);
}
