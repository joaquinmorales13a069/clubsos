/**
 * Admin · Ubicaciones (clinics) — update + soft delete.
 *
 * Phase 4 · Step 2 of the native citas module.
 * DELETE is a soft delete (sets activo = false) so historical citas keep
 * their FK reference intact.
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
  ctx: { params: Promise<{ id: string }> },
) {
  const { id }   = await ctx.params;
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

  const update: Record<string, unknown> = {};
  if (body.nombre       !== undefined) update.nombre       = body.nombre;
  if (body.direccion    !== undefined) update.direccion    = body.direccion;
  if (body.telefono     !== undefined) update.telefono     = body.telefono;
  if (body.zona_horaria !== undefined) update.zona_horaria = body.zona_horaria;
  if (body.activo       !== undefined) update.activo       = body.activo;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("ubicaciones")
    .update(update)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "ubicacion.editar",
    entidad:      "ubicaciones",
    entidadId:    id,
    datosDespues: update,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id }   = await ctx.params;
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const { error } = await supabase
    .from("ubicaciones")
    .update({ activo: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "ubicacion.desactivar",
    entidad:      "ubicaciones",
    entidadId:    id,
    datosDespues: { activo: false },
  });

  return NextResponse.json({ ok: true });
}
