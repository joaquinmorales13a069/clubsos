import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users").select("rol, empresa_id").eq("id", user.id).single();
  if (profile?.rol !== "empresa_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: cita_id } = await params;
  let body: { motivo?: string } = {};
  try { body = await req.json(); } catch { /* motivo optional */ }

  const { data: cita } = await supabase
    .from("citas").select("estado_sync, empresa_id").eq("id", cita_id).single();

  if (!cita || (cita as { empresa_id: string }).empresa_id !== profile.empresa_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ((cita as { estado_sync: string }).estado_sync !== "pendiente_empresa") {
    return NextResponse.json({ error: "Cita not in pendiente_empresa state" }, { status: 409 });
  }

  const { error } = await supabase
    .from("citas").update({ estado_sync: "rechazado" }).eq("id", cita_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  void body; // motivo not stored for ea rejections in v1
  return NextResponse.json({ ok: true });
}
