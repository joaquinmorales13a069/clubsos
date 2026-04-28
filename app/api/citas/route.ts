import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type CreateCitaBody = {
  ea_service_id:        number;
  ea_provider_id:       number;
  fecha_hora_cita:      string;
  servicio_asociado?:   string;
  para_titular:         boolean;
  paciente_nombre?:     string;
  paciente_telefono?:   string;
  paciente_correo?:     string;
  paciente_cedula?:     string;
  motivo_cita?:         string;
  contrato_servicio_id?: string;
  metodo_pago?:         "link_pago" | "transferencia" | "pago_clinica";
  monto?:               number;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("rol, empresa_id, titular_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.rol !== "miembro") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: CreateCitaBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const titular_ref_id: string = profile.titular_id ?? user.id;

  let estado_sync: string;
  let contrato_servicio_id: string | null = null;

  if (body.contrato_servicio_id) {
    const { data: quota } = await supabase.rpc("check_cuota_disponible", {
      p_contrato_servicio_id: body.contrato_servicio_id,
      p_titular_ref_id: titular_ref_id,
    });

    if (typeof quota === "number" && quota > 0) {
      estado_sync = "pendiente_empresa";
      contrato_servicio_id = body.contrato_servicio_id;
    } else {
      if (!body.metodo_pago) {
        return NextResponse.json({ error: "Quota exhausted. metodo_pago required." }, { status: 409 });
      }
      estado_sync = body.metodo_pago === "pago_clinica" ? "pendiente_admin" : "pendiente_pago";
    }
  } else if (body.metodo_pago) {
    estado_sync = body.metodo_pago === "pago_clinica" ? "pendiente_admin" : "pendiente_pago";
  } else {
    return NextResponse.json({ error: "contrato_servicio_id or metodo_pago required" }, { status: 400 });
  }

  const { data: cita, error: citaError } = await supabase
    .from("citas")
    .insert({
      paciente_id:          user.id,
      empresa_id:           profile.empresa_id,
      ea_service_id:        body.ea_service_id,
      ea_provider_id:       body.ea_provider_id,
      fecha_hora_cita:      body.fecha_hora_cita + "-06:00",
      servicio_asociado:    body.servicio_asociado ?? null,
      estado_sync,
      para_titular:         body.para_titular,
      paciente_nombre:      body.paciente_nombre ?? null,
      paciente_telefono:    body.paciente_telefono ?? null,
      paciente_correo:      body.paciente_correo ?? null,
      paciente_cedula:      body.paciente_cedula ?? null,
      motivo_cita:          body.motivo_cita ?? null,
      contrato_servicio_id,
      titular_ref_id:       contrato_servicio_id ? titular_ref_id : null,
    })
    .select("id, estado_sync")
    .single();

  if (citaError || !cita) {
    return NextResponse.json({ error: citaError?.message ?? "Failed to create cita" }, { status: 500 });
  }

  if (body.metodo_pago) {
    const { error: pagoError } = await supabase.from("pagos").insert({
      cita_id: cita.id,
      metodo:  body.metodo_pago,
      monto:   body.monto ?? null,
    });
    if (pagoError) {
      console.error("[POST /api/citas] pagos insert failed:", pagoError);
      return NextResponse.json({ error: "Error al registrar el pago" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, cita }, { status: 201 });
}
