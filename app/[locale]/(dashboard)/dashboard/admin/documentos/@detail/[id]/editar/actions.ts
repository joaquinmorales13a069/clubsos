"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export type DocumentoEditarState = { error?: string };

export async function editarDocumentoAction(
  _prev: DocumentoEditarState,
  formData: FormData,
): Promise<DocumentoEditarState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (actor?.rol !== "admin") return { error: "FORBIDDEN" };

  const id               = String(formData.get("id") ?? "").trim();
  const locale           = String(formData.get("locale") ?? "es");
  const nombre_documento = String(formData.get("nombre_documento") ?? "").trim();
  const tipo_documento   = String(formData.get("tipo_documento") ?? "").trim();
  const fecha_documento  = String(formData.get("fecha_documento") ?? "").trim();
  const estado_archivo   = String(formData.get("estado_archivo") ?? "").trim();

  if (!id)               return { error: "ID_REQUERIDO" };
  if (!nombre_documento) return { error: "NOMBRE_REQUERIDO" };

  const { error } = await supabase
    .from("documentos_medicos")
    .update({
      nombre_documento,
      tipo_documento,
      fecha_documento:  fecha_documento || null,
      estado_archivo,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/${locale}/dashboard/admin/documentos`);
  redirect(`/${locale}/dashboard/admin/documentos/${id}`);
}
