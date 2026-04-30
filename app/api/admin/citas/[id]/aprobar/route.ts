import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

const EA_RAW_URL = process.env.NEXT_PUBLIC_EA_API_URL ?? "";
const EA_KEY     = process.env.EA_API_KEY ?? "";

function eaBase() {
  return EA_RAW_URL.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

const NI_OFFSET_MS = -6 * 60 * 60 * 1000;
function toEaDatetime(d: Date): string {
  const ni  = new Date(d.getTime() + NI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ni.getUTCFullYear()}-${pad(ni.getUTCMonth()+1)}-${pad(ni.getUTCDate())} ${pad(ni.getUTCHours())}:${pad(ni.getUTCMinutes())}:${pad(ni.getUTCSeconds())}`;
}

type CitaRow = {
  id: string; estado_sync: string; ea_appointment_id: string | null;
  ea_service_id: number | null; ea_provider_id: number | null;
  fecha_hora_cita: string; para_titular: boolean;
  paciente_nombre: string | null; paciente_telefono: string | null;
  paciente_correo: string | null; paciente_cedula: string | null; motivo_cita: string | null;
  paciente: { ea_customer_id: number | null } | null;
  servicio: { duracion: number | null } | null;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let citaId: string;
  try { ({ citaId } = await req.json()); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data: cita } = await supabase
    .from("citas")
    .select(`
      id, estado_sync, ea_appointment_id, ea_service_id, ea_provider_id,
      fecha_hora_cita, para_titular, paciente_nombre, paciente_telefono,
      paciente_correo, paciente_cedula, motivo_cita,
      paciente:users!paciente_id(ea_customer_id),
      servicio:servicios!citas_ea_service_id_fkey(duracion)
    `)
    .eq("id", citaId)
    .single();

  if (!cita) return NextResponse.json({ error: "Cita not found" }, { status: 404 });
  const c = cita as unknown as CitaRow;
  if (c.estado_sync !== "pendiente_admin") {
    return NextResponse.json({ error: `Cannot approve cita in state: ${c.estado_sync}` }, { status: 409 });
  }

  let eaAppointmentId: string | null = c.ea_appointment_id ?? null;
  const customerId = c.paciente?.ea_customer_id ?? null;
  if (EA_RAW_URL && EA_KEY && c.ea_service_id && c.ea_provider_id && customerId) {
    try {
      const start = new Date(c.fecha_hora_cita);
      const end   = new Date(start.getTime() + (c.servicio?.duracion ?? 30) * 60_000);
      let notes: string | undefined;
      if (!c.para_titular) {
        const parts = ["[Paciente tercero]"];
        if (c.paciente_nombre)   parts.push(`Nombre: ${c.paciente_nombre}`);
        if (c.paciente_telefono) parts.push(`Teléfono: ${c.paciente_telefono}`);
        if (c.motivo_cita)       parts.push(`Motivo: ${c.motivo_cita}`);
        notes = parts.join("\n");
      } else if (c.motivo_cita) {
        notes = c.motivo_cita;
      }
      const payload: Record<string, unknown> = {
        book: toEaDatetime(new Date()), start: toEaDatetime(start), end: toEaDatetime(end),
        serviceId: c.ea_service_id, providerId: c.ea_provider_id, customerId: Number(customerId),
      };
      if (notes) payload.notes = notes;
      const res = await fetch(`${eaBase()}/api/v1/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${EA_KEY}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const d = await res.json() as { id?: number };
        if (d.id) eaAppointmentId = String(d.id);
      } else {
        console.error(`[admin/aprobar] EA HTTP ${res.status}:`, await res.text().catch(() => ""));
      }
    } catch (err) { console.error("[admin/aprobar] EA error:", err); }
  }

  const { data: updated, error } = await supabase
    .from("citas")
    .update({ estado_sync: "confirmado", ea_appointment_id: eaAppointmentId })
    .eq("id", citaId)
    .select("id, estado_sync, ea_appointment_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(supabase, {
    actorId:      user.id,
    actorRol:     profile?.rol ?? "admin",
    accion:       "cita.aprobar",
    entidad:      "citas",
    entidadId:    citaId,
    datosDespues: { estado_sync: "confirmado", ea_appointment_id: eaAppointmentId },
  });
  return NextResponse.json({ ok: true, cita: updated });
}
