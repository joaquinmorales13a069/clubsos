"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export interface ActualizarUsuarioState {
  error?: string;
}

export async function actualizarUsuarioAction(
  _prevState: ActualizarUsuarioState,
  formData: FormData,
): Promise<ActualizarUsuarioState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (actor?.rol !== "admin") return { error: "FORBIDDEN" };

  const id              = String(formData.get("id") ?? "");
  const nombre_completo = String(formData.get("nombre_completo") ?? "").trim();
  const telefono_raw    = String(formData.get("telefono") ?? "").trim();
  const email_raw       = String(formData.get("email") ?? "").trim();
  const rol             = String(formData.get("rol") ?? "");
  const estado          = String(formData.get("estado") ?? "");
  const empresa_id_raw  = formData.get("empresa_id");
  const empresa_id      = empresa_id_raw && String(empresa_id_raw) !== "" ? String(empresa_id_raw) : null;
  const locale          = String(formData.get("locale") ?? "es");

  if (!nombre_completo) return { error: "NOMBRE_REQUERIDO" };

  const { error } = await supabase
    .from("users")
    .update({
      nombre_completo,
      telefono: telefono_raw || null,
      email:    email_raw    || null,
      rol,
      estado,
      empresa_id,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/${locale}/dashboard/admin/usuarios`);
  redirect(`/${locale}/dashboard/admin/usuarios/${id}`);
}
