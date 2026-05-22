/**
 * Admin · Doctor → Excepcion item — hard delete.
 *
 * Phase 4 · Step 5 of the native citas module.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

type Supa = Awaited<ReturnType<typeof createClient>>;

async function assertAdmin(supabase: Supa) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (profile?.rol !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; excepcionId: string }> },
) {
  const { id, excepcionId } = await ctx.params;
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const { error } = await supabase
    .from("excepciones_horario")
    .delete()
    .eq("id", excepcionId)
    .eq("doctor_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "excepcion.eliminar",
    entidad:      "excepciones_horario",
    entidadId:    excepcionId,
    datosDespues: { doctor_id: id },
  });

  return NextResponse.json({ ok: true });
}
