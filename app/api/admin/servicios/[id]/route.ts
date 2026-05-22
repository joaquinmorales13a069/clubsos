/**
 * Admin · Servicios (catalog) — update + soft delete.
 *
 * Phase 4 · Step 4 of the native citas module.
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
    nombre?:        string;
    descripcion?:   string | null;
    duracion?:      number | null;
    slot_duracion?: number;
    precio?:        number | null;
    activo?:        boolean;
  };

  const update: Record<string, unknown> = {};
  if (body.nombre        !== undefined) update.nombre        = body.nombre;
  if (body.descripcion   !== undefined) update.descripcion   = body.descripcion;
  if (body.duracion      !== undefined) update.duracion      = body.duracion;
  if (body.slot_duracion !== undefined) {
    if (!Number.isInteger(body.slot_duracion) || body.slot_duracion < 1) {
      return NextResponse.json({ error: "slot_duracion must be an integer >= 1" }, { status: 400 });
    }
    update.slot_duracion = body.slot_duracion;
  }
  if (body.precio        !== undefined) update.precio        = body.precio;
  if (body.activo        !== undefined) update.activo        = body.activo;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("servicios")
    .update(update)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "servicio.editar",
    entidad:      "servicios",
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
    .from("servicios")
    .update({ activo: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "servicio.desactivar",
    entidad:      "servicios",
    entidadId:    id,
    datosDespues: { activo: false },
  });

  return NextResponse.json({ ok: true });
}
