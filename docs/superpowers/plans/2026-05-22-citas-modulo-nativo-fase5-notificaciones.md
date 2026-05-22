# Fase 5 — Notificaciones + .ics + recordatorios (Módulo nativo de citas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el módulo nativo de citas con notificaciones desacopladas vía cola de eventos, generación de archivos `.ics` con botones de Google/Outlook/Apple Calendar, recordatorio 24h con `pg_cron`, y campana in-app. Eliminar el resto de archivos EA del repo y limpiar variables de entorno.

**Architecture:** Trigger `tr_cita_estado_change` (AFTER INSERT/UPDATE de `citas`) escribe en una cola `cita_eventos`. Una edge function `procesar_eventos_cita` consume la cola y dispara notificaciones (WhatsApp, email con `.ics`, in-app) con reintentos. `pg_cron` corre cada 30s para procesar la cola y cada 15min para insertar recordatorios 24h. Helper `.ics` genera contenido conforme a RFC 5545. Campana in-app suscrita a Realtime sobre `notificaciones`.

**Tech Stack:** Postgres (`pg_cron`, `pg_net`), Deno (edge functions), `resend` (ya instalado), Supabase Realtime, shadcn (Dropdown / Popover), `lucide-react`, `next-intl`.

**Depende de:** Fases 1 + 2 completas. Fase 4 recomendable (para que el calendario admin refleje los cambios de estado disparados por las notificaciones).

---

## File Structure

### Migraciones nuevas (`supabase/migrations/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `20260523000100_cita_eventos_table.sql` | Tabla `cita_eventos` + RLS |
| `20260523000200_cita_eventos_trigger.sql` | Trigger `tr_cita_estado_change` + función de pg_net opcional |
| `20260523000300_notificaciones_table.sql` | Tabla `notificaciones` + RLS + Realtime publication |
| `20260523000400_pg_cron_jobs.sql` | Cron de procesamiento de eventos + recordatorio 24h |

### Edge functions

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/procesar_eventos_cita/index.ts` | **Crear** — consume `cita_eventos`, dispara notifs |
| `supabase/functions/procesar_eventos_cita/lib/whatsapp.ts` | **Crear** — helpers WhatsApp extraídos de funciones existentes |
| `supabase/functions/procesar_eventos_cita/lib/email.ts` | **Crear** — helpers Resend extraídos |
| `supabase/functions/procesar_eventos_cita/lib/ics.ts` | **Crear** — generador .ics RFC 5545 |
| `supabase/functions/notificar_estado_cita/` | **Borrar** — su rol lo asume `procesar_eventos_cita` |
| `supabase/functions/notificar_cita_whatsapp/` | **Borrar** — código migra a `lib/whatsapp.ts` |
| `supabase/functions/sync_ea_customer/` | **Borrar** — EA fuera |

### Archivos nuevos en la app (`lib/`, `app/`, `components/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `lib/calendar/ics.ts` | Helper server-side para generar `.ics` (mismo formato que el edge function pero para usar en route handlers) |
| `lib/calendar/links.ts` | Helpers para construir URLs Google/Outlook/Apple Calendar |
| `app/api/citas/[id]/ics/route.ts` | GET descarga el .ics de una cita (auth: dueño o admin) |
| `components/dashboard/miembro/citas/AgregarACalendario.tsx` | Dropdown con 4 opciones (Google/Outlook/Apple/.ics) |
| `components/dashboard/NotificacionesCampana.tsx` | Badge + dropdown en Topbar |
| `app/api/notificaciones/route.ts` | GET listar / PUT marcar como leídas |

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `components/dashboard/miembro/citas/CitaCard.tsx` | Mostrar `<AgregarACalendario />` cuando estado = `confirmado` |
| `components/dashboard/Topbar.tsx` | Insertar `<NotificacionesCampana />` |
| `CLAUDE.md` | Quitar refs a `NEXT_PUBLIC_EA_API_URL` y `EA_API_KEY` |
| `.env.local` (manual, no se commitea) | Quitar las dos variables EA |

---

## Task 1: Migración — tabla `cita_eventos`

**Files:**
- Create: `supabase/migrations/20260523000100_cita_eventos_table.sql`

- [ ] **Step 1: Crear el archivo**

```sql
-- Migración: cola de eventos para notificaciones desacopladas.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cita_eventos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cita_id       UUID NOT NULL REFERENCES public.citas(id) ON DELETE CASCADE,
  evento        TEXT NOT NULL,             -- 'creada' | 'confirmada' | 'rechazada' | 'cancelada' | 'recordatorio_24h'
  payload       JSONB,                     -- snapshot mínimo (estado nuevo, motivo, etc.)
  procesado     BOOLEAN NOT NULL DEFAULT FALSE,
  procesado_at  TIMESTAMPTZ,
  intentos      INT NOT NULL DEFAULT 0,
  ultimo_error  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice de barrido para el cron / edge function
CREATE INDEX idx_cita_eventos_pendientes
  ON public.cita_eventos (created_at)
  WHERE procesado = FALSE;

-- Índice para idempotencia de recordatorios (NOT EXISTS query)
CREATE INDEX idx_cita_eventos_cita_evento
  ON public.cita_eventos (cita_id, evento);

ALTER TABLE public.cita_eventos ENABLE ROW LEVEL SECURITY;

-- Solo service_role (la edge function) puede leer/escribir.
-- Sin política para authenticated → RLS deniega por default.

COMMIT;
```

- [ ] **Step 2: Aplicar y commitear**

```bash
supabase db push
git add supabase/migrations/20260523000100_cita_eventos_table.sql
git commit -m "feat(citas): add cita_eventos queue table"
```

---

## Task 2: Migración — trigger `tr_cita_estado_change`

**Files:**
- Create: `supabase/migrations/20260523000200_cita_eventos_trigger.sql`

- [ ] **Step 1: Crear el archivo**

```sql
-- Migración: trigger que escribe en cita_eventos cuando se crea o cambia
-- el estado de una cita. Opcionalmente dispara pg_net para invocar la edge
-- function en caliente (latencia baja); el cron sigue siendo el mecanismo
-- principal por idempotencia.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- Función llamada por pg_net al final del trigger (opcional pero recomendado).
-- Si la URL secret no está configurada, simplemente no dispara.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_procesar_eventos_async()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  -- Leer URL y service-role key desde vault (o desde tabla de config si no usan vault)
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'edge_function_procesar_eventos_url';

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger principal
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_cita_estado_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_evento TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.cita_eventos (cita_id, evento, payload)
    VALUES (NEW.id, 'creada', jsonb_build_object('estado', NEW.estado_sync));
    -- Dispara async (best-effort)
    PERFORM public.fn_procesar_eventos_async();
    RETURN NEW;
  END IF;

  -- UPDATE: solo si cambió estado_sync
  IF NEW.estado_sync IS DISTINCT FROM OLD.estado_sync THEN
    v_evento := CASE NEW.estado_sync
      WHEN 'confirmado' THEN 'confirmada'
      WHEN 'rechazado'  THEN 'rechazada'
      WHEN 'cancelado'  THEN 'cancelada'
      ELSE NULL
    END;

    IF v_evento IS NOT NULL THEN
      INSERT INTO public.cita_eventos (cita_id, evento, payload)
      VALUES (
        NEW.id,
        v_evento,
        jsonb_build_object(
          'estado_anterior', OLD.estado_sync,
          'estado_nuevo',    NEW.estado_sync,
          'motivo',          CASE v_evento
            WHEN 'rechazada' THEN NEW.motivo_rechazo
            WHEN 'cancelada' THEN NEW.motivo_cancelacion
            ELSE NULL
          END
        )
      );
      PERFORM public.fn_procesar_eventos_async();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_cita_estado_change
  AFTER INSERT OR UPDATE OF estado_sync ON public.citas
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_cita_estado_change();

COMMIT;
```

- [ ] **Step 2: Configurar secrets en Vault (opcional para el async fire)**

Vía MCP o Supabase Studio → Project Settings → Vault:

- `edge_function_procesar_eventos_url` = `https://<project>.supabase.co/functions/v1/procesar_eventos_cita`
- `service_role_key` = `<SUPABASE_SERVICE_ROLE_KEY>` (del proyecto)

Si no configurás los secrets, el trigger simplemente no dispara el HTTP — el cron del Task 4 igual procesará los eventos cada 30s.

- [ ] **Step 3: Aplicar y commitear**

```bash
supabase db push
git add supabase/migrations/20260523000200_cita_eventos_trigger.sql
git commit -m "feat(citas): add tr_cita_estado_change trigger writing to cita_eventos queue"
```

---

## Task 3: Migración — tabla `notificaciones`

**Files:**
- Create: `supabase/migrations/20260523000300_notificaciones_table.sql`

- [ ] **Step 1: Crear el archivo**

```sql
-- Migración: tabla notificaciones para la campana in-app del Topbar.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notificaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,         -- 'cita_confirmada', 'cita_rechazada', 'cita_cancelada', 'cita_recordatorio'
  titulo      TEXT NOT NULL,
  mensaje     TEXT NOT NULL,
  link        TEXT,                  -- relative path, ej. '/dashboard/citas'
  leida       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user_unread
  ON public.notificaciones (user_id, leida, created_at DESC);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_own_read"
  ON public.notificaciones FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notif_own_update"
  ON public.notificaciones FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Realtime para la campana
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;

COMMIT;
```

- [ ] **Step 2: Aplicar y commitear**

```bash
supabase db push
git add supabase/migrations/20260523000300_notificaciones_table.sql
git commit -m "feat(citas): add notificaciones table for in-app bell"
```

---

## Task 4: Migración — `pg_cron` jobs

**Files:**
- Create: `supabase/migrations/20260523000400_pg_cron_jobs.sql`

- [ ] **Step 1: Crear el archivo**

```sql
-- Migración: cron jobs para procesar la cola de eventos y disparar
-- recordatorios 24h.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- Job 1: procesar la cola cada 30 segundos (defensa por si el trigger
-- async via pg_net falla o el secret no está configurado).
-- ─────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'procesar_eventos_cita_30s',
  '*/30 * * * * *',  -- formato: sec min hour dom mon dow (Postgres pg_cron extendido)
  $$ SELECT public.fn_procesar_eventos_async(); $$
);

-- Nota: si tu instalación de pg_cron NO soporta segundos (solo crontab estándar
-- con minutos), reemplazar arriba por:
--   '* * * * *'  -- cada minuto
-- y el ritmo será 60s en vez de 30s. Aceptable para empezar.

-- ─────────────────────────────────────────────────────────────────────────
-- Job 2: recordatorio 24h, corre cada 15 minutos.
-- Inserta evento 'recordatorio_24h' por cada cita confirmada cuyo
-- fecha_hora_cita caiga dentro de la ventana (24h ± 15min), si todavía
-- no se insertó un recordatorio para esa cita.
-- ─────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'recordatorios_citas_24h',
  '*/15 * * * *',
  $$
    INSERT INTO public.cita_eventos (cita_id, evento)
    SELECT c.id, 'recordatorio_24h'
    FROM public.citas c
    WHERE c.estado_sync = 'confirmado'
      AND c.fecha_hora_cita BETWEEN NOW() + INTERVAL '23 hours 45 minutes'
                                AND NOW() + INTERVAL '24 hours 15 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM public.cita_eventos e
        WHERE e.cita_id = c.id AND e.evento = 'recordatorio_24h'
      );
  $$
);

COMMIT;
```

- [ ] **Step 2: Aplicar**

```bash
supabase db push
```

Si la sintaxis de segundos falla, ajustar el cron del Job 1 a `'* * * * *'` (cada minuto) y volver a aplicar.

- [ ] **Step 3: Verificar jobs creados**

Vía MCP:
```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE '%cita%';
```

Esperar las 2 filas, activas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260523000400_pg_cron_jobs.sql
git commit -m "feat(citas): add pg_cron jobs for event processing and 24h reminders"
```

---

## Task 5: Edge function `procesar_eventos_cita` — esqueleto

**Files:**
- Create: `supabase/functions/procesar_eventos_cita/index.ts`
- Create: `supabase/functions/procesar_eventos_cita/lib/whatsapp.ts`
- Create: `supabase/functions/procesar_eventos_cita/lib/email.ts`
- Create: `supabase/functions/procesar_eventos_cita/lib/ics.ts`

- [ ] **Step 1: Crear `lib/ics.ts`**

```ts
// Generador .ics conforme a RFC 5545.

export interface IcsEvent {
  uid:         string;
  start:       Date;
  end:         Date;
  summary:     string;
  description?: string;
  location?:   string;
  organizer?:  { name: string; email: string };
}

function fmt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildIcs(ev: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//clubSOS//Citas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}@clubsos.com`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(ev.start)}`,
    `DTEND:${fmt(ev.end)}`,
    `SUMMARY:${escapeIcs(ev.summary)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${escapeIcs(ev.description)}`);
  if (ev.location)    lines.push(`LOCATION:${escapeIcs(ev.location)}`);
  if (ev.organizer)   lines.push(`ORGANIZER;CN=${escapeIcs(ev.organizer.name)}:mailto:${ev.organizer.email}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
```

- [ ] **Step 2: Crear `lib/whatsapp.ts`**

(Migrar lo esencial de `supabase/functions/notificar_cita_whatsapp/index.ts`. Función pública `sendWhatsappTemplate(opts)`.)

```ts
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const API_TOKEN       = Deno.env.get("WHATSAPP_API_TOKEN")       ?? "";

function toE164(phone: string): string {
  const digits = phone.replace(/\s/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export async function sendWhatsappTemplate(opts: {
  to:         string;
  template:   string;
  languageCode: string;
  params:     string[];
}): Promise<{ ok: boolean; error?: string }> {
  if (!PHONE_NUMBER_ID || !API_TOKEN) {
    return { ok: false, error: "WhatsApp env vars missing" };
  }

  const res = await fetch(
    `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_TOKEN}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164(opts.to),
        type: "template",
        template: {
          name: opts.template,
          language: { code: opts.languageCode },
          components: [{
            type: "body",
            parameters: opts.params.map((p) => ({ type: "text", text: p })),
          }],
        },
      }),
    },
  );

  if (!res.ok) {
    return { ok: false, error: `${res.status}: ${await res.text().catch(() => "")}` };
  }
  return { ok: true };
}
```

- [ ] **Step 3: Crear `lib/email.ts`**

```ts
import { Resend } from "https://esm.sh/resend@4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM     = Deno.env.get("EMAIL_FROM")     ?? "no-reply@clubsos.com";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export async function sendEmail(opts: {
  to:          string;
  subject:     string;
  html:        string;
  icsContent?: string;  // Si presente, se adjunta como cita.ics
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: "RESEND_API_KEY missing" };

  const attachments = opts.icsContent
    ? [{ filename: "cita.ics", content: opts.icsContent, contentType: "text/calendar; charset=utf-8" }]
    : undefined;

  try {
    const result = await resend.emails.send({
      from:        EMAIL_FROM,
      to:          opts.to,
      subject:     opts.subject,
      html:        opts.html,
      attachments,
    });
    if (result.error) return { ok: false, error: String(result.error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
```

- [ ] **Step 4: Crear `index.ts` (la función principal)**

```ts
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
  id: string; fecha_hora_cita: string; fecha_hora_fin: string;
  paciente_id: string; motivo_cita: string | null; estado_sync: string;
  motivo_rechazo: string | null; motivo_cancelacion: string | null;
  paciente: { nombre_completo: string | null; telefono: string | null; correo: string | null } | null;
  doctor:   { nombre: string } | null;
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
      paciente:users!paciente_id(nombre_completo, telefono, correo),
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

  const fechaTxt = formatFechaNI(cita.fecha_hora_cita);
  const doctorNombre   = cita.doctor?.nombre   ?? "—";
  const servicioNombre = cita.servicio?.nombre ?? "—";
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

      // In-app
      promises.push(insertInApp(
        cita.paciente_id, "cita_confirmada",
        "Cita confirmada",
        `Tu cita de ${servicioNombre} con ${doctorNombre} el ${fechaTxt} fue confirmada.`,
        "/dashboard/citas",
      ));

      // WhatsApp
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

      // Email con .ics
      if (cita.paciente.correo) {
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
          to:      cita.paciente.correo,
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
      const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && (r.value as { ok?: boolean })?.ok === false));
      if (failures.length === results.length && results.length > 0) {
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
          params: [cita.paciente.nombre_completo ?? "", servicioNombre, fechaTxt, cita.motivo_rechazo ?? ""],
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
          params: [cita.paciente.nombre_completo ?? "", servicioNombre, fechaTxt],
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
          params: [cita.paciente.nombre_completo ?? "", servicioNombre, doctorNombre, fechaTxt],
        });
      }
      if (cita.paciente.correo) {
        await sendEmail({
          to: cita.paciente.correo,
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
```

- [ ] **Step 5: Deploy de la función**

```bash
supabase functions deploy procesar_eventos_cita
```

Verificar secrets (Supabase Dashboard → Edge Functions → procesar_eventos_cita → Secrets):
- `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`.

(Las que están en `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` se autoinyectan.)

- [ ] **Step 6: Smoke test**

Crear una cita desde el wizard de miembro. Verificar:
1. Aparece una fila nueva en `cita_eventos` (`evento = 'creada'`).
2. Pasados unos segundos (cron 30s o trigger pg_net), `procesado = TRUE`.
3. Aparece una fila en `notificaciones` para el paciente.

Confirmar la cita desde el admin. Verificar:
1. Fila `evento = 'confirmada'` en `cita_eventos`.
2. Se procesa, llega WhatsApp + email con `.ics` adjunto al paciente.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/procesar_eventos_cita/
git commit -m "feat(citas): add procesar_eventos_cita edge function with WhatsApp/Email/.ics/in-app"
```

---

## Task 6: Borrar edge functions obsoletas

**Files:**
- Delete: `supabase/functions/notificar_estado_cita/`
- Delete: `supabase/functions/notificar_cita_whatsapp/`
- Delete: `supabase/functions/sync_ea_customer/`

- [ ] **Step 1: Verificar que no quedan webhooks de DB apuntando a ellas**

Supabase Dashboard → Database → Webhooks → confirmar que `notificar_estado_cita` (o cualquier webhook EA) ya no está activo. Eliminarlos si quedan.

- [ ] **Step 2: Borrar las carpetas**

```bash
git rm -rf supabase/functions/notificar_estado_cita
git rm -rf supabase/functions/notificar_cita_whatsapp
git rm -rf supabase/functions/sync_ea_customer
```

- [ ] **Step 3: Eliminar las funciones del proyecto remoto**

```bash
supabase functions delete notificar_estado_cita
supabase functions delete notificar_cita_whatsapp
supabase functions delete sync_ea_customer
```

(Si alguna no existe en remoto, el comando devuelve error pero es seguro ignorarlo.)

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(citas): remove obsolete edge functions (replaced by procesar_eventos_cita)"
```

---

## Task 7: Helper server-side de `.ics` para la app

**Files:**
- Create: `lib/calendar/ics.ts`

Este es la misma lógica que en `supabase/functions/procesar_eventos_cita/lib/ics.ts`, pero adaptada para Node/Next.js (sin `Deno.env`). Se usa desde el route handler `/api/citas/[id]/ics`.

- [ ] **Step 1: Crear el archivo**

```ts
// Generador .ics conforme a RFC 5545 (versión Node para route handlers).

export interface IcsEvent {
  uid:         string;
  start:       Date;
  end:         Date;
  summary:     string;
  description?: string;
  location?:   string;
  organizer?:  { name: string; email: string };
}

function fmt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildIcs(ev: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//clubSOS//Citas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}@clubsos.com`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(ev.start)}`,
    `DTEND:${fmt(ev.end)}`,
    `SUMMARY:${escapeIcs(ev.summary)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${escapeIcs(ev.description)}`);
  if (ev.location)    lines.push(`LOCATION:${escapeIcs(ev.location)}`);
  if (ev.organizer)   lines.push(`ORGANIZER;CN=${escapeIcs(ev.organizer.name)}:mailto:${ev.organizer.email}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/calendar/ics.ts
git commit -m "feat(citas): add server-side .ics generator helper"
```

---

## Task 8: Helper `lib/calendar/links.ts` + endpoint `/api/citas/[id]/ics`

**Files:**
- Create: `lib/calendar/links.ts`
- Create: `app/api/citas/[id]/ics/route.ts`

- [ ] **Step 1: Crear `lib/calendar/links.ts`**

```ts
// Helpers para construir URLs de calendarios externos.

export interface CalendarEventInput {
  title:       string;
  start:       Date;
  end:         Date;
  description?: string;
  location?:   string;
}

function fmtDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(ev: CalendarEventInput): string {
  const params = new URLSearchParams({
    action:  "TEMPLATE",
    text:    ev.title,
    dates:   `${fmtDate(ev.start)}/${fmtDate(ev.end)}`,
    details: ev.description ?? "",
    location: ev.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(ev: CalendarEventInput): string {
  const params = new URLSearchParams({
    rru:       "addevent",
    subject:   ev.title,
    startdt:   ev.start.toISOString(),
    enddt:     ev.end.toISOString(),
    body:      ev.description ?? "",
    location:  ev.location ?? "",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
```

- [ ] **Step 2: Crear `app/api/citas/[id]/ics/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { buildIcs } from "@/lib/calendar/ics";

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

  // Auth: el paciente o admin
  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin" && cita.paciente_id !== user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const c = cita as unknown as {
    id: string; fecha_hora_cita: string; fecha_hora_fin: string; motivo_cita: string | null;
    doctor: { nombre: string } | null;
    servicio: { nombre: string } | null;
    ubicacion: { nombre: string; direccion: string | null } | null;
  };

  const ics = buildIcs({
    uid:         c.id,
    start:       new Date(c.fecha_hora_cita),
    end:         new Date(c.fecha_hora_fin),
    summary:     `${c.servicio?.nombre ?? "Cita médica"} con ${c.doctor?.nombre ?? ""}`.trim(),
    description: c.motivo_cita ?? undefined,
    location:    c.ubicacion ? `${c.ubicacion.nombre}${c.ubicacion.direccion ? ` — ${c.ubicacion.direccion}` : ""}` : undefined,
    organizer:   { name: "clubSOS", email: process.env.EMAIL_FROM ?? "no-reply@clubsos.com" },
  });

  return new Response(ics, {
    headers: {
      "Content-Type":        "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="cita-${c.id}.ics"`,
    },
  });
}
```

- [ ] **Step 3: Build + commit**

```bash
pnpm build
git add lib/calendar/links.ts app/api/citas/'[id]'/ics/route.ts
git commit -m "feat(citas): add calendar links helpers and /api/citas/[id]/ics download endpoint"
```

---

## Task 9: Componente `<AgregarACalendario />`

**Files:**
- Create: `components/dashboard/miembro/citas/AgregarACalendario.tsx`
- Modify: `components/dashboard/miembro/citas/CitaCard.tsx`

- [ ] **Step 1: Crear `AgregarACalendario.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar, Download } from "lucide-react";
import { googleCalendarUrl, outlookCalendarUrl, type CalendarEventInput } from "@/lib/calendar/links";

interface Props {
  citaId:      string;
  title:       string;
  start:       Date;
  end:         Date;
  description?: string;
  location?:   string;
}

export default function AgregarACalendario(props: Props) {
  const t = useTranslations("Dashboard.miembro.citas.agregar_calendario");
  const [open, setOpen] = useState(false);

  const ev: CalendarEventInput = {
    title:       props.title,
    start:       props.start,
    end:         props.end,
    description: props.description,
    location:    props.location,
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-roboto font-medium text-gray-700 hover:border-secondary/40 transition-colors"
      >
        <Calendar className="w-3.5 h-3.5" />
        {t("button")}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="cerrar"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute z-20 right-0 mt-1 w-52 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
            <a
              href={googleCalendarUrl(ev)}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2 text-sm hover:bg-gray-50"
            >
              {t("google")}
            </a>
            <a
              href={outlookCalendarUrl(ev)}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2 text-sm hover:bg-gray-50"
            >
              {t("outlook")}
            </a>
            <a
              href={`/api/citas/${props.citaId}/ics`}
              className="block px-4 py-2 text-sm hover:bg-gray-50"
            >
              {t("apple")}
            </a>
            <a
              href={`/api/citas/${props.citaId}/ics`}
              download
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 border-t border-gray-100"
            >
              <Download className="w-3.5 h-3.5" /> {t("ics")}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Insertar en `CitaCard.tsx`**

Localizar dónde se renderiza la cita confirmada y agregar al pie de la card (cuando `estado_sync === "confirmado"`):

```tsx
import AgregarACalendario from "./AgregarACalendario";

// En el render, donde sea apropiado:
{cita.estado_sync === "confirmado" && (
  <AgregarACalendario
    citaId={cita.id}
    title={`${cita.servicio?.nombre ?? "Cita"} con ${cita.doctor?.nombre ?? ""}`}
    start={new Date(cita.fecha_hora_cita)}
    end={new Date(cita.fecha_hora_fin)}
    description={cita.motivo_cita ?? undefined}
    location={cita.ubicacion ? `${cita.ubicacion.nombre}${cita.ubicacion.direccion ? `, ${cita.ubicacion.direccion}` : ""}` : undefined}
  />
)}
```

(Si `CitaCard` no traía `fecha_hora_fin`/`ubicacion`/`motivo_cita` en su query, agregarlos al `.select(...)` en `MisCitas.tsx`.)

- [ ] **Step 3: Claves i18n bajo `Dashboard.miembro.citas.agregar_calendario`**

```json
"agregar_calendario": {
  "button":  "Agregar al calendario",
  "google":  "Google Calendar",
  "outlook": "Outlook",
  "apple":   "Apple Calendar",
  "ics":     "Descargar .ics"
}
```

(Y equivalentes en inglés.)

- [ ] **Step 4: Build + smoke test**

```bash
pnpm build && pnpm dev
# Confirmar una cita como admin → en la vista del miembro la card muestra "Agregar al calendario"
# Click → menú con 4 opciones. Click Google → abre Google Calendar con datos prellenados.
# Click Descargar .ics → descarga el archivo.
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/miembro/citas/AgregarACalendario.tsx \
         components/dashboard/miembro/citas/CitaCard.tsx \
         components/dashboard/miembro/citas/MisCitas.tsx \
         messages/es.json messages/en.json
git commit -m "feat(citas): add AgregarACalendario dropdown with Google/Outlook/Apple/.ics options"
```

---

## Task 10: Campana de notificaciones in-app

**Files:**
- Create: `app/api/notificaciones/route.ts`
- Create: `components/dashboard/NotificacionesCampana.tsx`
- Modify: `components/dashboard/Topbar.tsx`

- [ ] **Step 1: API `/api/notificaciones`**

```ts
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
```

- [ ] **Step 2: `NotificacionesCampana.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Bell } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

interface NotifRow {
  id: string; tipo: string; titulo: string; mensaje: string;
  link: string | null; leida: boolean; created_at: string;
}

export default function NotificacionesCampana() {
  const t = useTranslations("Notificaciones");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifRow[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/notificaciones");
    const j = await res.json() as { notificaciones?: NotifRow[] };
    setItems(j.notificaciones ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notif-campana")
      .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "notificaciones" },
          () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const unread = items.filter((n) => !n.leida).length;

  async function markAll() {
    await fetch("/api/notificaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true }),
    });
    void load();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label={t("aria_label")}
      >
        <Bell className="w-5 h-5 text-gray-700" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button aria-label="cerrar" onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute right-0 mt-2 w-80 z-20 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <h3 className="text-sm font-semibold">{t("titulo")}</h3>
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-secondary hover:underline">
                  {t("marcar_todas")}
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="p-6 text-center text-sm text-neutral">{t("vacio")}</p>
              ) : items.map((n) => (
                <Link
                  key={n.id}
                  href={`/${locale}${n.link ?? "/dashboard"}`}
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${!n.leida ? "bg-blue-50/30" : ""}`}
                >
                  <p className="text-sm font-semibold">{n.titulo}</p>
                  <p className="text-xs text-neutral line-clamp-2">{n.mensaje}</p>
                  <p className="text-[10px] text-neutral mt-1">
                    {new Date(n.created_at).toLocaleString("es-NI", { timeZone: "America/Managua" })}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Insertar en `Topbar.tsx`**

Localizar el slot apropiado (junto al avatar del usuario o al selector de idioma) y agregar:

```tsx
import NotificacionesCampana from "./NotificacionesCampana";

// En el JSX del topbar derecho:
<NotificacionesCampana />
```

- [ ] **Step 4: Claves i18n bajo `Notificaciones`**

```json
"Notificaciones": {
  "aria_label":    "Notificaciones",
  "titulo":        "Notificaciones",
  "marcar_todas":  "Marcar todas como leídas",
  "vacio":         "No tienes notificaciones por ahora."
}
```

(Y en inglés.)

- [ ] **Step 5: Build + smoke test**

```bash
pnpm build && pnpm dev
# Confirmar una cita desde admin → la campana del miembro debería mostrar un badge "1" en tiempo real.
# Click → ver la notificación.
# Click "Marcar todas como leídas" → badge desaparece.
```

- [ ] **Step 6: Commit**

```bash
git add app/api/notificaciones/route.ts \
         components/dashboard/NotificacionesCampana.tsx \
         components/dashboard/Topbar.tsx \
         messages/es.json messages/en.json
git commit -m "feat(citas): add in-app notification bell in Topbar with Realtime"
```

---

## Task 11: Limpieza final — variables EA y documentación

- [ ] **Step 1: Quitar referencias EA de `CLAUDE.md`**

Editar `CLAUDE.md` y eliminar:
- La sección "Easy Appointment (EA)" en "External Integrations".
- Las variables `NEXT_PUBLIC_EA_API_URL` y `EA_API_KEY` de "Environment Variables".

- [ ] **Step 2: Recordatorio manual (no se commitea)**

Avisar al equipo (en el PR description o canal interno) de quitar de los `.env.local` y de la configuración de producción/staging:
```
NEXT_PUBLIC_EA_API_URL
EA_API_KEY
```

- [ ] **Step 3: Buscar otras menciones EA en el código y borrarlas**

```bash
grep -rn "EA_API\|ea_appointment\|ea_customer\|easy.appointment" \
  --include="*.ts" --include="*.tsx" --include="*.md" --include="*.json" -l \
  | grep -v "/specs/\|/plans/\|/node_modules/"
```

Para cada hit, borrar (texto/imports). Re-build hasta que pase.

- [ ] **Step 4: Workflows n8n EA→DB (recordatorio)**

Memory pendiente `n8n workflows migration pending` — los workflows en n8n que sincronizaban EA→Supabase quedan obsoletos. Pueden desactivarse manualmente en n8n. Documentar en el PR:

> ⚠️ Acción manual post-merge: desactivar workflows n8n del proyecto EA→DB.

- [ ] **Step 5: Build + lint final**

```bash
pnpm build && pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(citas): remove Easy! Appointments references from CLAUDE.md"
```

---

## Task 12: Smoke test full end-to-end + push + cerrar fase

- [ ] **Step 1: Levantar dev server y hacer un flujo completo**

1. **Login miembro** → crear una cita en el wizard.
2. **Verificar campana** del miembro → notificación "Cita creada".
3. **Login admin (otra pestaña)** → calendario refleja la cita pendiente.
4. **Confirmar la cita** desde el modal del calendario.
5. **Verificar campana del miembro** → notificación "Cita confirmada" (Realtime).
6. **Verificar email** del miembro → llegó email con `.ics` adjunto.
7. **Verificar WhatsApp** del miembro → llegó mensaje (si los templates están aprobados en Meta).
8. **En la card de la cita** → botón "Agregar al calendario" → menú con 4 opciones, todas funcionan.
9. **Cancelar la cita** desde el miembro (si está fuera de la ventana, falla con mensaje correcto; si está dentro, cancela).
10. **Verificar** notificaciones + WhatsApp por cancelación.

- [ ] **Step 2: Verificar recordatorio 24h (semi-manual)**

Para no esperar 24h reales, ejecutar manualmente:

```sql
INSERT INTO public.cita_eventos (cita_id, evento)
VALUES ('<cita_id_confirmada>', 'recordatorio_24h');
```

A los ~30s el procesador debería enviar el recordatorio.

- [ ] **Step 3: Inspeccionar logs de la edge function**

```bash
supabase functions logs procesar_eventos_cita --since 1h
```

Buscar errores. Si hay fallos persistentes, revisar:
- ¿Templates de WhatsApp aprobados en Meta? Si no, los mensajes fallan silenciosamente.
- ¿`RESEND_API_KEY` correcto y dominio verificado en Resend?
- ¿Hay correos válidos en `users.correo`?

- [ ] **Step 4: Push**

```bash
git push
```

- [ ] **Step 5: Commit simbólico de cierre del proyecto**

```bash
git commit --allow-empty -m "chore(citas): close phase 5 — native citas module complete

EA fully removed. Booking is atomic, real-time, and notifies via WhatsApp,
email with .ics attachment, in-app bell. Admin manages everything from the
dashboard. Calendar view with FullCalendar. 24h reminders via pg_cron."
git push
```

---

## Self-Review de Fase 5

- [ ] Tabla `cita_eventos` existe, RLS solo permite service_role.
- [ ] Trigger `tr_cita_estado_change` inserta eventos en INSERT y UPDATE OF estado_sync.
- [ ] Tabla `notificaciones` existe, RLS por user_id, Realtime habilitada.
- [ ] `pg_cron` tiene 2 jobs activos (`procesar_eventos_cita_*`, `recordatorios_citas_24h`).
- [ ] Edge function `procesar_eventos_cita` deployada, con WhatsApp + Email + in-app + `.ics`.
- [ ] Edge functions `notificar_estado_cita`, `notificar_cita_whatsapp`, `sync_ea_customer` borradas (local y remoto).
- [ ] `lib/calendar/ics.ts` y `lib/calendar/links.ts` existen.
- [ ] `/api/citas/[id]/ics` devuelve `.ics` válido con auth.
- [ ] `<AgregarACalendario />` aparece en `CitaCard` para citas confirmadas.
- [ ] `<NotificacionesCampana />` en Topbar, badge real-time, marcar como leídas funciona.
- [ ] Variables EA fuera de `CLAUDE.md`.
- [ ] Smoke test end-to-end completo exitoso.

## Limitaciones conocidas / TODO post-MVP

- **Templates de WhatsApp en Meta:** los `template` names usados
  (`cita_confirmada`, `cita_rechazada`, `cita_cancelada`,
  `cita_recordatorio_24h`) deben existir y estar aprobados en Meta Business.
  Si no, los mensajes fallan silenciosamente (el evento se marca como
  procesado con error, no se reintenta más allá de los 3 intentos).
  Acción manual: crear/aprobar templates en el Meta Business Manager.
- **Dominio de email en Resend:** `EMAIL_FROM` debe usar un dominio
  verificado en Resend. Si no, los emails no llegan.
- **n8n cleanup:** los workflows EA→DB en n8n quedan obsoletos pero se
  desactivan manualmente.
- **Reembolsos automatizados** al cancelar citas pagadas — fuera de scope.
- **Drag-and-drop** en el calendario admin — pendiente post-MVP.
- **OAuth con Google Calendar** (sync bidireccional) — pendiente post-MVP.
- **Push notifications** web o app móvil — pendiente post-MVP.
