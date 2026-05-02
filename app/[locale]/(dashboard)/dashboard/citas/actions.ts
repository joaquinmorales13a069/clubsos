"use server";

/**
 * Server Actions for citas (appointment) management.
 * RLS on public.citas (citas_miembro_crud) enforces auth.uid() = paciente_id.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

// ── EA helpers (mirrors app/api/ea/citas/aprobar/route.ts) ────────────────────

const EA_RAW_URL = process.env.NEXT_PUBLIC_EA_API_URL ?? "";
const EA_KEY     = process.env.EA_API_KEY ?? "";

function eaBase(): string {
  return EA_RAW_URL
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "");
}

/** EA expects "YYYY-MM-DD HH:mm:ss" in Nicaragua local time (UTC-6, no DST). */
const NI_OFFSET_MS = -6 * 60 * 60 * 1000;
function toEaDatetime(d: Date): string {
  const ni  = new Date(d.getTime() + NI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${ni.getUTCFullYear()}-${pad(ni.getUTCMonth() + 1)}-${pad(ni.getUTCDate())} ` +
    `${pad(ni.getUTCHours())}:${pad(ni.getUTCMinutes())}:${pad(ni.getUTCSeconds())}`
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── crearCita ─────────────────────────────────────────────────────────────────

export async function crearCita(input: CrearCitaInput) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // Fetch rol + empresa auto_confirmar_citas in parallel.
  const [profileRes, empresaRes] = await Promise.all([
    supabase.from("users").select("rol").eq("id", user.id).single(),
    input.empresaId
      ? supabase.from("empresas").select("auto_confirmar_citas").eq("id", input.empresaId).single()
      : Promise.resolve({ data: null }),
  ]);

  const isEmpresaAdmin  = profileRes.data?.rol === "empresa_admin";
  const autoConfirmar   = empresaRes.data?.auto_confirmar_citas ?? false;
  const estadoSync      = isEmpresaAdmin ? "confirmado" : "pendiente";

  // Insert and return the new cita ID so we can update ea_appointment_id later.
  const { data: inserted, error } = await supabase
    .from("citas")
    .insert({
      paciente_id:       user.id,
      empresa_id:        input.empresaId,
      ea_customer_id:    input.eaCustomerId,
      ea_service_id:     input.eaServiceId,
      ea_provider_id:    input.eaProviderId,
      fecha_hora_cita:   input.fechaHoraCita + "-06:00",
      servicio_asociado: input.servicioAsociado,
      para_titular:      input.paraTitular,
      paciente_nombre:   input.pacienteNombre,
      paciente_telefono: input.pacienteTelefono,
      paciente_correo:   input.pacienteCorreo,
      paciente_cedula:   input.pacienteCedula?.replace(/-/g, "") ?? null,
      motivo_cita:       input.motivoCita,
      estado_sync:       estadoSync,
      ea_appointment_id: null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logAction(supabase, {
    actorId:      user.id,
    actorRol:     profileRes.data?.rol ?? "miembro",
    accion:       "cita.crear",
    entidad:      "citas",
    entidadId:    inserted.id,
    datosDespues: {
      estado_sync:       estadoSync,
      servicio_asociado: input.servicioAsociado,
      fecha_hora_cita:   input.fechaHoraCita,
      para_titular:      input.paraTitular,
    },
  });

  // ── EA sync ───────────────────────────────────────────────────────────────
  // Triggers when: empresa_admin creates (always confirmed) OR empresa has
  // auto_confirmar_citas ON (DB trigger already confirmed the cita).
  if ((isEmpresaAdmin || autoConfirmar) && input.eaCustomerId) {
    const hasEaCreds   = Boolean(EA_RAW_URL && EA_KEY);
    const hasEaService = Boolean(input.eaServiceId && input.eaProviderId);

    if (hasEaCreds && hasEaService) {
      try {
        // Fetch service duration for end-time calculation.
        const { data: svcRow } = await supabase
          .from("servicios")
          .select("duracion")
          .eq("ea_service_id", input.eaServiceId)
          .single();

        const duracionMin = (svcRow?.duracion as number | null) ?? 30;
        const startDate   = new Date(input.fechaHoraCita);
        const endDate     = new Date(startDate.getTime() + duracionMin * 60_000);

        // Build notes for third-party patients.
        let notes: string | undefined;
        if (!input.paraTitular) {
          const parts: string[] = ["[Paciente tercero]"];
          if (input.pacienteNombre)   parts.push(`Nombre: ${input.pacienteNombre}`);
          if (input.pacienteTelefono) parts.push(`Teléfono: ${input.pacienteTelefono}`);
          if (input.pacienteCorreo)   parts.push(`Correo: ${input.pacienteCorreo}`);
          if (input.pacienteCedula)   parts.push(`Cédula: ${input.pacienteCedula}`);
          if (input.motivoCita)       parts.push(`Motivo: ${input.motivoCita}`);
          notes = parts.join("\n");
        } else if (input.motivoCita) {
          notes = input.motivoCita;
        }

        const payload: Record<string, unknown> = {
          book:       toEaDatetime(new Date()),
          start:      toEaDatetime(startDate),
          end:        toEaDatetime(endDate),
          serviceId:  input.eaServiceId,
          providerId: input.eaProviderId,
          customerId: input.eaCustomerId,
        };
        if (notes) payload.notes = notes;

        const eaRes = await fetch(`${eaBase()}/api/v1/appointments`, {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${EA_KEY}`,
          },
          body: JSON.stringify(payload),
        });

        if (eaRes.ok) {
          const eaData = await eaRes.json() as { id?: number };
          if (eaData.id && inserted?.id) {
            await supabase
              .from("citas")
              .update({ ea_appointment_id: String(eaData.id) })
              .eq("id", inserted.id);
          } else {
            console.warn("[crearCita] EA returned OK but no appointment id:", eaData);
          }
        } else {
          const errText = await eaRes.text().catch(() => "(no body)");
          console.error(`[crearCita] EA API returned HTTP ${eaRes.status}: ${errText}`);
        }
      } catch (err) {
        console.error("[crearCita] EA API call threw an exception:", err);
      }
    } else {
      if (!hasEaCreds)   console.info("[crearCita] EA credentials not configured — DB-only.");
      if (!hasEaService) console.info("[crearCita] Missing eaServiceId or eaProviderId — DB-only.");
    }
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// ── cancelarCita ──────────────────────────────────────────────────────────────

export async function cancelarCita(citaId: string, eaAppointmentId: string | null) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();

  // If already synced to EA, delete there first
  if (eaAppointmentId) {
    const EA_BASE = process.env.NEXT_PUBLIC_EA_API_URL ?? "";
    const EA_KEY  = process.env.EA_API_KEY ?? "";
    if (EA_BASE && EA_KEY) {
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

  await logAction(supabase, {
    actorId:      user.id,
    actorRol:     profile?.rol ?? "miembro",
    accion:       "cita.cancelar",
    entidad:      "citas",
    entidadId:    citaId,
    datosDespues: { estado_sync: "cancelado" },
  });

  revalidatePath("/", "layout");
  return { success: true };
}
