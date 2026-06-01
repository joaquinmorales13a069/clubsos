"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { EmpresaFormState } from "../_components/EmpresaForm";

export async function crearEmpresaAction(
  _prev: EmpresaFormState,
  formData: FormData,
): Promise<EmpresaFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (actor?.rol !== "admin") return { error: "FORBIDDEN" };

  const nombre          = String(formData.get("nombre") ?? "").trim();
  const codigo_raw      = String(formData.get("codigo_empresa") ?? "").trim();
  const notas_raw       = String(formData.get("notas") ?? "").trim();
  const auto_confirmar  = formData.get("auto_confirmar_citas") === "true";
  const estado          = String(formData.get("estado") ?? "activa") as "activa" | "inactiva";
  const ruc_raw         = String(formData.get("ruc") ?? "").trim();
  const direccion_raw   = String(formData.get("direccion_calle") ?? "").trim();
  const departamento_raw= String(formData.get("departamento") ?? "").trim();
  const locale          = String(formData.get("locale") ?? "es");

  if (!nombre) return { error: "NOMBRE_REQUERIDO" };

  const { data: inserted, error } = await supabase
    .from("empresas")
    .insert({
      nombre,
      codigo_empresa: codigo_raw || null,
      notas: notas_raw || null,
      auto_confirmar_citas: auto_confirmar,
      estado,
      ruc: ruc_raw || null,
      direccion_calle: direccion_raw || null,
      departamento: departamento_raw || null,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "INSERT_FAILED" };

  revalidatePath(`/${locale}/dashboard/admin/empresas`);
  redirect(`/${locale}/dashboard/admin/empresas/${inserted.id}`);
}
