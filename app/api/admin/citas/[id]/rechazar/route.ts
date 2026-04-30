import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { citaId: string; motivo?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const adminStates = ["pendiente_pago", "pendiente_admin"];
  const { data: cita } = await supabase
    .from("citas").select("estado_sync").eq("id", body.citaId).single();

  if (!cita || !adminStates.includes((cita as { estado_sync: string }).estado_sync)) {
    return NextResponse.json({ error: "Cita not in admin-owned state" }, { status: 409 });
  }

  const { error } = await supabase
    .from("citas").update({ estado_sync: "rechazado" }).eq("id", body.citaId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.motivo) {
    await supabase.from("pagos").update({ notas: body.motivo }).eq("cita_id", body.citaId);
  }
  await logAction(supabase, {
    actorId:      user.id,
    actorRol:     profile?.rol ?? "admin",
    accion:       "cita.rechazar",
    entidad:      "citas",
    entidadId:    body.citaId,
    datosDespues: { estado_sync: "rechazado", motivo: body.motivo ?? null },
  });
  return NextResponse.json({ ok: true });
}
