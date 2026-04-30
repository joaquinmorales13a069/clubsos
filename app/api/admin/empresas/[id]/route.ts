import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("rol").eq("id", user.id).single();
  return data?.rol === "admin" ? { user, rol: data.rol as string } : null;
}

const ALLOWED_FIELDS = [
  "nombre", "codigo_empresa", "notas", "auto_confirmar_citas",
  "estado", "ruc", "direccion_calle", "departamento",
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const actor = await assertAdmin(supabase);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED_FIELDS.includes(k)));

  const { data: before } = await supabase
    .from("empresas")
    .select("nombre, codigo_empresa, notas, auto_confirmar_citas, estado, ruc, direccion_calle, departamento")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("empresas")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const accion = "estado" in patch
    ? (patch.estado === "activa" ? "empresa.activar" : "empresa.desactivar")
    : "empresa.actualizar";

  await logAction(supabase, {
    actorId: actor.user.id,
    actorRol: actor.rol,
    accion,
    entidad: "empresas",
    entidadId: id,
    datosAntes: before as Record<string, unknown>,
    datosDespues: patch,
    ipAddress: req.headers.get("x-forwarded-for"),
    metadata: { empresa_id: id, empresa_nombre: (before as Record<string, unknown> | null)?.nombre },
  });

  return NextResponse.json({ empresa: data });
}
