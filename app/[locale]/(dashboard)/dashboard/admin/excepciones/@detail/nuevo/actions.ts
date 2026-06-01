"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { ExcepcionFormState } from "../_components/ExcepcionForm";

export async function crearExcepcionAction(
  _prev: ExcepcionFormState,
  formData: FormData,
): Promise<ExcepcionFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHORIZED" };

  const { data: actor } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (actor?.rol !== "admin") return { error: "FORBIDDEN" };

  const locale       = String(formData.get("locale") ?? "es");
  const scope        = String(formData.get("scope") ?? "global");
  const doctorIdRaw  = String(formData.get("doctor_id") ?? "").trim();
  const ubiIdRaw     = String(formData.get("ubicacion_id") ?? "").trim();
  const fechaInicio  = String(formData.get("fecha_inicio") ?? "").trim();
  const fechaFin     = String(formData.get("fecha_fin") ?? "").trim();
  const motivoRaw    = String(formData.get("motivo") ?? "").trim();

  if (!fechaInicio || !fechaFin) return { error: "FECHAS_REQUERIDAS" };

  const start = new Date(fechaInicio);
  const end   = new Date(fechaFin);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return { error: "FECHAS_INVALIDAS" };
  if (end <= start) return { error: "FIN_ANTES_INICIO" };

  const doctor_id    = (scope === "doctor"    || scope === "both") ? (doctorIdRaw  || null) : null;
  const ubicacion_id = (scope === "ubicacion" || scope === "both") ? (ubiIdRaw     || null) : null;

  if ((scope === "doctor"    || scope === "both") && !doctor_id)    return { error: "DOCTOR_REQUERIDO" };
  if ((scope === "ubicacion" || scope === "both") && !ubicacion_id) return { error: "UBICACION_REQUERIDA" };

  const { data: inserted, error } = await supabase
    .from("excepciones_horario")
    .insert({
      doctor_id,
      ubicacion_id,
      fecha_inicio: start.toISOString(),
      fecha_fin:    end.toISOString(),
      motivo:       motivoRaw || null,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "INSERT_FAILED" };

  revalidatePath(`/${locale}/dashboard/admin/excepciones`);
  redirect(`/${locale}/dashboard/admin/excepciones/${inserted.id}`);
}
