import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";
import { parseCitaError } from "@/lib/citas/errors";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.rpc("confirmar_cita", { p_cita_id: id });

  if (error) {
    const parsed = parseCitaError(error.message);
    return NextResponse.json(
      { error: parsed.code, i18nKey: parsed.i18nKey },
      { status: parsed.status },
    );
  }

  await logAction(supabase, {
    actorId:      user.id,
    actorRol:     "admin",
    accion:       "cita.confirmar",
    entidad:      "citas",
    entidadId:    id,
    datosDespues: { estado_sync: "confirmado" },
  });

  return NextResponse.json({ ok: true });
}
