/**
 * Admin · Doctor → Servicios — replace the full set in a single call.
 *
 * Phase 4 · Step 5 of the native citas module.
 * Body: { servicio_ids: string[] }. The handler deletes the doctor's
 * current pivot rows and inserts the new set.
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

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { servicio_ids?: string[] };
  const ids  = Array.isArray(body.servicio_ids) ? body.servicio_ids : [];

  // Replace the full set: delete all current rows, then insert the new ones.
  const delRes = await supabase
    .from("doctor_servicios")
    .delete()
    .eq("doctor_id", id);
  if (delRes.error) {
    return NextResponse.json({ error: delRes.error.message }, { status: 500 });
  }

  if (ids.length > 0) {
    const insRes = await supabase
      .from("doctor_servicios")
      .insert(ids.map((sid) => ({ doctor_id: id, servicio_id: sid })));
    if (insRes.error) {
      return NextResponse.json({ error: insRes.error.message }, { status: 500 });
    }
  }

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "doctor.servicios.actualizar",
    entidad:      "doctores",
    entidadId:    id,
    datosDespues: { servicio_ids: ids },
  });

  return NextResponse.json({ ok: true });
}
