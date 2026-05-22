import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { buildIcs } from "@/lib/calendar/ics";

interface CitaForIcs {
  id:              string;
  paciente_id:     string;
  fecha_hora_cita: string;
  fecha_hora_fin:  string | null;
  motivo_cita:     string | null;
  doctor:          { nombre: string } | null;
  servicio:        { nombre: string } | null;
  ubicacion:       { nombre: string; direccion: string | null } | null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: cita } = await supabase
    .from("citas")
    .select(`
      id, paciente_id, fecha_hora_cita, fecha_hora_fin, motivo_cita,
      doctor:doctores(nombre),
      servicio:servicios(nombre),
      ubicacion:ubicaciones(nombre, direccion)
    `)
    .eq("id", id)
    .single();

  if (!cita) return new Response("Not found", { status: 404 });
  const c = cita as unknown as CitaForIcs;

  // Auth: el paciente o admin
  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin" && c.paciente_id !== user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  // Si la cita no tiene fecha_hora_fin (cita legacy o pre-migración), asumimos
  // 30 minutos.
  const start = new Date(c.fecha_hora_cita);
  const end   = c.fecha_hora_fin
    ? new Date(c.fecha_hora_fin)
    : new Date(start.getTime() + 30 * 60_000);

  const ics = buildIcs({
    uid:         c.id,
    start,
    end,
    summary:     `${c.servicio?.nombre ?? "Cita médica"} con ${c.doctor?.nombre ?? ""}`.trim(),
    description: c.motivo_cita ?? undefined,
    location:    c.ubicacion
      ? `${c.ubicacion.nombre}${c.ubicacion.direccion ? ` — ${c.ubicacion.direccion}` : ""}`
      : undefined,
    organizer:   { name: "clubSOS", email: process.env.EMAIL_FROM ?? "no-reply@clubsos.com" },
  });

  return new Response(ics, {
    headers: {
      "Content-Type":        "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="cita-${c.id}.ics"`,
    },
  });
}
