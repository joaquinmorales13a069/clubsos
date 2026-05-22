/**
 * Admin · Ubicaciones (clinics) — list + create.
 *
 * Phase 4 · Step 2 of the native citas module.
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
    .from("ubicaciones")
    .select("id, nombre, direccion, telefono, zona_horaria, activo, created_at")
    .order("nombre");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ubicaciones: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as {
    nombre?:       string;
    direccion?:    string | null;
    telefono?:     string | null;
    zona_horaria?: string;
    activo?:       boolean;
  };

  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: "nombre is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ubicaciones")
    .insert({
      nombre:       body.nombre.trim(),
      direccion:    body.direccion ?? null,
      telefono:     body.telefono ?? null,
      zona_horaria: body.zona_horaria ?? "America/Managua",
      activo:       body.activo ?? true,
    })
    .select("id, nombre, direccion, telefono, zona_horaria, activo, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "ubicacion.crear",
    entidad:      "ubicaciones",
    entidadId:    data.id,
    datosDespues: data,
  });

  return NextResponse.json({ ok: true, ubicacion: data }, { status: 201 });
}
