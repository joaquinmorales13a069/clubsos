import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("rol").eq("id", user.id).single();
  return data?.rol === "admin" ? { user, rol: data.rol as string } : null;
}

type EmpresaCreateBody = {
  nombre: string;
  codigo_empresa: string;
  notas?: string | null;
  auto_confirmar_citas?: boolean;
  ruc?: string | null;
  direccion_calle?: string | null;
  departamento?: string | null;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const actor = await assertAdmin(supabase);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: EmpresaCreateBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("empresas")
    .insert({ ...body, estado: "activa" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId: actor.user.id,
    actorRol: actor.rol,
    accion: "empresa.crear",
    entidad: "empresas",
    entidadId: data.id,
    datosDespues: data as Record<string, unknown>,
    ipAddress: req.headers.get("x-forwarded-for"),
    metadata: { empresa_id: data.id, empresa_nombre: data.nombre },
  });

  return NextResponse.json({ empresa: data }, { status: 201 });
}
