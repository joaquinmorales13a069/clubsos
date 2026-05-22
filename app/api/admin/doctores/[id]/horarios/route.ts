/**
 * Admin · Doctor → Horarios — create a new weekly bloque.
 *
 * Phase 4 · Step 5 of the native citas module.
 * Body: { dia_semana, hora_inicio, hora_fin, slot_duracion?, activo? }.
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

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as {
    dia_semana?:    number;
    hora_inicio?:   string;
    hora_fin?:      string;
    slot_duracion?: number;
    activo?:        boolean;
  };

  if (
    typeof body.dia_semana !== "number" ||
    body.dia_semana < 0 ||
    body.dia_semana > 6
  ) {
    return NextResponse.json(
      { error: "dia_semana must be 0..6" },
      { status: 400 },
    );
  }
  if (!body.hora_inicio || !body.hora_fin) {
    return NextResponse.json(
      { error: "hora_inicio and hora_fin are required (HH:MM)" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("horarios_doctores")
    .insert({
      doctor_id:     id,
      dia_semana:    body.dia_semana,
      hora_inicio:   body.hora_inicio,
      hora_fin:      body.hora_fin,
      slot_duracion: body.slot_duracion ?? 30,
      activo:        body.activo ?? true,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "horario.crear",
    entidad:      "horarios_doctores",
    entidadId:    data.id,
    datosDespues: { doctor_id: id, ...body },
  });

  return NextResponse.json({ ok: true, horario: data }, { status: 201 });
}
