/**
 * Admin · Servicios (catalog) — list + create.
 *
 * Phase 4 · Step 4 of the native citas module.
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
    .from("servicios")
    .select(`
      id, nombre, descripcion, duracion, slot_duracion, precio, activo,
      doctor_servicios(count)
    `)
    .order("nombre");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ servicios: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as {
    nombre?:        string;
    descripcion?:   string | null;
    duracion?:      number | null;
    slot_duracion?: number;
    precio?:        number | null;
    activo?:        boolean;
  };

  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: "nombre is required" }, { status: 400 });
  }

  const slot = body.slot_duracion ?? 1;
  if (!Number.isInteger(slot) || slot < 1) {
    return NextResponse.json({ error: "slot_duracion must be an integer >= 1" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("servicios")
    .insert({
      nombre:        body.nombre.trim(),
      descripcion:   body.descripcion ?? null,
      duracion:      body.duracion ?? null,
      slot_duracion: slot,
      precio:        body.precio ?? null,
      activo:        body.activo ?? true,
    })
    .select("id, nombre, descripcion, duracion, slot_duracion, precio, activo, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "servicio.crear",
    entidad:      "servicios",
    entidadId:    data.id,
    datosDespues: data,
  });

  return NextResponse.json({ ok: true, servicio: data }, { status: 201 });
}
