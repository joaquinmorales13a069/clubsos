import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("rol").eq("id", user.id).single();
  return data?.rol === "admin" ? { user, rol: data.rol as string } : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const actor = await assertAdmin(supabase);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const allowed = ["nombre", "fecha_inicio", "fecha_fin", "tipo_reset", "dia_reset", "activo"];
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { data: before } = await supabase
    .from("contratos")
    .select("nombre, fecha_inicio, fecha_fin, tipo_reset, dia_reset, activo, empresa_id")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("contratos")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId: actor.user.id,
    actorRol: actor.rol,
    accion: "contrato.actualizar",
    entidad: "contratos",
    entidadId: id,
    datosAntes: before as Record<string, unknown>,
    datosDespues: patch,
    ipAddress: req.headers.get("x-forwarded-for"),
    metadata: { empresa_id: (before as Record<string, unknown> | null)?.empresa_id },
  });

  return NextResponse.json({ contrato: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const actor = await assertAdmin(supabase);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const { data: before } = await supabase
    .from("contratos")
    .select("nombre, empresa_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("contratos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId: actor.user.id,
    actorRol: actor.rol,
    accion: "contrato.eliminar",
    entidad: "contratos",
    entidadId: id,
    datosAntes: before as Record<string, unknown>,
    ipAddress: _req.headers.get("x-forwarded-for"),
    metadata: { empresa_id: (before as Record<string, unknown> | null)?.empresa_id },
  });

  return NextResponse.json({ ok: true });
}
