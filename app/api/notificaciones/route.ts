import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("notificaciones")
    .select("id, tipo, titulo, mensaje, link, leida, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ notificaciones: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { ids?: string[]; mark_all?: boolean };

  if (body.mark_all) {
    await supabase.from("notificaciones").update({ leida: true })
      .eq("user_id", user.id).eq("leida", false);
  } else if (body.ids && body.ids.length > 0) {
    await supabase.from("notificaciones").update({ leida: true })
      .eq("user_id", user.id).in("id", body.ids);
  }

  return NextResponse.json({ ok: true });
}
