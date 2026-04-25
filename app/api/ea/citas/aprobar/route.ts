/**
 * POST /api/ea/citas/aprobar
 *
 * Approves a pending cita. Keeps Easy!Appointments credentials server-side.
 *
 * Flow:
 *   1. Verify the caller is an authenticated empresa_admin.
 *   2. (TODO: EA integration) Push appointment to Easy!Appointments API,
 *      receive the ea_appointment_id back.
 *   3. Update public.citas: estado_sync = 'confirmado', ea_appointment_id = <from EA>.
 *
 * Body: { citaId: string }
 * Returns: { ok: true, cita: { id, estado_sync, ea_appointment_id } }
 *
 * NOTE: EA integration is a future step. Until credentials are configured,
 * the handler approves directly in DB (estado_sync = 'confirmado').
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const EA_BASE = process.env.NEXT_PUBLIC_EA_API_URL ?? "";
const EA_KEY  = process.env.EA_API_KEY ?? "";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Verify session
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify role
  const { data: profile } = await supabase
    .from("users")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "empresa_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse body
  let citaId: string | undefined;
  try {
    const body = await req.json() as { citaId?: string };
    citaId = body.citaId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!citaId) {
    return NextResponse.json({ error: "citaId is required" }, { status: 400 });
  }

  // Fetch the cita to verify it belongs to this empresa and is still pending
  const { data: cita, error: citaError } = await supabase
    .from("citas")
    .select("id, estado_sync, ea_appointment_id, ea_service_id, ea_provider_id, paciente_id, fecha_hora_cita")
    .eq("id", citaId)
    .single();

  if (citaError || !cita) {
    return NextResponse.json({ error: "Cita not found" }, { status: 404 });
  }

  if (cita.estado_sync !== "pendiente") {
    return NextResponse.json(
      { error: `Cita already in state: ${cita.estado_sync}` },
      { status: 409 },
    );
  }

  let eaAppointmentId: string | null = cita.ea_appointment_id ?? null;

  // ── EA Integration (when credentials are configured) ───────────────────────
  if (EA_BASE && EA_KEY && cita.ea_service_id && cita.ea_provider_id) {
    try {
      const base = EA_BASE.replace(/\/+$/, "").replace(/\/api\/v1$/, "");

      const eaRes = await fetch(`${base}/api/v1/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${EA_KEY}`,
        },
        body: JSON.stringify({
          start: cita.fecha_hora_cita,
          end:   cita.fecha_hora_cita, // EA calculates end from service duration
          serviceId:  cita.ea_service_id,
          providerId: cita.ea_provider_id,
        }),
      });

      if (eaRes.ok) {
        const eaData = await eaRes.json() as { id?: number };
        if (eaData.id) {
          eaAppointmentId = String(eaData.id);
        }
      }
      // If EA call fails, still approve in DB — EA sync can be retried later.
    } catch {
      // Log and continue — EA downtime should not block approval workflow.
      console.error("[aprobar] EA API call failed, approving in DB only.");
    }
  }

  // Update cita in DB — RLS citas_empresa_admin_update enforces authorization
  const { data: updated, error: updateError } = await supabase
    .from("citas")
    .update({
      estado_sync:      "confirmado",
      ea_appointment_id: eaAppointmentId,
    })
    .eq("id", citaId)
    .select("id, estado_sync, ea_appointment_id")
    .single();

  if (updateError) {
    return NextResponse.json({ error: "Failed to update cita" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cita: updated });
}
