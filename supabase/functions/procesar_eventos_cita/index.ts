import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildIcs } from "./lib/ics.ts";
import { sendWhatsappTemplate } from "./lib/whatsapp.ts";
import { sendEmail } from "./lib/email.ts";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const MAX_INTENTOS = 3;

interface EventoRow {
  id:       string;
  cita_id:  string;
  evento:   string;
  payload:  Record<string, unknown> | null;
  intentos: number;
}

interface CitaDetalle {
  id: string;
  fecha_hora_cita: string;
  fecha_hora_fin: string | null;
  paciente_id: string;
  motivo_cita: string | null;
  estado_sync: string;
  motivo_rechazo: string | null;
  motivo_cancelacion: string | null;
  paciente: { nombre_completo: string | null; telefono: string | null; email: string | null } | null;
  doctor: { nombre: string } | null;
  servicio: { nombre: string } | null;
  ubicacion: { nombre: string; direccion: string | null } | null;
}

function formatFechaNI(iso: string): string {
  const local = new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000);
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = local.getUTCFullYear();
  let h = local.getUTCHours();
  const min = String(local.getUTCMinutes()).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${dd}-${mm}-${yyyy} ${h}:${min} ${period}`;
}

async function fetchCita(citaId: string): Promise<CitaDetalle | null> {
  const { data } = await supabase
    .from("citas")
    .select(`
      id, fecha_hora_cita, fecha_hora_fin, paciente_id, motivo_cita, estado_sync,
      motivo_rechazo, motivo_cancelacion,
      paciente:users!paciente_id(nombre_completo, telefono, email),
      doctor:doctores(nombre),
      servicio:servicios(nombre),
      ubicacion:ubicaciones(nombre, direccion)
    `)
    .eq("id", citaId)
    .single();
  return (data ?? null) as unknown as CitaDetalle | null;
}

async function insertInApp(userId: string, tipo: string, titulo: string, mensaje: string, link: string) {
  await supabase.from("notificaciones").insert({
    user_id: userId, tipo, titulo, mensaje, link,
  });
}

async function procesar(evt: EventoRow): Promise<{ ok: boolean; error?: string }> {
  const cita = await fetchCita(evt.cita_id);
  if (!cita || !cita.paciente) {
    return { ok: false, error: "Cita o paciente no encontrado" };
  }

  const fechaTxt        = formatFechaNI(cita.fecha_hora_cita);
  const doctorNombre    = cita.doctor?.nombre   ?? "—";
  const servicioNombre  = cita.servicio?.nombre ?? "—";
  const ubicacionNombre = cita.ubicacion?.nombre ?? "—";

  switch (evt.evento) {
    case "creada":
      // Solo in-app al paciente
      await insertInApp(
        cita.paciente_id,
        "cita_creada",
        "Cita creada",
        `${servicioNombre} con ${doctorNombre} el ${fechaTxt}`,
        "/dashboard/citas",
      );
      return { ok: true };

    case "confirmada": {
      const promises: Promise<unknown>[] = [];

      promises.push(insertInApp(
        cita.paciente_id, "cita_confirmada",
        "Cita confirmada",
        `Tu cita de ${servicioNombre} con ${doctorNombre} el ${fechaTxt} fue confirmada.`,
        "/dashboard/citas",
      ));

      if (cita.paciente.telefono) {
        promises.push(sendWhatsappTemplate({
          to:           cita.paciente.telefono,
          template:     "cita_confirmada",
          languageCode: "es",
          params: [
            cita.paciente.nombre_completo ?? "",
            servicioNombre,
            doctorNombre,
            fechaTxt,
          ],
        }));
      }

      if (cita.paciente.email && cita.fecha_hora_fin) {
        const ics = buildIcs({
          uid:         cita.id,
          start:       new Date(cita.fecha_hora_cita),
          end:         new Date(cita.fecha_hora_fin),
          summary:     `${servicioNombre} con ${doctorNombre}`,
          description: cita.motivo_cita ?? undefined,
          location:    `${ubicacionNombre}${cita.ubicacion?.direccion ? ` — ${cita.ubicacion.direccion}` : ""}`,
          organizer:   { name: "clubSOS", email: Deno.env.get("EMAIL_FROM") ?? "no-reply@clubsos.com" },
        });
        promises.push(sendEmail({
          to:      cita.paciente.email,
          subject: "Tu cita ha sido confirmada",
          html: `
            <h2>Cita confirmada</h2>
            <p>Hola ${cita.paciente.nombre_completo ?? ""},</p>
            <p>Tu cita ha sido <strong>confirmada</strong>:</p>
            <ul>
              <li><strong>Servicio:</strong> ${servicioNombre}</li>
              <li><strong>Doctor:</strong> ${doctorNombre}</li>
              <li><strong>Fecha:</strong> ${fechaTxt}</li>
              <li><strong>Ubicación:</strong> ${ubicacionNombre}</li>
            </ul>
            <p>Adjuntamos un archivo .ics para que puedas agregarlo a tu calendario.</p>
            <p>— El equipo de clubSOS</p>
          `,
          icsContent: ics,
        }));
      }

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      if (fulfilled.length === 0 && results.length > 0) {
        return { ok: false, error: "Todos los canales fallaron" };
      }
      return { ok: true };
    }

    case "rechazada":
      await insertInApp(
        cita.paciente_id, "cita_rechazada",
        "Cita rechazada",
        `Tu cita de ${servicioNombre} el ${fechaTxt} fue rechazada${cita.motivo_rechazo ? `: ${cita.motivo_rechazo}` : ""}.`,
        "/dashboard/citas",
      );
      if (cita.paciente.telefono) {
        await sendWhatsappTemplate({
          to: cita.paciente.telefono, template: "cita_rechazada", languageCode: "es",
          params: [
            cita.paciente.nombre_completo ?? "",
            servicioNombre,
            fechaTxt,
            cita.motivo_rechazo ?? "—",
          ],
        });
      }
      return { ok: true };

    case "cancelada":
      await insertInApp(
        cita.paciente_id, "cita_cancelada",
        "Cita cancelada",
        `Tu cita de ${servicioNombre} el ${fechaTxt} fue cancelada.`,
        "/dashboard/citas",
      );
      if (cita.paciente.telefono) {
        await sendWhatsappTemplate({
          to: cita.paciente.telefono, template: "cita_cancelada", languageCode: "es",
          params: [
            cita.paciente.nombre_completo ?? "",
            servicioNombre,
            fechaTxt,
          ],
        });
      }
      return { ok: true };

    case "recordatorio_24h":
      await insertInApp(
        cita.paciente_id, "cita_recordatorio",
        "Recordatorio: cita mañana",
        `Tienes una cita de ${servicioNombre} con ${doctorNombre} mañana (${fechaTxt}).`,
        "/dashboard/citas",
      );
      if (cita.paciente.telefono) {
        await sendWhatsappTemplate({
          to: cita.paciente.telefono, template: "cita_recordatorio_24h", languageCode: "es",
          params: [
            cita.paciente.nombre_completo ?? "",
            servicioNombre,
            doctorNombre,
            fechaTxt,
          ],
        });
      }
      if (cita.paciente.email) {
        await sendEmail({
          to: cita.paciente.email,
          subject: "Recordatorio: tu cita es mañana",
          html: `<p>Hola ${cita.paciente.nombre_completo ?? ""}, te recordamos tu cita mañana ${fechaTxt} (${servicioNombre} con ${doctorNombre}).</p>`,
        });
      }
      return { ok: true };

    default:
      return { ok: false, error: `Evento desconocido: ${evt.evento}` };
  }
}

serve(async () => {
  // Tomar hasta 50 eventos pendientes
  const { data: eventos } = await supabase
    .from("cita_eventos")
    .select("id, cita_id, evento, payload, intentos")
    .eq("procesado", false)
    .lt("intentos", MAX_INTENTOS)
    .order("created_at")
    .limit(50);

  const procesados: { id: string; ok: boolean; error?: string }[] = [];

  for (const evt of (eventos ?? []) as EventoRow[]) {
    const r = await procesar(evt);
    procesados.push({ id: evt.id, ok: r.ok, error: r.error });

    if (r.ok) {
      await supabase.from("cita_eventos")
        .update({ procesado: true, procesado_at: new Date().toISOString() })
        .eq("id", evt.id);
    } else {
      await supabase.from("cita_eventos")
        .update({ intentos: evt.intentos + 1, ultimo_error: r.error ?? "unknown" })
        .eq("id", evt.id);
    }
  }

  return new Response(JSON.stringify({ procesados }), {
    headers: { "Content-Type": "application/json" },
  });
});
