/**
 * Admin · Excepciones (unified) — list + create across all scopes.
 *
 * Scopes by null-ness of doctor_id and ubicacion_id:
 *   - both null      → global (every doctor at every clinic)
 *   - doctor only    → that doctor at any clinic
 *   - ubicacion only → every doctor at that clinic
 *   - both set       → that doctor at that specific clinic
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

type Scope = "all" | "global" | "doctor" | "ubicacion" | "both";

function readScope(v: string | null): Scope {
  if (v === "global" || v === "doctor" || v === "ubicacion" || v === "both") return v;
  return "all";
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const scope        = readScope(sp.get("scope"));
  const doctorId     = sp.get("doctor_id");
  const ubicacionId  = sp.get("ubicacion_id");
  const fechaDesde   = sp.get("fecha_desde");
  const fechaHasta   = sp.get("fecha_hasta");

  let q = supabase
    .from("excepciones_horario")
    .select(`
      id, doctor_id, ubicacion_id, fecha_inicio, fecha_fin, motivo, created_at,
      doctor:doctores(id, nombre),
      ubicacion:ubicaciones(id, nombre)
    `)
    .order("fecha_inicio", { ascending: false });

  if (scope === "global")    q = q.is("doctor_id", null).is("ubicacion_id", null);
  if (scope === "doctor")    q = q.not("doctor_id", "is", null).is("ubicacion_id", null);
  if (scope === "ubicacion") q = q.is("doctor_id", null).not("ubicacion_id", "is", null);
  if (scope === "both")      q = q.not("doctor_id", "is", null).not("ubicacion_id", "is", null);

  if (doctorId)    q = q.eq("doctor_id", doctorId);
  if (ubicacionId) q = q.eq("ubicacion_id", ubicacionId);

  if (fechaDesde) q = q.gte("fecha_fin",    fechaDesde);
  if (fechaHasta) q = q.lte("fecha_inicio", fechaHasta);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ excepciones: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth     = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as {
    fecha_inicio?: string;
    fecha_fin?:    string;
    motivo?:       string;
    doctor_id?:    string | null;
    ubicacion_id?: string | null;
  };

  if (!body.fecha_inicio || !body.fecha_fin) {
    return NextResponse.json(
      { error: "fecha_inicio and fecha_fin are required (ISO)" },
      { status: 400 },
    );
  }
  if (new Date(body.fecha_fin) <= new Date(body.fecha_inicio)) {
    return NextResponse.json(
      { error: "fecha_fin must be after fecha_inicio" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("excepciones_horario")
    .insert({
      doctor_id:    body.doctor_id    ?? null,
      ubicacion_id: body.ubicacion_id ?? null,
      fecha_inicio: body.fecha_inicio,
      fecha_fin:    body.fecha_fin,
      motivo:       body.motivo ?? null,
    })
    .select("id, doctor_id, ubicacion_id, fecha_inicio, fecha_fin, motivo")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId:      auth.user.id,
    actorRol:     "admin",
    accion:       "excepcion.crear",
    entidad:      "excepciones_horario",
    entidadId:    data.id,
    datosDespues: data,
  });

  return NextResponse.json({ ok: true, excepcion: data }, { status: 201 });
}
