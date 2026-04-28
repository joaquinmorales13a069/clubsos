import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("rol").eq("id", user.id).single();
  return data?.rol === "admin" ? user : null;
}

export async function GET() {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data, error } = await supabase
    .from("contratos")
    .select(`
      id, nombre, fecha_inicio, fecha_fin, tipo_reset, dia_reset, activo, empresa_id,
      empresa:empresas(nombre),
      contrato_servicios(id, cuota_por_titular, servicio:servicios(id, nombre))
    `)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contratos: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: {
    empresa_id: string; nombre: string; fecha_inicio: string;
    fecha_fin?: string; tipo_reset: string; dia_reset: number;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("contratos")
    .insert({ ...body, activo: true })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contrato: data }, { status: 201 });
}
