/**
 * POST /api/ea/citas/aprobar
 *
 * Approves a pending cita and syncs it with Easy!Appointments.
 *
 * Flow:
 *   1. Verify caller is an authenticated empresa_admin.
 *   2. Fetch the cita (with service duration + paciente ea_customer_id).
 *   3. Verify cita is still `pendiente` and belongs to the caller's empresa.
 *   4. Build the EA appointment payload:
 *        - customerId  → public.users.ea_customer_id of the paciente_id user
 *        - start       → fecha_hora_cita formatted as "YYYY-MM-DD HH:mm:ss"
 *        - end         → start + service duration (default 30 min if unknown)
 *        - book        → current server timestamp
 *        - notes       → patient details when para_titular = false (third-party)
 *   5. POST to EA API /appointments.
 *   6. Update public.citas: estado_sync = 'confirmado', ea_appointment_id = <id from EA>.
 *
 *   If the EA call fails for any reason, the cita is still approved in DB
 *   (soft fail — EA downtime must not block the approval workflow).
 *
 * Body:   { citaId: string }
 * Returns: { ok: true, cita: { id, estado_sync, ea_appointment_id } }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// ── EA credentials (server-side only) ─────────────────────────────────────────

const EA_RAW_URL = process.env.NEXT_PUBLIC_EA_API_URL ?? "";
const EA_KEY     = process.env.EA_API_KEY ?? "";

/**
 * Normalise the configured EA URL to a base that ends without /api/v1.
 * Supports both  https://host/index.php/api/v1/  and  https://host
 */
function eaBase(): string {
  return EA_RAW_URL
    .replace(/\/+$/, "")          // strip trailing slash
    .replace(/\/api\/v1$/, "");   // strip /api/v1 suffix if present
}

/** Format a Date as "YYYY-MM-DD HH:mm:ss" in Nicaragua local time (UTC-6, no DST). */
const NI_OFFSET_MS = -6 * 60 * 60 * 1000;
function toEaDatetime(d: Date): string {
  const ni  = new Date(d.getTime() + NI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${ni.getUTCFullYear()}-${pad(ni.getUTCMonth() + 1)}-${pad(ni.getUTCDate())} ` +
    `${pad(ni.getUTCHours())}:${pad(ni.getUTCMinutes())}:${pad(ni.getUTCSeconds())}`
  );
}

// ── Types for Supabase joined result ──────────────────────────────────────────

type CitaRow = {
  id:                string;
  estado_sync:       string;
  ea_appointment_id: string | null;
  ea_service_id:     number | null;
  ea_provider_id:    number | null;
  fecha_hora_cita:   string;
  para_titular:      boolean;
  paciente_nombre:   string | null;
  paciente_telefono: string | null;
  paciente_correo:   string | null;
  paciente_cedula:   string | null;
  motivo_cita:       string | null;
  paciente: {
    ea_customer_id: number | null;
  } | null;
  servicio: {
    duracion: number | null;
  } | null;
};

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // ── 1. Verify session ──────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Verify role ─────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("users")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "empresa_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── 3. Parse body ──────────────────────────────────────────────────────────
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

  // ── 4. Fetch cita with service duration + paciente ea_customer_id ──────────
  const { data: cita, error: citaError } = await supabase
    .from("citas")
    .select(`
      id, estado_sync, ea_appointment_id,
      ea_service_id, ea_provider_id,
      fecha_hora_cita, para_titular,
      paciente_nombre, paciente_telefono, paciente_correo, paciente_cedula, motivo_cita,
      paciente:users!paciente_id(ea_customer_id),
      servicio:servicios!citas_ea_service_id_fkey(duracion)
    `)
    .eq("id", citaId)
    .single();

  if (citaError || !cita) {
    return NextResponse.json({ error: "Cita not found" }, { status: 404 });
  }

  const citaTyped = cita as unknown as CitaRow;

  // ── 5. Guard: must still be pending ───────────────────────────────────────
  if (citaTyped.estado_sync !== "pendiente") {
    return NextResponse.json(
      { error: `Cita already in state: ${citaTyped.estado_sync}` },
      { status: 409 },
    );
  }

  // ── 6. EA sync ────────────────────────────────────────────────────────────
  let eaAppointmentId: string | null = citaTyped.ea_appointment_id ?? null;

  const hasEaCreds   = Boolean(EA_RAW_URL && EA_KEY);
  const hasEaService = Boolean(citaTyped.ea_service_id && citaTyped.ea_provider_id);
  const customerId   = citaTyped.paciente?.ea_customer_id ?? null;

  if (hasEaCreds && hasEaService && customerId) {
    try {
      const base         = eaBase();
      const startDate    = new Date(citaTyped.fecha_hora_cita);
      const duracionMin  = citaTyped.servicio?.duracion ?? 30;
      const endDate      = new Date(startDate.getTime() + duracionMin * 60_000);

      // Build notes for third-party patients (para_titular = false)
      let notes: string | undefined;
      if (!citaTyped.para_titular) {
        const parts: string[] = ["[Paciente tercero]"];
        if (citaTyped.paciente_nombre)   parts.push(`Nombre: ${citaTyped.paciente_nombre}`);
        if (citaTyped.paciente_telefono) parts.push(`Teléfono: ${citaTyped.paciente_telefono}`);
        if (citaTyped.paciente_correo)   parts.push(`Correo: ${citaTyped.paciente_correo}`);
        if (citaTyped.paciente_cedula)   parts.push(`Cédula: ${citaTyped.paciente_cedula}`);
        if (citaTyped.motivo_cita)       parts.push(`Motivo: ${citaTyped.motivo_cita}`);
        notes = parts.join("\n");
      } else if (citaTyped.motivo_cita) {
        notes = citaTyped.motivo_cita;
      }

      const payload: Record<string, unknown> = {
        book:       toEaDatetime(new Date()),
        start:      toEaDatetime(startDate),
        end:        toEaDatetime(endDate),
        serviceId:  citaTyped.ea_service_id,
        providerId: citaTyped.ea_provider_id,
        customerId: Number(customerId),
      };

      if (notes) payload.notes = notes;

      const eaRes = await fetch(`${base}/api/v1/appointments`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${EA_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (eaRes.ok) {
        const eaData = await eaRes.json() as { id?: number };
        if (eaData.id) {
          eaAppointmentId = String(eaData.id);
        } else {
          console.warn("[aprobar] EA returned OK but no appointment id:", eaData);
        }
      } else {
        const errText = await eaRes.text().catch(() => "(no body)");
        console.error(
          `[aprobar] EA API returned HTTP ${eaRes.status}: ${errText}`,
        );
        // Soft fail — approve in DB even if EA rejects
      }
    } catch (err) {
      // Network error or unexpected exception — approve in DB only
      console.error("[aprobar] EA API call threw an exception:", err);
    }
  } else {
    // Log why EA sync was skipped (helps debugging)
    if (!hasEaCreds)   console.info("[aprobar] EA credentials not configured — DB-only approval.");
    if (!hasEaService) console.info("[aprobar] Cita missing ea_service_id or ea_provider_id — DB-only approval.");
    if (!customerId)   console.warn("[aprobar] Paciente has no ea_customer_id — DB-only approval.");
  }

  // ── 7. Persist approval in DB ─────────────────────────────────────────────
  // RLS citas_empresa_admin_update enforces empresa scope — no extra filter needed.
  const { data: updated, error: updateError } = await supabase
    .from("citas")
    .update({
      estado_sync:       "confirmado",
      ea_appointment_id: eaAppointmentId,
    })
    .eq("id", citaId)
    .select("id, estado_sync, ea_appointment_id")
    .single();

  if (updateError) {
    console.error("[aprobar] Failed to update cita in DB:", updateError);
    return NextResponse.json({ error: "Failed to update cita" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cita: updated });
}
