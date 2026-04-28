import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: cita_id } = await params;
  let body: { action: string; link_url?: string; notas?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.action === "paste_link") {
    if (!body.link_url) return NextResponse.json({ error: "link_url required" }, { status: 400 });
    await supabase.from("pagos").update({ link_url: body.link_url }).eq("cita_id", cita_id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "verify") {
    await supabase.from("pagos").update({
      estado: "verificado",
      verificado_por: user.id,
      verificado_at: new Date().toISOString(),
      notas: body.notas ?? null,
    }).eq("cita_id", cita_id);

    const { error } = await supabase.from("citas").update({ estado_sync: "confirmado" }).eq("id", cita_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
