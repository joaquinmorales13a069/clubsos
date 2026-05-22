/**
 * Admin · Doctores — list + create.
 *
 * Phase 4 · Step 5 of the native citas module.
 * RLS already restricts writes to admin, but we double-check the role
 * here so we can return a consistent 401/403 envelope.
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

export async function GET() {
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const { data, error } = await supabase
    .from("doctores")
    .select(`
      id, nombre, correo, activo, created_at,
      ubicacion:ubicaciones(id, nombre),
      doctor_servicios(count)
    `)
    .order("nombre");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ doctores: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as {
    nombre?:       string;
    correo?:       string;
    ubicacion_id?: string;
    activo?:       boolean;
  };

  if (!body.nombre?.trim() || !body.ubicacion_id) {
    return NextResponse.json(
      { error: "nombre and ubicacion_id are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("doctores")
    .insert({
      nombre:       body.nombre.trim(),
      correo:       body.correo?.trim() || null,
      ubicacion_id: body.ubicacion_id,
      activo:       body.activo ?? true,
    })
    .select("id, nombre")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "doctor.crear",
    entidad:      "doctores",
    entidadId:    data.id,
    datosDespues: data,
  });

  return NextResponse.json({ ok: true, doctor: data }, { status: 201 });
}
