/**
 * Admin · GET single cita with relations.
 *
 * Phase 4 · Step 8 of the native citas module.
 * Used by the admin calendario modal to fetch the full detail of a cita.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("citas")
    .select(`
      id, fecha_hora_cita, fecha_hora_fin, estado_sync, motivo_cita,
      para_titular, paciente_nombre, paciente_telefono, paciente_cedula,
      paciente:users!paciente_id(nombre_completo, telefono, email),
      doctor:doctores(id, nombre),
      servicio:servicios(id, nombre),
      ubicacion:ubicaciones(id, nombre, direccion)
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ cita: data });
}
