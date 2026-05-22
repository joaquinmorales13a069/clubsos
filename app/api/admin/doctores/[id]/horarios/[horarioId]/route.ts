/**
 * Admin · Doctor → Horario item — partial update + hard delete.
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

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; horarioId: string }> },
) {
  const { id, horarioId } = await ctx.params;
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as {
    hora_inicio?:   string;
    hora_fin?:      string;
    slot_duracion?: number;
    activo?:        boolean;
  };

  const update: Record<string, unknown> = {};
  if (body.hora_inicio   !== undefined) update.hora_inicio   = body.hora_inicio;
  if (body.hora_fin      !== undefined) update.hora_fin      = body.hora_fin;
  if (body.slot_duracion !== undefined) update.slot_duracion = body.slot_duracion;
  if (body.activo        !== undefined) update.activo        = body.activo;

  const { error } = await supabase
    .from("horarios_doctores")
    .update(update)
    .eq("id", horarioId)
    .eq("doctor_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "horario.editar",
    entidad:      "horarios_doctores",
    entidadId:    horarioId,
    datosDespues: update,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; horarioId: string }> },
) {
  const { id, horarioId } = await ctx.params;
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const { error } = await supabase
    .from("horarios_doctores")
    .delete()
    .eq("id", horarioId)
    .eq("doctor_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "horario.eliminar",
    entidad:      "horarios_doctores",
    entidadId:    horarioId,
    datosDespues: { doctor_id: id },
  });

  return NextResponse.json({ ok: true });
}
