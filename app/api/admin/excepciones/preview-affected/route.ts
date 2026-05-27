/**
 * Admin · Excepciones — preview affected citas.
 *
 * GET /api/admin/excepciones/preview-affected?fecha_inicio&fecha_fin&doctor_id?&ubicacion_id?
 *
 * Returns the citas that would be cancelled if an exception with the given
 * scope+window were created. Capped at 50 rows. Used by the form modal to
 * show a warning panel before submit.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

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

interface RawRow {
  id:              string;
  fecha_hora_cita: string;
  fecha_hora_fin:  string | null;
  paciente:  { nombre_completo: string | null; telefono: string | null } | { nombre_completo: string | null; telefono: string | null }[] | null;
  doctor:    { nombre: string } | { nombre: string }[] | null;
  ubicacion: { nombre: string } | { nombre: string }[] | null;
}

function pickOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const fechaInicio = sp.get("fecha_inicio");
  const fechaFin    = sp.get("fecha_fin");
  const doctorId    = sp.get("doctor_id");
  const ubicacionId = sp.get("ubicacion_id");

  if (!fechaInicio || !fechaFin) {
    return NextResponse.json({ affected: [] });
  }
  if (new Date(fechaFin) <= new Date(fechaInicio)) {
    return NextResponse.json({ affected: [] });
  }

  let q = supabase
    .from("citas")
    .select(`
      id, fecha_hora_cita, fecha_hora_fin,
      paciente:users!paciente_id(nombre_completo, telefono),
      doctor:doctores(nombre),
      ubicacion:ubicaciones(nombre)
    `)
    .not("estado_sync", "in", "(cancelado,rechazado)")
    .lt("fecha_hora_cita", fechaFin)
    .gt("fecha_hora_fin",  fechaInicio)
    .order("fecha_hora_cita", { ascending: true })
    .limit(50);

  if (doctorId)    q = q.eq("doctor_id",    doctorId);
  if (ubicacionId) q = q.eq("ubicacion_id", ubicacionId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const affected = ((data ?? []) as unknown as RawRow[]).map((r) => {
    const pac = pickOne(r.paciente);
    const doc = pickOne(r.doctor);
    const ubi = pickOne(r.ubicacion);
    return {
      id:                r.id,
      fecha_hora_cita:   r.fecha_hora_cita,
      paciente_nombre:   pac?.nombre_completo ?? "—",
      paciente_telefono: pac?.telefono ?? null,
      doctor_nombre:     doc?.nombre ?? "—",
      ubicacion_nombre:  ubi?.nombre ?? "—",
    };
  });

  return NextResponse.json({ affected });
}
