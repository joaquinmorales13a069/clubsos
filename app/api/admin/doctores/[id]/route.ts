/**
 * Admin · Doctor detail — get full detail (info + horarios + future
 * excepciones + asignacion de servicios), update info, soft-delete.
 *
 * Phase 4 · Step 5 of the native citas module.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

type Supa = Awaited<ReturnType<typeof createClient>>;

async function assertAdmin(supabase: Supa) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (profile?.rol !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const [doctorRes, horariosRes, excepcionesRes, serviciosRes] = await Promise.all([
    supabase
      .from("doctores")
      .select(`
        id, nombre, correo, activo, ubicacion_id,
        ubicacion:ubicaciones(id, nombre)
      `)
      .eq("id", id)
      .single(),
    supabase
      .from("horarios_doctores")
      .select("id, dia_semana, hora_inicio, hora_fin, slot_duracion, activo")
      .eq("doctor_id", id)
      .order("dia_semana")
      .order("hora_inicio"),
    supabase
      .from("excepciones_horario")
      .select("id, fecha_inicio, fecha_fin, motivo")
      .eq("doctor_id", id)
      .gte("fecha_fin", new Date().toISOString())
      .order("fecha_inicio"),
    supabase
      .from("doctor_servicios")
      .select("servicio_id, servicio:servicios(id, nombre)")
      .eq("doctor_id", id),
  ]);

  if (doctorRes.error || !doctorRes.data) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  return NextResponse.json({
    doctor:      doctorRes.data,
    horarios:    horariosRes.data ?? [],
    excepciones: excepcionesRes.data ?? [],
    servicios:   serviciosRes.data ?? [],
  });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as {
    nombre?:       string;
    correo?:       string;
    ubicacion_id?: string;
    activo?:       boolean;
  };

  const update: Record<string, unknown> = {};
  if (body.nombre       !== undefined) update.nombre       = body.nombre;
  if (body.correo       !== undefined) update.correo       = body.correo;
  if (body.ubicacion_id !== undefined) update.ubicacion_id = body.ubicacion_id;
  if (body.activo       !== undefined) update.activo       = body.activo;

  const { error } = await supabase
    .from("doctores")
    .update(update)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "doctor.editar",
    entidad:      "doctores",
    entidadId:    id,
    datosDespues: update,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const { error } = await supabase
    .from("doctores")
    .update({ activo: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "doctor.desactivar",
    entidad:      "doctores",
    entidadId:    id,
    datosDespues: { activo: false },
  });

  return NextResponse.json({ ok: true });
}
