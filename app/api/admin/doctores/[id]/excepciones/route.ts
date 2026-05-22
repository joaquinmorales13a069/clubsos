/**
 * Admin · Doctor → Excepciones — create a new exception window.
 *
 * Phase 4 · Step 5 of the native citas module.
 * Body: { fecha_inicio (ISO), fecha_fin (ISO), motivo? }.
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
    fecha_inicio?: string;
    fecha_fin?:    string;
    motivo?:       string;
  };

  if (!body.fecha_inicio || !body.fecha_fin) {
    return NextResponse.json(
      { error: "fecha_inicio and fecha_fin are required (ISO)" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("excepciones_horario")
    .insert({
      doctor_id:    id,
      fecha_inicio: body.fecha_inicio,
      fecha_fin:    body.fecha_fin,
      motivo:       body.motivo ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "excepcion.crear",
    entidad:      "excepciones_horario",
    entidadId:    data.id,
    datosDespues: { doctor_id: id, ...body },
  });

  return NextResponse.json({ ok: true, excepcion: data }, { status: 201 });
}
