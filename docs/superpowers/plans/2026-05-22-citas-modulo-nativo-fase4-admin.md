# Fase 4 — Dashboard admin (Módulo nativo de citas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir las UIs de administración global para el módulo de citas: CRUD de ubicaciones, servicios y doctores (con horarios y excepciones), más una vista de calendario con todas las citas usando FullCalendar. Refactor del `admin/citas` existente para usar el nuevo schema.

**Architecture:** Server Components para las páginas/listas (auth gate y data fetch inicial); Client Components para los formularios, modales y FullCalendar. Route handlers admin siguen el patrón `assertAdmin` existente. La vista calendario se suscribe a Realtime para refrescar cuando varios admins están viendo. Después de esta fase, una migración posterior agrega `NOT NULL` a `doctores.ubicacion_id`.

**Tech Stack:** Next.js App Router (RSC + Client Components), `@fullcalendar/react` (+ daygrid/timegrid/interaction plugins), shadcn (`Dialog`, `Form`, `Select`, `Tabs`, `Table`), `sonner`, `lucide-react`.

**Depende de:** Fase 1 completa (schema + RPCs).

---

## File Structure

### Páginas nuevas (`app/[locale]/(dashboard)/dashboard/admin/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `ubicaciones/page.tsx` | Lista + modal CRUD |
| `servicios/page.tsx` | Lista + modal CRUD |
| `doctores/page.tsx` | Lista de doctores con filtros |
| `doctores/[id]/page.tsx` | Detalle con tabs (Info, Servicios, Horarios+Excepciones) |
| `citas/calendario/page.tsx` | Vista calendario con FullCalendar |

### Componentes nuevos (`components/dashboard/admin/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `AdminUbicaciones.tsx` | Tabla + modal de crear/editar |
| `AdminUbicacionFormModal.tsx` | Formulario de ubicación |
| `AdminServicios.tsx` | Tabla + modal de crear/editar |
| `AdminServicioFormModal.tsx` | Formulario de servicio |
| `AdminDoctores.tsx` | Tabla con filtros |
| `AdminDoctorFormModal.tsx` | Formulario de doctor (crear/editar info básica) |
| `AdminDoctorDetalle.tsx` | Detalle con tabs |
| `AdminDoctorTabInfo.tsx` | Tab de información básica |
| `AdminDoctorTabServicios.tsx` | Tab de asignación servicios (checkboxes) |
| `AdminDoctorTabHorarios.tsx` | Tab de horarios semanales + excepciones |
| `AdminCalendarioCitas.tsx` | Vista FullCalendar con filtros y modal de detalle |
| `AdminCitaDetalleModal.tsx` | Modal con info de cita + acciones (confirmar/rechazar/cancelar) |

### Endpoints admin nuevos (`app/api/admin/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `ubicaciones/route.ts` | GET (listar), POST (crear) |
| `ubicaciones/[id]/route.ts` | PUT (editar), DELETE (soft) |
| `servicios/route.ts` | GET, POST |
| `servicios/[id]/route.ts` | PUT, DELETE |
| `doctores/route.ts` | GET, POST |
| `doctores/[id]/route.ts` | GET (detalle), PUT, DELETE |
| `doctores/[id]/servicios/route.ts` | PUT (reemplazar el set de servicios asignados) |
| `doctores/[id]/horarios/route.ts` | GET, POST (crear bloque) |
| `doctores/[id]/horarios/[horarioId]/route.ts` | PUT, DELETE |
| `doctores/[id]/excepciones/route.ts` | GET, POST |
| `doctores/[id]/excepciones/[excepcionId]/route.ts` | DELETE |

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `components/dashboard/Sidebar.tsx` | Agregar items "Ubicaciones", "Servicios", "Doctores", "Calendario" |
| `messages/es.json` y `messages/en.json` | Claves nuevas bajo `Dashboard.admin.ubicaciones.*`, `.servicios.*`, `.doctores.*`, `.citas.calendario.*` y `nav.*` |
| `package.json` | Dependencias `@fullcalendar/*` |

---

## Task 1: Instalar FullCalendar

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Instalar paquetes**

```bash
pnpm add @fullcalendar/react @fullcalendar/core @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
```

- [ ] **Step 2: Verificar versiones y build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add @fullcalendar/react and plugins for admin calendar view"
```

---

## Task 2: API — CRUD `ubicaciones`

**Files:**
- Create: `app/api/admin/ubicaciones/route.ts`
- Create: `app/api/admin/ubicaciones/[id]/route.ts`

- [ ] **Step 1: Crear `app/api/admin/ubicaciones/route.ts` (GET + POST)**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, profile };
}

export async function GET() {
  const supabase = await createClient();
  const auth = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const { data, error } = await supabase
    .from("ubicaciones")
    .select("id, nombre, direccion, telefono, zona_horaria, activo, created_at")
    .order("nombre");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ubicaciones: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({})) as {
    nombre?: string; direccion?: string; telefono?: string;
    zona_horaria?: string; activo?: boolean;
  };

  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: "nombre is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ubicaciones")
    .insert({
      nombre:       body.nombre.trim(),
      direccion:    body.direccion ?? null,
      telefono:     body.telefono ?? null,
      zona_horaria: body.zona_horaria ?? "America/Managua",
      activo:       body.activo ?? true,
    })
    .select("id, nombre")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId: auth.user.id, actorRol: "admin",
    accion: "ubicacion.crear", entidad: "ubicaciones",
    entidadId: data.id, datosDespues: data,
  });

  return NextResponse.json({ ok: true, ubicacion: data }, { status: 201 });
}
```

- [ ] **Step 2: Crear `app/api/admin/ubicaciones/[id]/route.ts` (PUT + DELETE)**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAction } from "@/utils/audit";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, profile };
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({})) as {
    nombre?: string; direccion?: string; telefono?: string;
    zona_horaria?: string; activo?: boolean;
  };

  const update: Record<string, unknown> = {};
  if (body.nombre !== undefined)       update.nombre = body.nombre;
  if (body.direccion !== undefined)    update.direccion = body.direccion;
  if (body.telefono !== undefined)     update.telefono = body.telefono;
  if (body.zona_horaria !== undefined) update.zona_horaria = body.zona_horaria;
  if (body.activo !== undefined)       update.activo = body.activo;

  const { error } = await supabase
    .from("ubicaciones").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId: auth.user.id, actorRol: "admin",
    accion: "ubicacion.editar", entidad: "ubicaciones",
    entidadId: id, datosDespues: update,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth = await assertAdmin(supabase);
  if ("error" in auth) return auth.error;

  // Soft delete: marcar activo = false. No borrar (puede tener doctores asociados).
  const { error } = await supabase
    .from("ubicaciones").update({ activo: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, {
    actorId: auth.user.id, actorRol: "admin",
    accion: "ubicacion.desactivar", entidad: "ubicaciones",
    entidadId: id, datosDespues: { activo: false },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Build**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/ubicaciones/
git commit -m "feat(citas/admin): CRUD endpoints for ubicaciones"
```

---

## Task 3: UI — `admin/ubicaciones`

**Files:**
- Create: `app/[locale]/(dashboard)/dashboard/admin/ubicaciones/page.tsx`
- Create: `components/dashboard/admin/AdminUbicaciones.tsx`
- Create: `components/dashboard/admin/AdminUbicacionFormModal.tsx`

Patrón: igual al de `admin/empresas` o `admin/beneficios` (server component que valida rol y renderiza el client).

- [ ] **Step 1: Crear `app/[locale]/(dashboard)/dashboard/admin/ubicaciones/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminUbicaciones from "@/components/dashboard/admin/AdminUbicaciones";

export default async function AdminUbicacionesPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  const t = await getTranslations("Dashboard.admin.ubicaciones");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm font-roboto text-neutral mt-1">{t("subtitle")}</p>
      </header>
      <AdminUbicaciones />
    </div>
  );
}
```

- [ ] **Step 2: Crear `components/dashboard/admin/AdminUbicaciones.tsx`**

Componente client con tabla + botón "Nueva ubicación" → abre modal de crear. Click en una fila abre el modal de editar. Patrón: similar a `AdminEmpresas.tsx`, copiar la estructura.

(Esqueleto completo — adaptar styling al de los otros AdminXxx.tsx del proyecto:)

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, MapPin } from "lucide-react";
import { toast } from "sonner";
import AdminUbicacionFormModal from "./AdminUbicacionFormModal";

interface UbicacionRow {
  id: string; nombre: string; direccion: string | null;
  telefono: string | null; zona_horaria: string; activo: boolean;
}

export default function AdminUbicaciones() {
  const t = useTranslations("Dashboard.admin.ubicaciones");
  const [rows, setRows]       = useState<UbicacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UbicacionRow | "new" | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/ubicaciones");
    const j = await res.json() as { ubicaciones?: UbicacionRow[] };
    setRows(j.ubicaciones ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> {t("nueva")}
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <p className="p-6 text-center text-sm text-neutral">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral">{t("empty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("col_nombre")}</th>
                <th className="px-4 py-3 font-semibold">{t("col_direccion")}</th>
                <th className="px-4 py-3 font-semibold">{t("col_telefono")}</th>
                <th className="px-4 py-3 font-semibold">{t("col_estado")}</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 flex items-center gap-2 font-medium">
                    <MapPin className="w-4 h-4 text-secondary" /> {u.nombre}
                  </td>
                  <td className="px-4 py-3 text-neutral">{u.direccion ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral">{u.telefono ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={u.activo ? "text-green-700" : "text-neutral"}>
                      {u.activo ? t("activo") : t("inactivo")}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      onClick={() => setEditing(u)}
                      aria-label={t("editar")}
                      className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <Pencil className="w-4 h-4 text-neutral" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null && (
        <AdminUbicacionFormModal
          mode={editing === "new" ? "create" : "edit"}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
            toast.success(t("saved"));
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Crear `AdminUbicacionFormModal.tsx`**

Modal con campos: nombre, dirección, teléfono, zona_horaria (default `America/Managua`), activo. Botones: Cancelar / Guardar. POST a `/api/admin/ubicaciones` o PUT a `/api/admin/ubicaciones/[id]` según `mode`. Usar shadcn `Dialog` si está disponible en el proyecto, sino el patrón de otros XxxFormModal del repo.

(Estructura idéntica a `AvisoFormModal.tsx` o similares — copiar y adaptar.)

- [ ] **Step 4: Claves i18n para `Dashboard.admin.ubicaciones`**

`messages/es.json`:
```json
"ubicaciones": {
  "title": "Ubicaciones",
  "subtitle": "Administra las clínicas donde se atienden las citas.",
  "nueva": "Nueva ubicación",
  "editar": "Editar",
  "loading": "Cargando...",
  "empty": "Aún no hay ubicaciones.",
  "saved": "Cambios guardados",
  "col_nombre": "Nombre",
  "col_direccion": "Dirección",
  "col_telefono": "Teléfono",
  "col_estado": "Estado",
  "activo": "Activo",
  "inactivo": "Inactivo",
  "form": {
    "nombre": "Nombre",
    "direccion": "Dirección",
    "telefono": "Teléfono",
    "zona_horaria": "Zona horaria",
    "activo": "Activo",
    "cancelar": "Cancelar",
    "guardar": "Guardar"
  }
}
```

`messages/en.json`: equivalentes en inglés (Locations / New location / Loading / etc.).

- [ ] **Step 5: Build + smoke test**

```bash
pnpm build
pnpm dev
```

Ir a `/<locale>/dashboard/admin/ubicaciones` como admin → debería listar Managua y León. Crear una ubicación de prueba → aparece. Editar → cambios se guardan.

- [ ] **Step 6: Commit**

```bash
git add app/'[locale]'/'(dashboard)'/dashboard/admin/ubicaciones/ \
         components/dashboard/admin/AdminUbicaciones.tsx \
         components/dashboard/admin/AdminUbicacionFormModal.tsx \
         messages/es.json messages/en.json
git commit -m "feat(citas/admin): add admin/ubicaciones page with CRUD"
```

---

## Task 4: API + UI — `admin/servicios`

Idéntico al patrón de Task 2/3 pero para `servicios`.

**Files:**
- Create: `app/api/admin/servicios/route.ts`
- Create: `app/api/admin/servicios/[id]/route.ts`
- Create: `app/[locale]/(dashboard)/dashboard/admin/servicios/page.tsx`
- Create: `components/dashboard/admin/AdminServicios.tsx`
- Create: `components/dashboard/admin/AdminServicioFormModal.tsx`

Campos del formulario: nombre, descripción, duración (minutos, informativa), slot_duracion (cuántos slots consume — SMALLINT, default 1), precio, activo. La asignación de doctores se hace desde la página del doctor (Task 7), no acá.

- [ ] **Step 1: API routes (siguiendo el patrón de Task 2)**

(El código es mecánico: GET/POST en `/route.ts`, PUT/DELETE en `/[id]/route.ts`. Soft delete con `activo = false`.)

- [ ] **Step 2: Page + tabla `AdminServicios.tsx`**

Misma estructura que `AdminUbicaciones`. Columnas: nombre, duración (informativa), slot_duracion, precio, # doctores que lo ofrecen.

Para contar doctores, hacer un join en la query:
```ts
.select(`
  id, nombre, descripcion, duracion, slot_duracion, precio, activo,
  doctor_servicios(count)
`)
```

- [ ] **Step 3: Modal `AdminServicioFormModal.tsx`**

Campos: nombre, descripción, duracion (min, informativa), slot_duracion (entero ≥ 1), precio (decimal nullable), activo (toggle). Validación: nombre requerido, slot_duracion ≥ 1.

- [ ] **Step 4: Claves i18n bajo `Dashboard.admin.servicios.*`**

Análogas a ubicaciones, con extras: `col_duracion`, `col_precio`, `col_doctores`, `form.slot_duracion_help` (texto explicativo).

- [ ] **Step 5: Build + smoke test**

```bash
pnpm build && pnpm dev
```

Crear un servicio nuevo desde la UI, editarlo, desactivarlo.

- [ ] **Step 6: Commit (uno por sub-paso o agrupado)**

```bash
git add app/api/admin/servicios/ \
         app/'[locale]'/'(dashboard)'/dashboard/admin/servicios/ \
         components/dashboard/admin/AdminServicios.tsx \
         components/dashboard/admin/AdminServicioFormModal.tsx \
         messages/es.json messages/en.json
git commit -m "feat(citas/admin): add admin/servicios page with CRUD"
```

---

## Task 5: API — endpoints `admin/doctores`

**Files:**
- Create: `app/api/admin/doctores/route.ts`
- Create: `app/api/admin/doctores/[id]/route.ts`
- Create: `app/api/admin/doctores/[id]/servicios/route.ts`
- Create: `app/api/admin/doctores/[id]/horarios/route.ts`
- Create: `app/api/admin/doctores/[id]/horarios/[horarioId]/route.ts`
- Create: `app/api/admin/doctores/[id]/excepciones/route.ts`
- Create: `app/api/admin/doctores/[id]/excepciones/[excepcionId]/route.ts`

- [ ] **Step 1: `/api/admin/doctores/route.ts` (GET con joins + POST)**

```ts
// GET — lista con info de ubicación + count de servicios
export async function GET() {
  const supabase = await createClient();
  // ... assertAdmin ...
  const { data, error } = await supabase
    .from("doctores")
    .select(`
      id, nombre, correo, activo, created_at,
      ubicacion:ubicaciones(id, nombre),
      doctor_servicios(count)
    `)
    .order("nombre");
  // ...
}

// POST — crear doctor
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    nombre: string; correo?: string;
    ubicacion_id: string; activo?: boolean;
  };
  if (!body.nombre || !body.ubicacion_id) {
    return NextResponse.json({ error: "nombre and ubicacion_id required" }, { status: 400 });
  }
  // INSERT, return id
}
```

- [ ] **Step 2: `/api/admin/doctores/[id]/route.ts` (GET detalle + PUT + DELETE soft)**

GET incluye horarios, excepciones, servicios asignados.

```ts
export async function GET(
  _req: NextRequest, ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  // assertAdmin

  const [doctor, horarios, excepciones, servicios] = await Promise.all([
    supabase.from("doctores").select(`
      id, nombre, correo, activo, ubicacion_id,
      ubicacion:ubicaciones(id, nombre)
    `).eq("id", id).single(),
    supabase.from("horarios_doctores")
      .select("id, dia_semana, hora_inicio, hora_fin, slot_duracion, activo")
      .eq("doctor_id", id).order("dia_semana").order("hora_inicio"),
    supabase.from("excepciones_horario")
      .select("id, fecha_inicio, fecha_fin, motivo")
      .eq("doctor_id", id)
      .gte("fecha_fin", new Date().toISOString())
      .order("fecha_inicio"),
    supabase.from("doctor_servicios")
      .select("servicio_id, servicio:servicios(id, nombre)")
      .eq("doctor_id", id),
  ]);

  if (doctor.error || !doctor.data) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  return NextResponse.json({
    doctor:      doctor.data,
    horarios:    horarios.data ?? [],
    excepciones: excepciones.data ?? [],
    servicios:   servicios.data ?? [],
  });
}
```

PUT acepta nombre / correo / ubicacion_id / activo.
DELETE soft (activo = false).

- [ ] **Step 3: `/api/admin/doctores/[id]/servicios/route.ts` (PUT reemplaza el set)**

```ts
export async function PUT(
  req: NextRequest, ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json() as { servicio_ids: string[] };
  // assertAdmin
  const supabase = await createClient();

  // Reemplazar atómicamente: borrar todos y reinsertar
  await supabase.from("doctor_servicios").delete().eq("doctor_id", id);
  if (body.servicio_ids.length > 0) {
    await supabase.from("doctor_servicios").insert(
      body.servicio_ids.map((sid) => ({ doctor_id: id, servicio_id: sid })),
    );
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: `/api/admin/doctores/[id]/horarios/route.ts` (POST crear bloque)**

```ts
export async function POST(
  req: NextRequest, ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json() as {
    dia_semana: number; hora_inicio: string; hora_fin: string; slot_duracion?: number;
  };
  // validar 0 ≤ dia_semana ≤ 6, formato HH:MM
  const supabase = await createClient();
  // assertAdmin
  const { data, error } = await supabase.from("horarios_doctores")
    .insert({
      doctor_id:     id,
      dia_semana:    body.dia_semana,
      hora_inicio:   body.hora_inicio,
      hora_fin:      body.hora_fin,
      slot_duracion: body.slot_duracion ?? 30,
    }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, horario: data }, { status: 201 });
}
```

- [ ] **Step 5: `/api/admin/doctores/[id]/horarios/[horarioId]/route.ts` (PUT + DELETE)**

PUT: editar hora_inicio/hora_fin/slot_duracion/activo. DELETE: hard delete (no afecta citas pasadas).

- [ ] **Step 6: `/api/admin/doctores/[id]/excepciones/route.ts` y `/[excepcionId]/route.ts`**

POST: fecha_inicio, fecha_fin, motivo. DELETE: borrar excepción.

- [ ] **Step 7: Build + commit**

```bash
pnpm build
git add app/api/admin/doctores/
git commit -m "feat(citas/admin): CRUD endpoints for doctores (info, servicios, horarios, excepciones)"
```

---

## Task 6: UI lista — `admin/doctores`

**Files:**
- Create: `app/[locale]/(dashboard)/dashboard/admin/doctores/page.tsx`
- Create: `components/dashboard/admin/AdminDoctores.tsx`
- Create: `components/dashboard/admin/AdminDoctorFormModal.tsx`

- [ ] **Step 1: Page (server component) similar a Task 3 Step 1**

Renderiza `<AdminDoctores />`.

- [ ] **Step 2: `AdminDoctores.tsx`**

Tabla con: nombre, ubicación, # servicios, activo. Filtros: ubicación (select), estado (activo/inactivo/todos). Botón "Nuevo doctor".

Click en una fila navega a `/<locale>/dashboard/admin/doctores/<id>`.

- [ ] **Step 3: `AdminDoctorFormModal.tsx`**

Solo para crear o editar info básica (nombre, correo, ubicación, activo). La asignación de servicios y horarios va en la página de detalle.

- [ ] **Step 4: Claves i18n bajo `Dashboard.admin.doctores`**

Incluye: title, subtitle, nuevo, col_*, form_*, etc.

- [ ] **Step 5: Build + smoke test + commit**

```bash
pnpm build && pnpm dev
# Crear un doctor de prueba con ubicación Managua → aparece en lista
git add app/'[locale]'/'(dashboard)'/dashboard/admin/doctores/page.tsx \
         components/dashboard/admin/AdminDoctores.tsx \
         components/dashboard/admin/AdminDoctorFormModal.tsx \
         messages/es.json messages/en.json
git commit -m "feat(citas/admin): add admin/doctores list page with CRUD"
```

---

## Task 7: UI detalle — `admin/doctores/[id]`

**Files:**
- Create: `app/[locale]/(dashboard)/dashboard/admin/doctores/[id]/page.tsx`
- Create: `components/dashboard/admin/AdminDoctorDetalle.tsx`
- Create: `components/dashboard/admin/AdminDoctorTabInfo.tsx`
- Create: `components/dashboard/admin/AdminDoctorTabServicios.tsx`
- Create: `components/dashboard/admin/AdminDoctorTabHorarios.tsx`

- [ ] **Step 1: Page (server component) que valida rol y carga datos iniciales**

```tsx
import AdminDoctorDetalle from "@/components/dashboard/admin/AdminDoctorDetalle";

export default async function DoctorDetallePage({
  params,
}: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  // ... auth gate igual a ubicaciones ...
  return <AdminDoctorDetalle doctorId={id} />;
}
```

- [ ] **Step 2: `AdminDoctorDetalle.tsx` — wrapper con tabs**

Usar shadcn `Tabs` si está instalado, sino un patrón propio:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import AdminDoctorTabInfo from "./AdminDoctorTabInfo";
import AdminDoctorTabServicios from "./AdminDoctorTabServicios";
import AdminDoctorTabHorarios from "./AdminDoctorTabHorarios";

type Tab = "info" | "servicios" | "horarios";

export default function AdminDoctorDetalle({ doctorId }: { doctorId: string }) {
  const t = useTranslations("Dashboard.admin.doctores.detalle");
  const [tab, setTab] = useState<Tab>("info");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-200">
        {(["info", "servicios", "horarios"] as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === k
                ? "border-primary text-primary"
                : "border-transparent text-neutral hover:text-gray-700"
            }`}
          >
            {t(`tab_${k}`)}
          </button>
        ))}
      </div>

      {tab === "info"      && <AdminDoctorTabInfo doctorId={doctorId} />}
      {tab === "servicios" && <AdminDoctorTabServicios doctorId={doctorId} />}
      {tab === "horarios"  && <AdminDoctorTabHorarios doctorId={doctorId} />}
    </div>
  );
}
```

- [ ] **Step 3: `AdminDoctorTabInfo.tsx`**

Formulario simple con nombre, correo, ubicación (select), activo. Botón guardar → PUT a `/api/admin/doctores/[id]`.

- [ ] **Step 4: `AdminDoctorTabServicios.tsx`**

Lista todos los servicios activos como checkboxes. Carga inicial: marcar los que están en `doctor_servicios`. Botón "Guardar" → PUT a `/api/admin/doctores/[id]/servicios` con `{ servicio_ids: [...] }`.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

interface Servicio { id: string; nombre: string; }

export default function AdminDoctorTabServicios({ doctorId }: { doctorId: string }) {
  const t = useTranslations("Dashboard.admin.doctores.detalle.servicios");
  const [servicios, setServicios]   = useState<Servicio[]>([]);
  const [asignados, setAsignados]   = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    void (async () => {
      const [allRes, detRes] = await Promise.all([
        fetch("/api/admin/servicios"),
        fetch(`/api/admin/doctores/${doctorId}`),
      ]);
      const allJ = await allRes.json() as { servicios?: Servicio[] };
      const detJ = await detRes.json() as { servicios?: { servicio_id: string }[] };
      setServicios(allJ.servicios ?? []);
      setAsignados(new Set((detJ.servicios ?? []).map((s) => s.servicio_id)));
      setLoading(false);
    })();
  }, [doctorId]);

  function toggle(id: string) {
    setAsignados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/admin/doctores/${doctorId}/servicios`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servicio_ids: Array.from(asignados) }),
    });
    setSaving(false);
    if (res.ok) toast.success(t("saved"));
    else        toast.error(t("save_error"));
  }

  if (loading) return <p className="text-sm text-neutral">{t("loading")}</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {servicios.map((s) => (
          <label key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={asignados.has(s.id)}
              onChange={() => toggle(s.id)}
              className="w-4 h-4 accent-primary"
            />
            <span className="font-roboto">{s.nombre}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={handleSave}
        className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
      >
        {t("guardar")}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: `AdminDoctorTabHorarios.tsx`**

Sección principal: tabla con días de la semana, listando los bloques actuales. Cada fila tiene "+" para agregar un bloque, "-" para borrarlo, y los campos editables inline (o vía modal pequeño).

Sección secundaria: excepciones cronológicas con form para agregar (fecha_inicio, fecha_fin, motivo).

(Esqueleto extenso — implementar siguiendo el patrón. Mínimo viable: lista de bloques, modal de "agregar bloque" con dia_semana + horarios + slot_duracion, lista de excepciones con modal de "agregar excepción".)

- [ ] **Step 6: Claves i18n bajo `Dashboard.admin.doctores.detalle.*`**

Incluye: `tab_info`, `tab_servicios`, `tab_horarios`, `servicios.guardar`, `servicios.saved`, `horarios.title`, `horarios.dia_0` … `dia_6`, `horarios.agregar_bloque`, `horarios.excepciones_title`, etc.

- [ ] **Step 7: Build + smoke test**

```bash
pnpm build && pnpm dev
# Navegar a /<locale>/dashboard/admin/doctores/<id>:
# - Tab Info: editar nombre y ubicación → guarda.
# - Tab Servicios: marcar dos servicios → guarda.
# - Tab Horarios: agregar bloque Lunes 8-12 → aparece, eliminar → desaparece.
#                  Agregar excepción → aparece en la lista.
```

- [ ] **Step 8: Commit (granular o agrupado)**

```bash
git add app/'[locale]'/'(dashboard)'/dashboard/admin/doctores/'[id]'/ \
         components/dashboard/admin/AdminDoctorDetalle.tsx \
         components/dashboard/admin/AdminDoctorTabInfo.tsx \
         components/dashboard/admin/AdminDoctorTabServicios.tsx \
         components/dashboard/admin/AdminDoctorTabHorarios.tsx \
         messages/es.json messages/en.json
git commit -m "feat(citas/admin): add admin/doctores/[id] detail page with Info/Servicios/Horarios tabs"
```

---

## Task 8: Vista calendario con FullCalendar

**Files:**
- Create: `app/[locale]/(dashboard)/dashboard/admin/citas/calendario/page.tsx`
- Create: `components/dashboard/admin/AdminCalendarioCitas.tsx`
- Create: `components/dashboard/admin/AdminCitaDetalleModal.tsx`

- [ ] **Step 1: Page server component (auth gate)**

```tsx
import AdminCalendarioCitas from "@/components/dashboard/admin/AdminCalendarioCitas";

export default async function CalendarioPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // ... assertAdmin redirect ...
  return <AdminCalendarioCitas />;
}
```

- [ ] **Step 2: `AdminCalendarioCitas.tsx`**

Cliente con FullCalendar:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";
import { createClient } from "@/utils/supabase/client";
import { useTranslations } from "next-intl";
import AdminCitaDetalleModal from "./AdminCitaDetalleModal";

interface CitaCalendario {
  id:              string;
  fecha_hora_cita: string;
  fecha_hora_fin:  string;
  estado_sync:     string;
  paciente:        { nombre_completo: string | null } | null;
  doctor:          { nombre: string } | null;
  servicio:        { nombre: string } | null;
  ubicacion:       { nombre: string } | null;
}

const COLOR_BY_ESTADO: Record<string, string> = {
  pendiente:         "#f59e0b",
  pendiente_empresa: "#f59e0b",
  pendiente_pago:    "#f59e0b",
  pendiente_admin:   "#f59e0b",
  confirmado:        "#10b981",
  completado:        "#6b7280",
  cancelado:         "#ef4444",
  rechazado:         "#ef4444",
};

export default function AdminCalendarioCitas() {
  const t = useTranslations("Dashboard.admin.citas.calendario");
  const [events, setEvents]     = useState<EventInput[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const calRef = useRef<FullCalendar | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const view = calRef.current?.getApi().view;
    const start = view?.activeStart?.toISOString() ?? new Date().toISOString();
    const end   = view?.activeEnd?.toISOString()   ?? new Date(Date.now() + 30 * 86400_000).toISOString();

    const { data } = await supabase
      .from("citas")
      .select(`
        id, fecha_hora_cita, fecha_hora_fin, estado_sync,
        paciente:users!paciente_id(nombre_completo),
        doctor:doctores(nombre),
        servicio:servicios(nombre),
        ubicacion:ubicaciones(nombre)
      `)
      .gte("fecha_hora_cita", start)
      .lte("fecha_hora_cita", end)
      .order("fecha_hora_cita");

    const rows = (data ?? []) as unknown as CitaCalendario[];
    setEvents(rows.map((c) => ({
      id:        c.id,
      title:     `${c.servicio?.nombre ?? "—"} · ${c.paciente?.nombre_completo ?? "—"}`,
      start:     c.fecha_hora_cita,
      end:       c.fecha_hora_fin,
      backgroundColor: COLOR_BY_ESTADO[c.estado_sync] ?? "#9ca3af",
      borderColor:     COLOR_BY_ESTADO[c.estado_sync] ?? "#9ca3af",
      extendedProps: {
        doctor:    c.doctor?.nombre,
        ubicacion: c.ubicacion?.nombre,
        estado:    c.estado_sync,
      },
    })));
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-calendario-citas")
      .on("postgres_changes",
          { event: "*", schema: "public", table: "citas" },
          () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("title")}</h1>
      </header>

      <div className="rounded-2xl bg-white p-4 border border-gray-200">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left:   "prev,next today",
            center: "title",
            right:  "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          locale="es"
          events={events}
          eventClick={(arg) => setSelected(arg.event.id)}
          datesSet={() => { void load(); }}
          height="auto"
        />
      </div>

      {selected && (
        <AdminCitaDetalleModal
          citaId={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); void load(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: `AdminCitaDetalleModal.tsx`**

Modal con info de la cita + botones según estado:
- Si `pendiente*`: Confirmar / Rechazar
- Si `confirmado`: Cancelar
- Si `rechazado/cancelado/completado`: solo info

Acciones llaman a `/api/admin/citas/[id]/confirmar`, `rechazar` (con motivo), `cancelar`.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";

interface CitaDetalle {
  id: string;
  fecha_hora_cita: string;
  estado_sync: string;
  motivo_cita: string | null;
  para_titular: boolean;
  paciente_nombre: string | null;
  paciente: { nombre_completo: string | null; telefono: string | null } | null;
  doctor: { nombre: string } | null;
  servicio: { nombre: string } | null;
  ubicacion: { nombre: string } | null;
}

export default function AdminCitaDetalleModal({
  citaId, onClose, onChanged,
}: { citaId: string; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("Dashboard.admin.citas.calendario.modal");
  const tErr = useTranslations("Errors.citas");
  const [cita, setCita]     = useState<CitaDetalle | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy]     = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/admin/citas/${citaId}`);
      const j = await res.json() as { cita?: CitaDetalle };
      setCita(j.cita ?? null);
    })();
  }, [citaId]);

  async function action(path: string, body?: object) {
    setBusy(true);
    const res = await fetch(`/api/admin/citas/${citaId}/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (res.ok) { toast.success(t(`${path}_ok`)); onChanged(); return; }
    const j = await res.json().catch(() => ({})) as { error?: string };
    toast.error(j.error ? tErr(j.error.toLowerCase()) : tErr("unknown"));
  }

  if (!cita) return null;
  const isPending = cita.estado_sync.startsWith("pendiente");
  const isConfirmado = cita.estado_sync === "confirmado";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-poppins font-bold">{t("title")}</h2>
          <button onClick={onClose} aria-label="cerrar" className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <dl className="text-sm space-y-1">
          <div><dt className="text-neutral">{t("paciente")}:</dt> <dd>{cita.para_titular ? cita.paciente?.nombre_completo : cita.paciente_nombre}</dd></div>
          <div><dt className="text-neutral">{t("doctor")}:</dt> <dd>{cita.doctor?.nombre}</dd></div>
          <div><dt className="text-neutral">{t("servicio")}:</dt> <dd>{cita.servicio?.nombre}</dd></div>
          <div><dt className="text-neutral">{t("ubicacion")}:</dt> <dd>{cita.ubicacion?.nombre}</dd></div>
          <div><dt className="text-neutral">{t("fecha")}:</dt> <dd>{new Date(cita.fecha_hora_cita).toLocaleString("es-NI", { timeZone: "America/Managua" })}</dd></div>
          {cita.motivo_cita && (
            <div><dt className="text-neutral">{t("motivo")}:</dt> <dd>{cita.motivo_cita}</dd></div>
          )}
        </dl>

        {(isPending || isConfirmado) && (
          <div className="pt-2 space-y-2 border-t border-gray-100">
            {isPending && (
              <>
                <button disabled={busy} onClick={() => action("confirmar")} className="w-full px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                  {t("confirmar")}
                </button>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={t("motivo_rechazo")}
                  className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2"
                  rows={2}
                />
                <button disabled={busy} onClick={() => action("rechazar", { motivo })} className="w-full px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                  {t("rechazar")}
                </button>
              </>
            )}
            {isConfirmado && (
              <button disabled={busy} onClick={() => action("cancelar", { motivo: t("cancelado_por_admin") })} className="w-full px-4 py-2 rounded-xl border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50">
                {t("cancelar")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Endpoint `GET /api/admin/citas/[id]` para el detalle del modal**

Si no existe, crear:

```ts
// app/api/admin/citas/[id]/route.ts (si no existe ya)
export async function GET(
  _req: NextRequest, ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  // assertAdmin
  const { data } = await supabase.from("citas").select(`
    id, fecha_hora_cita, estado_sync, motivo_cita, para_titular, paciente_nombre,
    paciente:users!paciente_id(nombre_completo, telefono),
    doctor:doctores(nombre), servicio:servicios(nombre), ubicacion:ubicaciones(nombre)
  `).eq("id", id).single();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ cita: data });
}
```

(Si ya existe, asegurarse que devuelva los joins necesarios.)

- [ ] **Step 5: Claves i18n bajo `Dashboard.admin.citas.calendario.*`**

```json
"calendario": {
  "title": "Calendario de citas",
  "modal": {
    "title": "Detalle de la cita",
    "paciente": "Paciente",
    "doctor": "Doctor",
    "servicio": "Servicio",
    "ubicacion": "Ubicación",
    "fecha": "Fecha",
    "motivo": "Motivo",
    "confirmar": "Confirmar cita",
    "rechazar": "Rechazar cita",
    "cancelar": "Cancelar cita",
    "motivo_rechazo": "Motivo (opcional)",
    "cancelado_por_admin": "Cancelado por admin",
    "confirmar_ok": "Cita confirmada",
    "rechazar_ok": "Cita rechazada",
    "cancelar_ok": "Cita cancelada"
  }
}
```

(Y equivalentes en inglés.)

- [ ] **Step 6: Build + smoke test**

```bash
pnpm build && pnpm dev
# Ir a /<locale>/dashboard/admin/citas/calendario
# - Crear una cita desde el wizard de miembro en otra pestaña.
# - El calendario debería refrescarse vía Realtime y mostrar la nueva cita.
# - Click en la cita → modal con info + botones.
# - Confirmar → status cambia, color verde.
```

- [ ] **Step 7: Commit**

```bash
git add app/'[locale]'/'(dashboard)'/dashboard/admin/citas/calendario/ \
         components/dashboard/admin/AdminCalendarioCitas.tsx \
         components/dashboard/admin/AdminCitaDetalleModal.tsx \
         app/api/admin/citas/'[id]'/route.ts \
         messages/es.json messages/en.json
git commit -m "feat(citas/admin): add calendario view with FullCalendar and detail modal"
```

---

## Task 9: Actualizar Sidebar con nuevas entradas admin

**Files:**
- Modify: `components/dashboard/Sidebar.tsx`
- Modify: `messages/es.json`, `messages/en.json`

- [ ] **Step 1: Agregar items a `administrarItems` en el builder de admin**

Localizar en `Sidebar.tsx` el bloque `const administrarItems: NavItemConfig[] = [...]` para rol admin (línea ~100) y agregar:

```ts
import { MapPin, Stethoscope, UserRound, CalendarRange } from "lucide-react";

// Insertar entre los items existentes en el orden lógico:
const administrarItems: NavItemConfig[] = [
  { href: `${base}/admin/citas`,         label: t("nav.gestionarCitas"),       icon: CalendarCheck },
  { href: `${base}/admin/citas/calendario`, label: t("nav.calendarioCitas"),    icon: CalendarRange },
  { href: `${base}/admin/ubicaciones`,   label: t("nav.gestionarUbicaciones"), icon: MapPin },
  { href: `${base}/admin/servicios`,     label: t("nav.gestionarServicios"),   icon: Stethoscope },
  { href: `${base}/admin/doctores`,      label: t("nav.gestionarDoctores"),    icon: UserRound },
  // ... resto sin cambios
];
```

- [ ] **Step 2: Claves i18n `nav.*`**

`messages/es.json`:
```json
"nav": {
  "calendarioCitas":      "Calendario de citas",
  "gestionarUbicaciones": "Ubicaciones",
  "gestionarServicios":   "Servicios",
  "gestionarDoctores":    "Doctores"
}
```

`messages/en.json`: análogas en inglés.

- [ ] **Step 3: Build + smoke test**

```bash
pnpm build && pnpm dev
# Login como admin → sidebar muestra los 4 items nuevos
```

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/Sidebar.tsx messages/es.json messages/en.json
git commit -m "feat(citas/admin): add sidebar entries for ubicaciones/servicios/doctores/calendario"
```

---

## Task 10: Migración post-poblamiento — `doctores.ubicacion_id NOT NULL`

**Files:**
- Create: `supabase/migrations/20260522010000_doctores_ubicacion_required.sql`

Una vez que el admin pobló todos los doctores con su ubicación desde la UI de Task 7, aplicar esta migración. Si quedan doctores sin ubicación, fallará — eso es deliberado para forzar el limpiado.

- [ ] **Step 1: Crear el archivo**

```sql
-- Migración: hacer doctores.ubicacion_id NOT NULL ahora que el admin asignó
-- ubicación a todos los doctores existentes desde el dashboard.

BEGIN;

-- Defensa: si quedan doctores sin ubicación, fallar con un mensaje claro.
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.doctores WHERE ubicacion_id IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Hay % doctores sin ubicacion_id. Asignar desde el dashboard antes de aplicar esta migración.', v_count;
  END IF;
END;
$$;

ALTER TABLE public.doctores
  ALTER COLUMN ubicacion_id SET NOT NULL;

COMMIT;
```

- [ ] **Step 2: Aplicar (después de poblar)**

```bash
supabase db push
```

Si falla con el mensaje del `RAISE EXCEPTION`, ir al dashboard admin y asignar ubicación a los doctores listados antes de reintentar.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260522010000_doctores_ubicacion_required.sql
git commit -m "feat(citas): enforce doctores.ubicacion_id NOT NULL"
```

---

## Task 11: Verificación final + push

- [ ] **Step 1: Build + lint**

```bash
pnpm build && pnpm lint
```

- [ ] **Step 2: Smoke test completo end-to-end como admin**

1. Crear una ubicación nueva → aparece.
2. Crear un servicio nuevo → aparece.
3. Crear un doctor con la nueva ubicación → aparece.
4. Asignar 2 servicios al doctor → guarda.
5. Agregar bloque Lunes 8-12 → aparece en horarios.
6. Agregar excepción este viernes → aparece.
7. Loguearse como miembro y crear cita en la ubicación nueva con ese doctor.
8. Volver a admin → calendario muestra la cita en estado pendiente.
9. Click → confirmar → cambia a verde.

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Commit simbólico de cierre de fase**

```bash
git commit --allow-empty -m "chore(citas): close phase 4 — admin dashboard ready for fase 5"
git push
```

---

## Self-Review de Fase 4

- [ ] `pnpm add @fullcalendar/*` aplicado y `pnpm-lock.yaml` actualizado.
- [ ] CRUD completo de ubicaciones, servicios, doctores (info, servicios, horarios, excepciones).
- [ ] Endpoints admin con `assertAdmin` y `logAction`.
- [ ] Vista calendario con FullCalendar muestra todas las citas con color por estado.
- [ ] Modal de detalle permite confirmar/rechazar/cancelar.
- [ ] Suscripción Realtime refresca el calendario.
- [ ] Sidebar incluye los 4 items nuevos.
- [ ] `doctores.ubicacion_id` es `NOT NULL` después del poblamiento manual.
- [ ] Build + lint pasan.

## Limitaciones conocidas tras Fase 4

- Drag-and-drop de citas para reagendar no está implementado (FullCalendar lo
  soporta pero queda fuera del MVP).
- Notificaciones por WhatsApp/email + .ics + recordatorio 24h + campana in-app
  quedan para Fase 5.
- No hay filtros avanzados en la lista admin de doctores (búsqueda por nombre,
  multi-ubicación). Se puede agregar después si el volumen lo justifica.
