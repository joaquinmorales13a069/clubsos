import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: cita_id } = await params;

  const { data: cita } = await supabase
    .from("citas")
    .select("id, estado_sync, paciente_id")
    .eq("id", cita_id)
    .single();

  if (!cita || (cita as { paciente_id: string }).paciente_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ((cita as { estado_sync: string }).estado_sync !== "pendiente_pago") {
    return NextResponse.json({ error: "Cita not in pendiente_pago state" }, { status: 409 });
  }

  let body: { referencia: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.referencia?.trim()) {
    return NextResponse.json({ error: "referencia required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("pagos")
    .update({ referencia: body.referencia.trim() })
    .eq("cita_id", cita_id)
    .eq("metodo", "transferencia");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
