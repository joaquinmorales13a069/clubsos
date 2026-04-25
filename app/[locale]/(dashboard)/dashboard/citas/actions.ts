"use server";

/**
 * Server Actions for citas (appointment) management.
 * RLS on public.citas (citas_miembro_crud) enforces auth.uid() = paciente_id.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export interface CrearCitaInput {
  empresaId:        string | null;
  eaCustomerId:     number | null;
  eaServiceId:      number;
  eaProviderId:     number;
  fechaHoraCita:    string;       // ISO: "YYYY-MM-DDTHH:MM:00"
  servicioAsociado: string;
  paraTitular:      boolean;
  pacienteNombre:   string | null;
  pacienteTelefono: string | null;
  pacienteCorreo:   string | null;
  pacienteCedula:   string | null;
  motivoCita:       string | null;
}

export async function crearCita(input: CrearCitaInput) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase.from("citas").insert({
    paciente_id:      user.id,
    empresa_id:       input.empresaId,
    ea_customer_id:   input.eaCustomerId,
    ea_service_id:    input.eaServiceId,
    ea_provider_id:   input.eaProviderId,
    fecha_hora_cita:  input.fechaHoraCita,
    servicio_asociado: input.servicioAsociado,
    para_titular:     input.paraTitular,
    paciente_nombre:  input.pacienteNombre,
    paciente_telefono: input.pacienteTelefono,
    paciente_correo:  input.pacienteCorreo,
    paciente_cedula:  input.pacienteCedula,
    motivo_cita:      input.motivoCita,
    estado_sync:      "pendiente",
    ea_appointment_id: null,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function cancelarCita(citaId: string, eaAppointmentId: string | null) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // If already synced to EA, delete there first
  if (eaAppointmentId) {
    const EA_BASE = process.env.NEXT_PUBLIC_EA_API_URL ?? "";
    const EA_KEY  = process.env.EA_API_KEY ?? "";
    if (EA_BASE && EA_KEY) {
      // Normalize EA_BASE: remove trailing slash and redundant /api/v1 if present
      const base = EA_BASE.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
      await fetch(`${base}/api/v1/appointments/${eaAppointmentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${EA_KEY}` },
      }).catch(() => {
        // Log but don't block — still cancel locally
      });
    }
  }

  const { error } = await supabase
    .from("citas")
    .update({ estado_sync: "cancelado" })
    .eq("id", citaId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
