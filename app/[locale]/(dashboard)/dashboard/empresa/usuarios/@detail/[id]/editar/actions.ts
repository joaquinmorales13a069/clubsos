"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export interface EmpresaUsuarioFormState { error?: string }

export async function actualizarEmpresaUsuarioAction(
  _prev: EmpresaUsuarioFormState,
  formData: FormData,
): Promise<EmpresaUsuarioFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase
    .from("users")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single();
  if (actor?.rol !== "empresa_admin" || !actor?.empresa_id) return { error: "FORBIDDEN" };

  const id              = String(formData.get("id") ?? "");
  const nombre_completo = String(formData.get("nombre_completo") ?? "").trim();
  const telefono_raw    = String(formData.get("telefono") ?? "").trim();
  const email_raw       = String(formData.get("email") ?? "").trim();
  const documento_raw   = String(formData.get("documento_identidad") ?? "").trim();
  const estado          = String(formData.get("estado") ?? "activo");
  const locale          = String(formData.get("locale") ?? "es");

  if (!nombre_completo) return { error: "NOMBRE_REQUERIDO" };

  // Verify target user belongs to actor's empresa BEFORE updating
  const { data: target } = await supabase
    .from("users")
    .select("empresa_id")
    .eq("id", id)
    .single();
  if (target?.empresa_id !== actor.empresa_id) return { error: "FORBIDDEN" };

  const { error } = await supabase
    .from("users")
    .update({
      nombre_completo,
      telefono:            telefono_raw  || null,
      email:               email_raw     || null,
      documento_identidad: documento_raw || null,
      estado,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/${locale}/dashboard/empresa/usuarios`);
  redirect(`/${locale}/dashboard/empresa/usuarios/${id}`);
}
