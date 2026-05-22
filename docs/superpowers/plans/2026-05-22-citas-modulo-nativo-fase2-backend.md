# Fase 2 — Backend endpoints (Módulo nativo de citas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los route handlers que hablan con Easy! Appointments por wrappers delgados sobre las RPCs creadas en Fase 1. Crear endpoints nuevos de disponibilidad/días-disponibles, renombrar `aprobar` → `confirmar`, agregar `cancelar`, y eliminar la carpeta `app/api/ea/` por completo.

**Architecture:** Route handlers de Next.js que ejecutan `supabase.rpc(...)`, mapean los errores tipados de Postgres a códigos HTTP claros, y mantienen el patrón de auth + logging existente (`assertAdmin` o equivalente). Todas las notificaciones quedan para Fase 5 — por ahora el endpoint POST conserva la notificación interna fire-and-forget actual con joins adaptados al nuevo schema.

**Tech Stack:** Next.js 16 App Router, `@/utils/supabase/server`, `@/utils/audit`. Sin nuevos paquetes npm.

**Depende de:** Fase 1 completa.

---

## File Structure

### Archivos nuevos

| Archivo | Responsabilidad |
|---------|-----------------|
| `lib/citas/errors.ts` | Mapeo de códigos de error de las RPCs (`SLOT_TAKEN`, etc.) a HTTP status + mensaje i18n |
| `app/api/citas/disponibilidad/route.ts` | GET slots disponibles para un (doctor, servicio, fecha) |
| `app/api/citas/dias-disponibles/route.ts` | GET días disponibles para un (doctor, rango) |
| `app/api/citas/[id]/cancelar/route.ts` | POST cancelar cita (paciente o admin) |
| `app/api/admin/citas/[id]/confirmar/route.ts` | POST confirmar cita (admin) — reemplaza `aprobar` |

### Archivos a refactorizar

| Archivo | Cambio |
|---------|--------|
| `app/api/citas/route.ts` | Reescribir el POST para usar `crear_cita_atomic`; mantener la notificación interna WhatsApp con joins por `doctor_id`/`servicio_id` en vez de `ea_*`. |
| `app/api/admin/citas/[id]/rechazar/route.ts` | Reescribir para llamar `rechazar_cita` RPC. |

### Archivos a eliminar

| Archivo | Razón |
|---------|-------|
| `app/api/ea/disponibilidad/route.ts` | Sustituido por `/api/citas/disponibilidad` |
| `app/api/ea/citas/aprobar/route.ts` | EA fuera |
| `app/api/ea/citas/[id]/rechazar/route.ts` | EA fuera |
| `app/api/ea/send-codigo/route.ts` | EA fuera (era para verificación EA) |
| `app/api/admin/citas/[id]/aprobar/route.ts` | Renombrado a `confirmar` |

---

## Task 1: Helper `lib/citas/errors.ts`

**Files:**
- Create: `lib/citas/errors.ts`

- [ ] **Step 1: Crear el archivo**

```ts
// Mapea los códigos de error que lanzan las RPCs Postgres del módulo de citas
// a status HTTP + clave i18n. Las RPCs lanzan RAISE EXCEPTION USING ERRCODE = 'P0001'
// con el código en el mensaje. Supabase JS expone el mensaje en `error.message`.

export type CitaErrorCode =
  | "SLOT_TAKEN"
  | "SLOT_OUT_OF_HOURS"
  | "SLOT_IN_EXCEPTION"
  | "QUOTA_EXCEEDED"
  | "INVALID_DOCTOR_SERVICE"
  | "CANCEL_TOO_LATE"
  | "INVALID_STATE_TRANSITION"
  | "CITA_NOT_FOUND"
  | "DOCTOR_NOT_FOUND"
  | "SERVICIO_NOT_FOUND"
  | "CONTRATO_OR_METODO_PAGO_REQUIRED"
  | "UNAUTHORIZED"
  | "FORBIDDEN";

export interface CitaErrorMapping {
  status: number;
  i18nKey: string;
}

const MAPPING: Record<CitaErrorCode, CitaErrorMapping> = {
  SLOT_TAKEN:                        { status: 409, i18nKey: "Errors.citas.slot_taken" },
  SLOT_OUT_OF_HOURS:                 { status: 422, i18nKey: "Errors.citas.slot_out_of_hours" },
  SLOT_IN_EXCEPTION:                 { status: 422, i18nKey: "Errors.citas.slot_in_exception" },
  QUOTA_EXCEEDED:                    { status: 409, i18nKey: "Errors.citas.quota_exceeded" },
  INVALID_DOCTOR_SERVICE:            { status: 422, i18nKey: "Errors.citas.invalid_doctor_service" },
  CANCEL_TOO_LATE:                   { status: 409, i18nKey: "Errors.citas.cancel_too_late" },
  INVALID_STATE_TRANSITION:          { status: 409, i18nKey: "Errors.citas.invalid_state_transition" },
  CITA_NOT_FOUND:                    { status: 404, i18nKey: "Errors.citas.cita_not_found" },
  DOCTOR_NOT_FOUND:                  { status: 404, i18nKey: "Errors.citas.doctor_not_found" },
  SERVICIO_NOT_FOUND:                { status: 404, i18nKey: "Errors.citas.servicio_not_found" },
  CONTRATO_OR_METODO_PAGO_REQUIRED:  { status: 400, i18nKey: "Errors.citas.contrato_or_metodo_pago_required" },
  UNAUTHORIZED:                      { status: 401, i18nKey: "Errors.citas.unauthorized" },
  FORBIDDEN:                         { status: 403, i18nKey: "Errors.citas.forbidden" },
};

const KNOWN_CODES = new Set(Object.keys(MAPPING));

export function parseCitaError(rawMessage: string | null | undefined): {
  code: CitaErrorCode | "UNKNOWN";
  status: number;
  i18nKey: string;
} {
  if (!rawMessage) {
    return { code: "UNKNOWN", status: 500, i18nKey: "Errors.citas.unknown" };
  }

  // RPCs lanzan el código como el mensaje completo: "SLOT_TAKEN", "QUOTA_EXCEEDED", etc.
  // Supabase JS a veces lo envuelve: "ERROR: SLOT_TAKEN" o JSON. Limpiamos.
  const trimmed = rawMessage.trim().toUpperCase();
  for (const code of KNOWN_CODES) {
    if (trimmed === code || trimmed.includes(code)) {
      const mapping = MAPPING[code as CitaErrorCode];
      return { code: code as CitaErrorCode, status: mapping.status, i18nKey: mapping.i18nKey };
    }
  }
  return { code: "UNKNOWN", status: 500, i18nKey: "Errors.citas.unknown" };
}
```

- [ ] **Step 2: Verificar type-check**

Run:
```bash
pnpm build
```

Expected: sin errores TS (no afecta nada más todavía).

- [ ] **Step 3: Commit**

```bash
git add lib/citas/errors.ts
git commit -m "feat(citas): add typed error mapping helper for RPC error codes"
```

---

## Task 2: Endpoint `GET /api/citas/disponibilidad`

**Files:**
- Create: `app/api/citas/disponibilidad/route.ts`

- [ ] **Step 1: Crear el archivo**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseCitaError } from "@/lib/citas/errors";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const doctorId   = params.get("doctor_id");
  const servicioId = params.get("servicio_id");
  const fecha      = params.get("fecha");  // YYYY-MM-DD

  if (!doctorId || !servicioId || !fecha) {
    return NextResponse.json(
      { error: "Missing doctor_id, servicio_id or fecha" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("obtener_slots_disponibles", {
    p_doctor_id:   doctorId,
    p_servicio_id: servicioId,
    p_fecha:       fecha,
  });

  if (error) {
    const parsed = parseCitaError(error.message);
    return NextResponse.json(
      { error: parsed.code, i18nKey: parsed.i18nKey },
      { status: parsed.status },
    );
  }

  return NextResponse.json({ slots: data ?? [] });
}
```

- [ ] **Step 2: Verificar tipo de retorno**

Run:
```bash
pnpm build
```

Si TypeScript se queja del tipo de retorno de `rpc(...)`, regenerar los tipos vía MCP:
```
mcp__plugin_supabase_supabase__generate_typescript_types (project_id: jdhaxwklszodavhdrtsp)
```

Y reemplazar el contenido de `lib/supabase/types.ts` (o donde esté el `Database` type).

- [ ] **Step 3: Smoke test manual (opcional)**

Con `pnpm dev` corriendo y un usuario autenticado, llamar:
```
GET /api/citas/disponibilidad?doctor_id=<id>&servicio_id=<id>&fecha=2026-05-23
```

Esperar `{ "slots": [{ "hora_inicio": "...", "hora_fin": "...", "disponible": true }, ...] }`.

- [ ] **Step 4: Commit**

```bash
git add app/api/citas/disponibilidad/route.ts
git commit -m "feat(citas): add GET /api/citas/disponibilidad endpoint"
```

---

## Task 3: Endpoint `GET /api/citas/dias-disponibles`

**Files:**
- Create: `app/api/citas/dias-disponibles/route.ts`

- [ ] **Step 1: Crear el archivo**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseCitaError } from "@/lib/citas/errors";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const doctorId    = params.get("doctor_id");
  const fechaInicio = params.get("fecha_inicio");  // YYYY-MM-DD
  const fechaFin    = params.get("fecha_fin");     // YYYY-MM-DD

  if (!doctorId || !fechaInicio || !fechaFin) {
    return NextResponse.json(
      { error: "Missing doctor_id, fecha_inicio or fecha_fin" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("obtener_dias_disponibles", {
    p_doctor_id:    doctorId,
    p_fecha_inicio: fechaInicio,
    p_fecha_fin:    fechaFin,
  });

  if (error) {
    const parsed = parseCitaError(error.message);
    return NextResponse.json(
      { error: parsed.code, i18nKey: parsed.i18nKey },
      { status: parsed.status },
    );
  }

  return NextResponse.json({ dias: data ?? [] });
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add app/api/citas/dias-disponibles/route.ts
git commit -m "feat(citas): add GET /api/citas/dias-disponibles endpoint"
```

---

## Task 4: Refactor del POST `/api/citas`

**Files:**
- Modify: `app/api/citas/route.ts`

Este es el cambio más sensible de la Fase 2. La estructura nueva:

1. Auth (igual que hoy).
2. Lee body con campos nuevos (`doctor_id, servicio_id, fecha_hora_cita, ubicacion_id` reemplazan `ea_*`).
3. Llama `crear_cita_atomic` RPC.
4. Si la RPC falla, parsea el error con `parseCitaError` y devuelve status apropiado.
5. Si OK, retorna `{ ok: true, cita: { id, estado_sync } }`.
6. Fire-and-forget notificación interna WhatsApp adaptada al nuevo schema (joins por `doctor_id`/`servicio_id`).

- [ ] **Step 1: Reemplazar el contenido del archivo**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseCitaError } from "@/lib/citas/errors";

// ── WhatsApp internal notification ───────────────────────────────────────────

function toE164(phone: string): string {
  const digits = phone.replace(/\s/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function formatFechaHoraNicaragua(isoUtc: string): string {
  const local = new Date(new Date(isoUtc).getTime() - 6 * 60 * 60 * 1000);
  const dd    = String(local.getUTCDate()).padStart(2, "0");
  const mm    = String(local.getUTCMonth() + 1).padStart(2, "0");
  const yyyy  = local.getUTCFullYear();
  let   h     = local.getUTCHours();
  const min   = String(local.getUTCMinutes()).padStart(2, "0");
  const ampm  = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${dd}-${mm}-${yyyy} a las ${String(h).padStart(2, "0")}:${min} ${ampm}`;
}

async function sendNotificacionInterna(opts: {
  receptorNombre:   string;
  receptorTelefono: string;
  pacienteNombre:   string;
  servicio:         string;
  fechaHora:        string;
  doctorNombre:     string;
}): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const apiToken      = process.env.WHATSAPP_API_TOKEN ?? "";
  if (!phoneNumberId || !apiToken) return;

  const res = await fetch(
    `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164(opts.receptorTelefono),
        type: "template",
        template: {
          name: "cita_notificacion_interna_sosmedical",
          language: { code: "es" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: opts.receptorNombre },
              { type: "text", text: opts.pacienteNombre },
              { type: "text", text: opts.servicio },
              { type: "text", text: opts.fechaHora },
              { type: "text", text: opts.doctorNombre },
            ],
          }],
        },
      }),
    },
  );

  if (!res.ok) {
    console.error(`[citas/notif_interna] WhatsApp ${res.status}:`, await res.text().catch(() => ""));
  }
}

// ── POST /api/citas ──────────────────────────────────────────────────────────

type CreateCitaBody = {
  doctor_id:             string;
  servicio_id:           string;
  fecha_hora_cita:       string;     // ISO UTC, ej. "2026-05-23T15:00:00Z"
  para_titular:          boolean;
  motivo_cita?:          string;
  servicio_asociado?:    string;
  paciente_nombre?:      string;
  paciente_telefono?:    string;
  paciente_correo?:      string;
  paciente_cedula?:      string;
  contrato_servicio_id?: string;
  metodo_pago?:          "link_pago" | "transferencia" | "pago_clinica";
  monto?:                number;
  notas?:                string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateCitaBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.doctor_id || !body.servicio_id || !body.fecha_hora_cita) {
    return NextResponse.json(
      { error: "doctor_id, servicio_id and fecha_hora_cita are required" },
      { status: 400 },
    );
  }

  // Llamar la RPC atómica. Toda la validación + insert vive ahí.
  const { data: citaId, error: rpcError } = await supabase.rpc("crear_cita_atomic", {
    p_doctor_id:            body.doctor_id,
    p_servicio_id:          body.servicio_id,
    p_fecha_hora_cita:      body.fecha_hora_cita,
    p_para_titular:         body.para_titular,
    p_motivo_cita:          body.motivo_cita ?? null,
    p_paciente_nombre:      body.paciente_nombre ?? null,
    p_paciente_telefono:    body.paciente_telefono ?? null,
    p_paciente_correo:      body.paciente_correo ?? null,
    p_paciente_cedula:      body.paciente_cedula ?? null,
    p_contrato_servicio_id: body.contrato_servicio_id ?? null,
    p_metodo_pago:          body.metodo_pago ?? null,
    p_monto:                body.monto ?? null,
    p_servicio_asociado:    body.servicio_asociado ?? null,
    p_notas:                body.notas ?? null,
  });

  if (rpcError) {
    const parsed = parseCitaError(rpcError.message);
    return NextResponse.json(
      { error: parsed.code, i18nKey: parsed.i18nKey },
      { status: parsed.status },
    );
  }

  // Lee la cita recién creada para devolver estado_sync (lo necesita el wizard
  // para saber a qué paso ir después)
  const { data: cita } = await supabase
    .from("citas")
    .select("id, estado_sync")
    .eq("id", citaId as string)
    .single();

  // Fire-and-forget: notificación interna WhatsApp (igual que hoy, pero con
  // joins por doctor_id/servicio_id en vez de ea_*).
  void (async () => {
    try {
      const [notifRes, pacienteRes, servicioRes, doctorRes] = await Promise.all([
        supabase.from("configuracion_sistema").select("valor").eq("clave", "notificaciones_citas").single(),
        supabase.from("users").select("nombre_completo").eq("id", user.id).single(),
        supabase.from("servicios").select("nombre").eq("id", body.servicio_id).single(),
        supabase.from("doctores").select("nombre").eq("id", body.doctor_id).single(),
      ]);

      const notif = notifRes.data?.valor as { nombre_completo?: string; telefono?: string } | null;
      if (!notif?.nombre_completo || !notif?.telefono) return;

      await sendNotificacionInterna({
        receptorNombre:   notif.nombre_completo,
        receptorTelefono: notif.telefono,
        pacienteNombre:   pacienteRes.data?.nombre_completo ?? "—",
        servicio:         servicioRes.data?.nombre ?? body.servicio_asociado ?? "Servicio médico",
        fechaHora:        formatFechaHoraNicaragua(body.fecha_hora_cita),
        doctorNombre:     doctorRes.data?.nombre ?? "—",
      });
    } catch (err) {
      console.error("[citas/notif_interna] error:", err);
    }
  })();

  return NextResponse.json({ ok: true, cita }, { status: 201 });
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

Si hay errores TS:
- Si dice que `crear_cita_atomic` no existe en `Database["public"]["Functions"]`, regenerar tipos con MCP (`generate_typescript_types`).
- Si dice que el body no acepta `null`, ajustar los `?? null` a `?? undefined` (Postgres acepta ambos vía supabase-js).

- [ ] **Step 3: Commit**

```bash
git add app/api/citas/route.ts
git commit -m "refactor(citas): POST /api/citas now uses crear_cita_atomic RPC, drops EA fields"
```

---

## Task 5: Endpoint `POST /api/citas/[id]/cancelar`

**Files:**
- Create: `app/api/citas/[id]/cancelar/route.ts`

- [ ] **Step 1: Crear el archivo**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";
import { parseCitaError } from "@/lib/citas/errors";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let motivo: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    motivo = body?.motivo ?? null;
  } catch { /* body opcional */ }

  const { error } = await supabase.rpc("cancelar_cita", {
    p_cita_id: id,
    p_motivo:  motivo,
  });

  if (error) {
    const parsed = parseCitaError(error.message);
    return NextResponse.json(
      { error: parsed.code, i18nKey: parsed.i18nKey },
      { status: parsed.status },
    );
  }

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();

  await logAction(supabase, {
    actorId:      user.id,
    actorRol:     profile?.rol ?? "miembro",
    accion:       "cita.cancelar",
    entidad:      "citas",
    entidadId:    id,
    datosDespues: { estado_sync: "cancelado", motivo },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add app/api/citas/[id]/cancelar/route.ts
git commit -m "feat(citas): add POST /api/citas/[id]/cancelar endpoint"
```

---

## Task 6: Endpoint `POST /api/admin/citas/[id]/confirmar`

**Files:**
- Create: `app/api/admin/citas/[id]/confirmar/route.ts`

- [ ] **Step 1: Crear el archivo**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/citas/[id]/confirmar/route.ts
git commit -m "feat(citas): add POST /api/admin/citas/[id]/confirmar endpoint (replaces aprobar)"
```

---

## Task 7: Refactor de `POST /api/admin/citas/[id]/rechazar`

**Files:**
- Modify: `app/api/admin/citas/[id]/rechazar/route.ts`

El endpoint actual acepta `{ citaId, motivo }` en el body, leyendo `id` desde body en vez del path. Lo refactorizamos para usar el path param + llamar la RPC.

- [ ] **Step 1: Reemplazar el contenido del archivo**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";
import { parseCitaError } from "@/lib/citas/errors";

export async function POST(
  req: NextRequest,
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

  let motivo: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    motivo = body?.motivo ?? null;
  } catch { /* body opcional */ }

  const { error } = await supabase.rpc("rechazar_cita", {
    p_cita_id: id,
    p_motivo:  motivo ?? "",
  });

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
    accion:       "cita.rechazar",
    entidad:      "citas",
    entidadId:    id,
    datosDespues: { estado_sync: "rechazado", motivo },
  });

  return NextResponse.json({ ok: true });
}
```

**Importante:** el cambio de contrato (de `body.citaId` → path param) **es un breaking change**. Los clientes (componentes admin) que hoy llaman a este endpoint deben actualizarse en Fase 4. Mientras tanto, después de este task, los clientes viejos romperán. Si esto bloquea, opción: dejar el endpoint viejo aceptando ambos formatos por compatibilidad temporal. **Recomendado:** romper ahora y arreglar los callers en Tasks 9-10 de esta misma fase.

- [ ] **Step 2: Buscar callers actuales del endpoint**

Run:
```bash
grep -rn "admin/citas/.*rechazar\|rechazar.*citaId" --include="*.ts" --include="*.tsx" -l
```

Anotar los archivos que llaman al endpoint con el formato viejo. Se actualizan en Task 10.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/citas/[id]/rechazar/route.ts
git commit -m "refactor(citas): /api/admin/citas/[id]/rechazar now uses rechazar_cita RPC + path param"
```

---

## Task 8: Eliminar `app/api/ea/`

**Files:**
- Delete: `app/api/ea/disponibilidad/route.ts`
- Delete: `app/api/ea/citas/aprobar/route.ts`
- Delete: `app/api/ea/citas/[id]/rechazar/route.ts`
- Delete: `app/api/ea/send-codigo/route.ts`
- Delete: `app/api/admin/citas/[id]/aprobar/route.ts`

- [ ] **Step 1: Buscar callers del endpoint `aprobar` viejo**

Run:
```bash
grep -rn "admin/citas/.*aprobar\|api/ea/" --include="*.ts" --include="*.tsx" -l
```

Anotar para Task 10.

- [ ] **Step 2: Eliminar los archivos**

Run:
```bash
git rm app/api/ea/disponibilidad/route.ts
git rm app/api/ea/citas/aprobar/route.ts
git rm 'app/api/ea/citas/[id]/rechazar/route.ts'
git rm app/api/ea/send-codigo/route.ts
git rm 'app/api/admin/citas/[id]/aprobar/route.ts'

# Limpiar directorios vacíos
rmdir app/api/ea/citas/'[id]' app/api/ea/citas app/api/ea 2>/dev/null || true
```

- [ ] **Step 3: Verificar build (probablemente falla por imports rotos)**

```bash
pnpm build
```

Si falla con `Module not found` o referencias a paths borrados, eso indica que hay callers viejos. Anotar los archivos que rompen para arreglar en Task 9-10.

- [ ] **Step 4: Commit**

```bash
git add -u app/api/
git commit -m "chore(citas): remove app/api/ea/ and admin/citas/[id]/aprobar (replaced by confirmar)"
```

---

## Task 9: Actualizar callers en `actions.ts` y componentes

**Files:** (a confirmar con los `grep` anteriores)
- Probables: `app/[locale]/(dashboard)/dashboard/citas/actions.ts`
- Probables: componentes admin que confirmaban citas
- Probables: componentes admin que rechazaban citas

- [ ] **Step 1: Inspeccionar y listar todos los callers**

Run:
```bash
grep -rn "/api/admin/citas/.*aprobar\|/api/admin/citas/.*rechazar\|/api/ea/" --include="*.ts" --include="*.tsx" -n
```

Para cada hit, abrir el archivo y reemplazar:
- `POST /api/admin/citas/[id]/aprobar` con body `{ citaId }` → `POST /api/admin/citas/${citaId}/confirmar` sin body.
- `POST /api/admin/citas/[id]/rechazar` con body `{ citaId, motivo }` → `POST /api/admin/citas/${citaId}/rechazar` con body `{ motivo }`.
- Cualquier llamada a `/api/ea/...` → equivalente nuevo (`/api/citas/disponibilidad`, etc.).

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

Iterar hasta que pase.

- [ ] **Step 3: Smoke test desde la UI admin**

`pnpm dev` y probar:
- Ir a una cita con estado `pendiente_admin` desde el dashboard admin.
- Click "Aprobar/Confirmar" → debería confirmar correctamente.
- Click "Rechazar" con motivo → debería rechazar correctamente.

- [ ] **Step 4: Commit (granular por archivo si son muchos)**

```bash
git add <archivos modificados>
git commit -m "refactor(citas): update admin callers to use new confirmar/rechazar endpoints"
```

---

## Task 10: Actualizar referencias EA en componentes (preparatorio)

**Archivos identificados en el spec (24 archivos referencian EA):**

Estos archivos no se reescriben en esta fase (los del wizard van en Fase 3, los del admin en Fase 4). Pero hay algunos que sirven para vistas compartidas — `CitaCard`, `MisCitas`, `ProximaCitaCard`, componentes de empresa — que pueden seguir referenciando `ea_*_id` para joins. Si después de las migraciones de Fase 1 las queries con `ea_*_id` rompen el type-check, hay que actualizarlas acá.

- [ ] **Step 1: Correr type-check y arreglar referencias rotas**

```bash
pnpm build
```

Para cada error `Property 'ea_service_id' does not exist on type ...`:
- Reemplazar el join `servicio:servicios!citas_ea_service_id_fkey(...)` por `servicio:servicios!citas_servicio_id_fkey(...)` o simplemente `servicio:servicios(...)` si supabase-js infiere el FK.
- Reemplazar el join `doctor:doctores!citas_ea_provider_id_fkey(...)` por `doctor:doctores!citas_doctor_id_fkey(...)` o `doctor:doctores(...)`.
- Reemplazar accesos a `cita.ea_service_id` / `ea_provider_id` / `ea_appointment_id` / `ea_customer_id` por sus equivalentes nuevos (`servicio_id`, `doctor_id`).

Cambios en componentes "de presentación" como CitaCard solo necesitan mostrar nombre del doctor/servicio/ubicación, así que los joins simples bastan:

```ts
.select(`
  id, fecha_hora_cita, estado_sync, para_titular,
  doctor:doctores(nombre),
  servicio:servicios(nombre),
  ubicacion:ubicaciones(nombre)
`)
```

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Arreglar warnings de imports no usados (después de borrar la lógica EA suelen quedar imports huérfanos).

- [ ] **Step 3: Commit (uno por archivo o agrupado por área)**

```bash
git add <archivos>
git commit -m "refactor(citas): replace ea_* references with doctor_id/servicio_id/ubicacion_id"
```

---

## Task 11: Script de concurrencia end-to-end

**Files:**
- Create: `supabase/tests/citas_concurrency_e2e.sh`

Test que dispara N requests HTTP en paralelo contra `POST /api/citas` para el mismo slot. Solo 1 debe responder 201, el resto debe responder 409 `SLOT_TAKEN`.

- [ ] **Step 1: Crear el script**

```bash
#!/usr/bin/env bash
# Test E2E de concurrencia: 10 requests paralelos al mismo slot.
# Solo 1 debe retornar 201, los otros 9 deben retornar 409 SLOT_TAKEN.
#
# Uso:
#   AUTH_COOKIE="sb-access-token=..." \
#   DOCTOR_ID=... \
#   SERVICIO_ID=... \
#   FECHA_HORA="2026-05-23T15:00:00Z" \
#   BASE_URL="http://localhost:3000" \
#   bash supabase/tests/citas_concurrency_e2e.sh
#
# Obtener la cookie desde el navegador (DevTools → Application → Cookies)
# después de loguearse como miembro.

set -e

: "${AUTH_COOKIE:?AUTH_COOKIE required}"
: "${DOCTOR_ID:?DOCTOR_ID required}"
: "${SERVICIO_ID:?SERVICIO_ID required}"
: "${FECHA_HORA:?FECHA_HORA required (ISO UTC)}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

PAYLOAD=$(cat <<JSON
{
  "doctor_id":       "$DOCTOR_ID",
  "servicio_id":     "$SERVICIO_ID",
  "fecha_hora_cita": "$FECHA_HORA",
  "para_titular":    true,
  "metodo_pago":     "pago_clinica"
}
JSON
)

run_one() {
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$BASE_URL/api/citas" \
    -H "Content-Type: application/json" \
    -H "Cookie: $AUTH_COOKIE" \
    -d "$PAYLOAD"
}

export -f run_one
export AUTH_COOKIE DOCTOR_ID SERVICIO_ID FECHA_HORA BASE_URL PAYLOAD

echo "Disparando 10 requests en paralelo..."
RESULTS=$(seq 10 | xargs -I {} -P 10 bash -c 'run_one')
echo "$RESULTS"

COUNT_201=$(echo "$RESULTS" | grep -c '^201$' || true)
COUNT_409=$(echo "$RESULTS" | grep -c '^409$' || true)

echo ""
echo "Resumen:"
echo "  201: $COUNT_201 (esperado: 1)"
echo "  409: $COUNT_409 (esperado: 9)"

if [ "$COUNT_201" = "1" ] && [ "$COUNT_409" = "9" ]; then
  echo "PASS"
  exit 0
else
  echo "FAIL"
  exit 1
fi
```

- [ ] **Step 2: Hacer ejecutable**

```bash
chmod +x supabase/tests/citas_concurrency_e2e.sh
```

- [ ] **Step 3: (Opcional) Ejecutar el script con `pnpm dev` corriendo**

Si tenés acceso a un usuario test loguado:

```bash
AUTH_COOKIE="..." DOCTOR_ID="..." SERVICIO_ID="..." \
  FECHA_HORA="$(date -v+1d -u +%Y-%m-%dT15:00:00Z)" \
  bash supabase/tests/citas_concurrency_e2e.sh
```

Esperar `PASS`.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/citas_concurrency_e2e.sh
git commit -m "test(citas): add E2E concurrency script for POST /api/citas"
```

---

## Task 12: Verificación final + push

- [ ] **Step 1: Build + lint completo**

```bash
pnpm build && pnpm lint
```

Ambos deben pasar.

- [ ] **Step 2: Smoke test manual end-to-end con `pnpm dev`**

1. Login como miembro.
2. Llamar `GET /api/citas/disponibilidad?doctor_id=...&servicio_id=...&fecha=...` → ver slots.
3. Llamar `POST /api/citas` con un slot disponible → 201 + cita en DB.
4. Repetir el mismo POST → 409 `SLOT_TAKEN`.
5. Login como admin.
6. `POST /api/admin/citas/${id}/confirmar` → cita confirmada.
7. Login como miembro.
8. `POST /api/citas/${id}/cancelar` con motivo → cita cancelada (si está dentro de la ventana).

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Commit simbólico de cierre de fase**

```bash
git commit --allow-empty -m "chore(citas): close phase 2 — backend endpoints ready for fase 3"
git push
```

---

## Self-Review de Fase 2

- [ ] `app/api/ea/` no existe.
- [ ] `app/api/admin/citas/[id]/aprobar/` no existe.
- [ ] `app/api/admin/citas/[id]/confirmar/`, `rechazar/` existen y usan RPCs.
- [ ] `app/api/citas/disponibilidad/`, `dias-disponibles/`, `[id]/cancelar/` existen.
- [ ] `app/api/citas/route.ts` (POST) usa `crear_cita_atomic` y no menciona `ea_*`.
- [ ] `lib/citas/errors.ts` mapea los códigos del spec.
- [ ] `pnpm build` y `pnpm lint` pasan.
- [ ] El test de concurrencia E2E pasa (manual).
- [ ] Smoke test end-to-end manual exitoso.

## Limitaciones conocidas tras Fase 2

- El wizard del miembro **todavía no se actualizó** — probablemente esté roto al
  intentar reservar desde la UI hasta que se complete la Fase 3. Documentar
  esto en el PR / despliegue.
- Los componentes admin existentes (lista de citas, vista de cada cita) pueden
  seguir mostrando información parcial porque algunos campos cambiaron de
  origen; se completan en Fase 4.
- Notificaciones de confirmación/rechazo al paciente todavía no llegan; eso es
  Fase 5.
