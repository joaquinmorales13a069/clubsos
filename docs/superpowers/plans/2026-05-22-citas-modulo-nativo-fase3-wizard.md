# Fase 3 — Wizard del miembro (Módulo nativo de citas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactorizar el wizard de reserva de citas y las vistas relacionadas para consumir los endpoints nuevos de Fase 2. Reemplazar la dependencia de `ea_*_id` por `doctor_id`/`servicio_id`/`ubicacion_id`. Agregar suscripción Realtime en `PasoHorario` y aviso de concurrencia en `PasoConfirmar`. Mejorar el manejo de errores con códigos tipados.

**Architecture:** Cambios contenidos a `components/dashboard/miembro/citas/`. El estado del wizard (`WizardState`) cambia su forma (campos `ea*` salen, IDs UUID entran). Cada paso se actualiza para que su entrada y salida hablen el nuevo schema. `PasoHorario` se suscribe a Supabase Realtime para refrescar la grilla cuando otros usuarios reservan o cancelan. `PasoConfirmar` agrega un texto i18n de aviso y maneja `SLOT_TAKEN` redirigiendo al paso de horario con grid refrescado.

**Tech Stack:** React 19 client components, `next-intl`, `@supabase/supabase-js` (browser client), `sonner` para toasts. Sin nuevos paquetes.

**Depende de:** Fase 2 completa (endpoints `/api/citas/*` listos).

---

## File Structure

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `components/dashboard/miembro/citas/types.ts` | `WizardState`: quitar `eaServiceId`, `eaProviderId`, `categoriaId`. Agregar `ubicacionId`, `ubicacionId` y dejar `servicioId`/`doctorId` que ya existen. Actualizar `CitaRow` y `WizardUserProfile`. |
| `.../steps/PasoUbicacion.tsx` | Reemplazar lista hardcodeada por query a `ubicaciones`. |
| `.../steps/PasoServicio.tsx` | Filtrar por ubicación (join con `doctor_servicios` + `doctores`). Quitar referencias a `ea_*`. |
| `.../steps/PasoDoctor.tsx` | Filtrar doctores por `ubicacion_id` + `doctor_servicios.servicio_id`. |
| `.../steps/PasoFecha.tsx` | Llamar `GET /api/citas/dias-disponibles` para pintar disponibilidad por día. |
| `.../steps/PasoHorario.tsx` | Llamar `GET /api/citas/disponibilidad`, mostrar grid completo (libres + ocupados), suscribirse a Realtime. |
| `.../steps/PasoConfirmar.tsx` | Body del POST con campos nuevos. Texto de aviso de concurrencia. Manejo de errores tipados (`SLOT_TAKEN` → back a horario). |
| `.../MisCitas.tsx` | Joins por `doctor_id`/`servicio_id`/`ubicacion_id`. |
| `.../CitaCard.tsx` | Idem joins. |
| `components/dashboard/miembro/ProximaCitaCard.tsx` | Idem joins. |
| `app/[locale]/(dashboard)/dashboard/citas/actions.ts` | Actualizar si hay referencias `ea_*`. |
| `app/[locale]/(dashboard)/dashboard/citas/page.tsx` | Idem. |
| `messages/es.json` y `messages/en.json` | Agregar claves `Dashboard.miembro.citas.wizard.confirmar.aviso_concurrencia` y todas las de `Errors.citas.*`. |

### Archivos a actualizar (componentes empresa que comparten vistas)

| Archivo | Cambio |
|---------|--------|
| `components/dashboard/empresa/EmpresaCitasRegistro.tsx` | Quitar refs `ea_*`, usar joins por FK nuevas. |
| `components/dashboard/empresa/DetalleModal.tsx` | Idem. |
| `components/dashboard/empresa/EmpresaInicio.tsx` | Idem. |
| `components/dashboard/empresa/EmpresaInicioCitasPorServicio.tsx` | Idem. |
| `components/dashboard/admin/AdminInicio.tsx` | Idem. |

(El refactor mayor del admin queda para Fase 4; aquí solo se hace lo mínimo para que el build siga pasando.)

---

## Task 1: Refactor de `types.ts`

**Files:**
- Modify: `components/dashboard/miembro/citas/types.ts`

- [ ] **Step 1: Reemplazar el contenido del archivo**

```ts
/** Shared types for the appointment scheduling wizard */

export type WizardStep =
  | "ubicacion"
  | "servicio"
  | "doctor"
  | "fecha"
  | "horario"
  | "paciente"
  | "pago"
  | "transferencia"
  | "confirmar";

export interface WizardState {
  step: WizardStep;
  // Step 1 — ubicación
  ubicacionId:      string | null;
  ubicacionNombre:  string;
  // Step 2 — servicio
  servicioId:       string | null;
  servicioNombre:   string;
  servicioDuracion: number;  // duración total estimada en minutos (informativa)
  // Step 3 — doctor
  doctorId:         string | null;
  doctorNombre:     string;
  // Step 4 — fecha (YYYY-MM-DD)
  fecha:            string | null;
  // Step 5 — horario (ISO UTC del slot inicial elegido)
  fechaHoraCita:    string | null;
  // Step 6 — paciente
  paraTitular:      boolean;
  pacienteNombre:   string;
  pacienteTelefono: string;
  pacienteCorreo:   string;
  pacienteCedula:   string;
  // Contract coverage (resolved in PasoServicio)
  contrato_servicio_id: string | null;
  cuota_disponible:     number | null;
  requires_payment:     boolean;
  // Payment method (resolved in PasoPago)
  metodo_pago: "link_pago" | "transferencia" | "pago_clinica" | null;
  monto:       number | null;
  // Created cita (set after confirmar succeeds)
  cita_id: string | null;
}

export const WIZARD_STEPS_BASE: WizardStep[] = [
  "ubicacion", "servicio", "doctor", "fecha", "horario", "paciente", "confirmar",
];

export const WIZARD_STEPS_WITH_PAGO: WizardStep[] = [
  "ubicacion", "servicio", "doctor", "fecha", "horario", "paciente", "pago", "confirmar",
];

export const WIZARD_STEPS = WIZARD_STEPS_BASE;

export const INITIAL_WIZARD: WizardState = {
  step:                 "ubicacion",
  ubicacionId:          null,
  ubicacionNombre:      "",
  servicioId:           null,
  servicioNombre:       "",
  servicioDuracion:     30,
  doctorId:             null,
  doctorNombre:         "",
  fecha:                null,
  fechaHoraCita:        null,
  paraTitular:          true,
  pacienteNombre:       "",
  pacienteTelefono:     "",
  pacienteCorreo:       "",
  pacienteCedula:       "",
  contrato_servicio_id: null,
  cuota_disponible:     null,
  requires_payment:     false,
  metodo_pago:          null,
  monto:                null,
  cita_id:              null,
};

export type CitaEstado =
  | "pendiente"
  | "pendiente_empresa"
  | "pendiente_pago"
  | "pendiente_admin"
  | "confirmado"
  | "completado"
  | "cancelado"
  | "rechazado";

export interface CitaRow {
  id:                string;
  fecha_hora_cita:   string;
  estado_sync:       CitaEstado;
  servicio_asociado: string | null;
  paciente_nombre:   string | null;
  para_titular:      boolean;
}

export interface WizardUserProfile {
  id:                  string;
  rol:                 string;
  empresa_id:          string | null;
  titular_id:          string | null;
  nombre_completo:     string | null;
  telefono:            string | null;
  documento_identidad: string | null;
}
```

- [ ] **Step 2: Build (esperar errores en otros archivos)**

```bash
pnpm build
```

Esperar muchos errores TS en los archivos que usaban `eaServiceId`, `eaProviderId`, `categoriaId`, etc. Estos se resuelven en los siguientes tasks.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/miembro/citas/types.ts
git commit -m "refactor(citas): update WizardState/CitaRow to use new ID fields"
```

---

## Task 2: Refactor de `PasoUbicacion.tsx`

**Files:**
- Modify: `components/dashboard/miembro/citas/steps/PasoUbicacion.tsx`

- [ ] **Step 1: Reemplazar el contenido**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { WizardState } from "../types";

interface UbicacionRow {
  id:        string;
  nombre:    string;
  direccion: string | null;
}

interface PasoUbicacionProps {
  onSelect: (patch: Partial<WizardState>) => void;
}

export default function PasoUbicacion({ onSelect }: PasoUbicacionProps) {
  const t = useTranslations("Dashboard.miembro.citas.wizard.ubicacion");
  const [ubicaciones, setUbicaciones] = useState<UbicacionRow[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("ubicaciones")
      .select("id, nombre, direccion")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        setUbicaciones(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{t("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-neutral">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-roboto">{t("loading")}</span>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ubicaciones.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onSelect({ ubicacionId: u.id, ubicacionNombre: u.nombre })}
              className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left
                         shadow-sm transition-all hover:border-secondary/40 hover:shadow-md cursor-pointer"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="font-poppins font-semibold text-gray-900">{u.nombre}</p>
                {u.direccion && (
                  <p className="mt-0.5 text-sm font-roboto text-neutral">{u.direccion}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Agregar clave i18n `loading` si no existe**

Editar `messages/es.json` (sección `Dashboard.miembro.citas.wizard.ubicacion`):
```json
"loading": "Cargando ubicaciones..."
```

Editar `messages/en.json`:
```json
"loading": "Loading locations..."
```

(Si las claves `managua`, `leon`, `managuaDesc`, `leonDesc` ya no se usan en ningún otro lado, eliminarlas. Verificar con `grep -rn "managuaDesc\|leonDesc" messages/ --include="*.json"`.)

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/miembro/citas/steps/PasoUbicacion.tsx messages/es.json messages/en.json
git commit -m "refactor(citas): PasoUbicacion fetches ubicaciones from DB instead of hardcoded list"
```

---

## Task 3: Refactor de `PasoServicio.tsx`

**Files:**
- Modify: `components/dashboard/miembro/citas/steps/PasoServicio.tsx`

- [ ] **Step 1: Reemplazar el contenido**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Stethoscope, Loader2, Clock, DollarSign } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { WizardState } from "../types";

type ContratoServicioRow = { id: string };

interface Servicio {
  id:           string;
  nombre:       string;
  duracion:     number | null;
  precio:       number | null;
  descripcion:  string | null;
  slot_duracion: number;
}

interface PasoServicioProps {
  ubicacionId:  string;
  empresaId:    string | null;
  titularRefId: string;
  onSelect: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

async function checkCoverage(
  servicioId: string,
  empresaId: string,
  titularRefId: string,
): Promise<{ contrato_servicio_id: string | null; cuota_disponible: number | null }> {
  const supabase = createClient();
  const { data: cs } = await supabase
    .from("contrato_servicios")
    .select("id, contrato:contratos!inner(empresa_id, activo)")
    .eq("servicio_id", servicioId)
    .eq("contrato.empresa_id", empresaId)
    .eq("contrato.activo", true)
    .limit(1)
    .single();

  if (!cs) return { contrato_servicio_id: null, cuota_disponible: null };

  const csId = (cs as unknown as ContratoServicioRow).id;

  const { data: quota } = await supabase.rpc("check_cuota_disponible", {
    p_contrato_servicio_id: csId,
    p_titular_ref_id: titularRefId,
  });

  return {
    contrato_servicio_id: csId,
    cuota_disponible: typeof quota === "number" ? quota : null,
  };
}

export default function PasoServicio({
  ubicacionId, empresaId, titularRefId, onSelect, onBack,
}: PasoServicioProps) {
  const t  = useTranslations("Dashboard.miembro.citas.wizard");
  const ts = useTranslations("Dashboard.miembro.citas.wizard.servicio");
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading]     = useState(true);
  const [checking, setChecking]   = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // Servicios activos que tienen al menos un doctor activo en la ubicación.
    supabase
      .from("servicios")
      .select(`
        id, nombre, duracion, precio, descripcion, slot_duracion,
        doctor_servicios!inner(
          doctor:doctores!inner(id, activo, ubicacion_id)
        )
      `)
      .eq("activo", true)
      .eq("doctor_servicios.doctor.activo", true)
      .eq("doctor_servicios.doctor.ubicacion_id", ubicacionId)
      .order("nombre")
      .then(({ data }) => {
        // Deduplicar por servicio.id (puede repetirse si hay varios doctores)
        const seen = new Set<string>();
        const unique: Servicio[] = [];
        for (const row of (data ?? []) as unknown as Servicio[]) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            unique.push(row);
          }
        }
        setServicios(unique);
        setLoading(false);
      });
  }, [ubicacionId]);

  async function handleSelect(s: Servicio) {
    setChecking(s.id);
    let contrato_servicio_id: string | null = null;
    let cuota_disponible: number | null = null;
    let requires_payment = true;

    if (empresaId) {
      const result = await checkCoverage(s.id, empresaId, titularRefId);
      contrato_servicio_id = result.contrato_servicio_id;
      cuota_disponible     = result.cuota_disponible;
      requires_payment     = !contrato_servicio_id || cuota_disponible === null || cuota_disponible <= 0;
    }

    onSelect({
      servicioId:           s.id,
      servicioNombre:       s.nombre,
      servicioDuracion:     s.duracion ?? 30,
      contrato_servicio_id,
      cuota_disponible,
      requires_payment,
    });
    setChecking(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{ts("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{ts("subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-neutral">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-roboto">{ts("loading")}</span>
        </div>
      ) : servicios.length === 0 ? (
        <div className="text-center py-10">
          <Stethoscope className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-sm font-roboto text-gray-500">{ts("noServices")}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {servicios.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={checking !== null}
              onClick={() => handleSelect(s)}
              className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left
                         shadow-sm transition-all hover:border-secondary/40 hover:shadow-md
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-poppins font-semibold text-gray-900">{s.nombre}</p>
                {s.descripcion && (
                  <p className="mt-0.5 text-xs font-roboto text-neutral line-clamp-2">{s.descripcion}</p>
                )}
                <div className="flex gap-3 mt-1.5">
                  {s.duracion && (
                    <span className="flex items-center gap-1 text-xs text-neutral">
                      <Clock className="w-3 h-3" /> {s.duracion} {ts("duration")}
                    </span>
                  )}
                  {s.precio != null && (
                    <span className="flex items-center gap-1 text-xs text-neutral">
                      <DollarSign className="w-3 h-3" /> {ts("price")}{s.precio.toLocaleString()}
                    </span>
                  )}
                </div>
                {checking === s.id && (
                  <div className="flex items-center gap-1 text-xs text-neutral mt-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>{ts("checking_coverage")}</span>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onBack}
        className="text-sm font-roboto text-neutral hover:text-gray-700 transition-colors"
      >
        ← {t("backBtn")}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/miembro/citas/steps/PasoServicio.tsx
git commit -m "refactor(citas): PasoServicio filters servicios by ubicacion via doctor_servicios"
```

---

## Task 4: Refactor de `PasoDoctor.tsx`

**Files:**
- Modify: `components/dashboard/miembro/citas/steps/PasoDoctor.tsx`

- [ ] **Step 1: Leer el archivo actual y mapear los cambios necesarios**

Inspeccionar el archivo para entender props y queries actuales. Cambios principales:

- Props nuevas: `ubicacionId: string`, `servicioId: string`.
- Quitar `eaServiceId: number`.
- Query nueva:
  ```ts
  supabase
    .from("doctores")
    .select(`
      id, nombre, correo,
      doctor_servicios!inner(servicio_id)
    `)
    .eq("activo", true)
    .eq("ubicacion_id", ubicacionId)
    .eq("doctor_servicios.servicio_id", servicioId)
    .order("nombre");
  ```
- `onSelect` ahora pasa `{ doctorId: d.id, doctorNombre: d.nombre }` en vez de `eaProviderId`.

- [ ] **Step 2: Reemplazar la lógica de query y handlers según lo de arriba**

(El JSX puede quedar igual; cambian solo las queries y los nombres de propiedades del `onSelect`.)

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/miembro/citas/steps/PasoDoctor.tsx
git commit -m "refactor(citas): PasoDoctor filters by ubicacion_id + doctor_servicios.servicio_id"
```

---

## Task 5: Refactor de `PasoFecha.tsx`

**Files:**
- Modify: `components/dashboard/miembro/citas/steps/PasoFecha.tsx`

Cambios principales:
- Props nuevas: `doctorId: string`.
- Quitar referencias a `eaProviderId`.
- Al montarse / cambiar de mes, llamar `GET /api/citas/dias-disponibles?doctor_id=<id>&fecha_inicio=<YYYY-MM-01>&fecha_fin=<YYYY-MM-último>` y guardar un `Set<string>` de fechas con `tiene_slots = true`.
- Deshabilitar los días que no estén en el set, además de los pasados.

- [ ] **Step 1: Leer el archivo, mapear los cambios y reemplazarlo**

Patrón de fetch:
```tsx
useEffect(() => {
  const [year, month] = visibleMonth.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last  = new Date(year, month, 0).getDate();
  const end   = `${year}-${String(month).padStart(2, "0")}-${last}`;

  fetch(`/api/citas/dias-disponibles?doctor_id=${doctorId}&fecha_inicio=${start}&fecha_fin=${end}`)
    .then((r) => r.json())
    .then((j: { dias?: { fecha: string; tiene_slots: boolean }[] }) => {
      const set = new Set<string>(
        (j.dias ?? []).filter((d) => d.tiene_slots).map((d) => d.fecha),
      );
      setDiasDisponibles(set);
    })
    .catch(() => setDiasDisponibles(new Set()));
}, [doctorId, visibleMonth]);
```

Usar `diasDisponibles.has(fechaISO)` para habilitar/deshabilitar cada día del calendario.

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/miembro/citas/steps/PasoFecha.tsx
git commit -m "refactor(citas): PasoFecha disables days without slots via /api/citas/dias-disponibles"
```

---

## Task 6: Refactor de `PasoHorario.tsx` con Realtime

**Files:**
- Modify: `components/dashboard/miembro/citas/steps/PasoHorario.tsx`

Este es el cambio más rico. Replace `fetch('/api/ea/disponibilidad...')` por `/api/citas/disponibilidad`, mostrar grid completo (libres y ocupados) y suscribirse a Realtime de la tabla `citas` filtrado por `doctor_id`.

- [ ] **Step 1: Reemplazar el contenido del archivo**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, Loader2, CalendarX } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import type { WizardState } from "../types";

interface Slot {
  hora_inicio: string;  // ISO UTC
  hora_fin:    string;  // ISO UTC
  disponible:  boolean;
}

interface PasoHorarioProps {
  doctorId:   string;
  servicioId: string;
  fecha:      string;   // YYYY-MM-DD
  onSelect: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

function to12hLocal(isoUtc: string): string {
  const d = new Date(isoUtc);
  const niOffsetMs = -6 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + niOffsetMs);
  let h = local.getUTCHours();
  const m = String(local.getUTCMinutes()).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m} ${period}`;
}

export default function PasoHorario({
  doctorId, servicioId, fecha, onSelect, onBack,
}: PasoHorarioProps) {
  const t  = useTranslations("Dashboard.miembro.citas.wizard");
  const th = useTranslations("Dashboard.miembro.citas.wizard.horario");
  const [slots, setSlots]       = useState<Slot[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError]       = useState(false);

  const fetchSlots = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(
        `/api/citas/disponibilidad?doctor_id=${doctorId}&servicio_id=${servicioId}&fecha=${fecha}`,
      );
      if (!res.ok) throw new Error("fetch failed");
      const j = await res.json() as { slots?: Slot[] };
      setSlots(j.slots ?? []);
    } catch {
      setError(true);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [doctorId, servicioId, fecha]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    setSelected(null);
    fetchSlots();
  }, [fetchSlots]);

  // Realtime subscription: refresh slots when any cita changes for this doctor
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`citas-doctor-${doctorId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "citas", filter: `doctor_id=eq.${doctorId}` },
        () => { void fetchSlots(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [doctorId, fetchSlots]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{th("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{th("subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-neutral">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-roboto">{th("loading")}</span>
        </div>
      ) : error || slots.length === 0 ? (
        <div className="flex flex-col items-center text-center py-10 space-y-2">
          <CalendarX className="w-10 h-10 text-gray-200" />
          <p className="text-sm font-roboto font-medium text-gray-500">{th("noSlots")}</p>
          <p className="text-xs font-roboto text-neutral">{th("noSlotsSub")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.map((slot) => {
            const isSelected = selected === slot.hora_inicio;
            const isAvailable = slot.disponible;
            return (
              <button
                key={slot.hora_inicio}
                type="button"
                disabled={!isAvailable}
                onClick={() => isAvailable && setSelected(slot.hora_inicio)}
                aria-label={`${to12hLocal(slot.hora_inicio)}${isAvailable ? "" : " (no disponible)"}`}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-roboto font-medium transition-all",
                  isSelected && "bg-primary border-primary text-white shadow-md shadow-primary/20",
                  !isSelected && isAvailable && "bg-white border-gray-200 text-gray-700 hover:border-secondary/50 cursor-pointer",
                  !isAvailable && "bg-gray-100 border-gray-100 text-gray-400 line-through cursor-not-allowed",
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                {to12hLocal(slot.hora_inicio)}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-roboto text-neutral hover:text-gray-700 transition-colors"
        >
          ← {t("backBtn")}
        </button>
        {slots.length > 0 && (
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onSelect({ fechaHoraCita: selected })}
            className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold font-roboto
                       hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("continueBtn")} →
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/miembro/citas/steps/PasoHorario.tsx
git commit -m "refactor(citas): PasoHorario uses new /api/citas/disponibilidad + Realtime subscription"
```

---

## Task 7: Refactor de `PasoConfirmar.tsx` con aviso de concurrencia

**Files:**
- Modify: `components/dashboard/miembro/citas/steps/PasoConfirmar.tsx`

Cambios:
- Body del POST con campos nuevos.
- Re-verificación de disponibilidad antes de submit (Capa 2 del spec).
- Aviso de concurrencia visible.
- Manejo de errores tipados.

- [ ] **Step 1: Leer el archivo actual para preservar la estructura JSX**

Run:
```bash
wc -l components/dashboard/miembro/citas/steps/PasoConfirmar.tsx
```

(Si es largo, conservar las secciones de UI/JSX y solo refactorizar la sección de submit y agregar el bloque de aviso.)

- [ ] **Step 2: Reemplazar el handler de submit y agregar el bloque de aviso**

```tsx
// ── Bloque de aviso ── (insertar cerca del botón "Confirmar")
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { WizardState } from "../types";

// Dentro del componente:
const tConfirmar = useTranslations("Dashboard.miembro.citas.wizard.confirmar");
const tErrors    = useTranslations("Errors.citas");

// JSX antes del botón Confirmar:
<div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">
  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
  <p className="font-roboto text-amber-900">
    <strong>{tConfirmar("aviso_concurrencia_titulo")}</strong>{" "}
    {tConfirmar("aviso_concurrencia_body")}
  </p>
</div>

// Handler de submit:
async function handleSubmit() {
  if (!state.doctorId || !state.servicioId || !state.fechaHoraCita) return;
  setSubmitting(true);

  // Re-check disponibilidad como capa 2 de defensa
  try {
    const fechaYmd = state.fechaHoraCita.split("T")[0];
    const checkRes = await fetch(
      `/api/citas/disponibilidad?doctor_id=${state.doctorId}&servicio_id=${state.servicioId}&fecha=${fechaYmd}`,
    );
    const checkJson = await checkRes.json() as { slots?: { hora_inicio: string; disponible: boolean }[] };
    const slot = (checkJson.slots ?? []).find((s) => s.hora_inicio === state.fechaHoraCita);
    if (!slot || !slot.disponible) {
      toast.error(tErrors("slot_taken"));
      onPatch({ step: "horario", fechaHoraCita: null });
      setSubmitting(false);
      return;
    }
  } catch {
    // Network error en el check pre-submit: dejamos pasar al POST y que el atomic insert decida.
  }

  const res = await fetch("/api/citas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doctor_id:            state.doctorId,
      servicio_id:          state.servicioId,
      fecha_hora_cita:      state.fechaHoraCita,
      para_titular:         state.paraTitular,
      motivo_cita:          state.motivoCita ?? null,
      servicio_asociado:    state.servicioNombre,
      paciente_nombre:      state.paraTitular ? null : state.pacienteNombre || null,
      paciente_telefono:    state.paraTitular ? null : state.pacienteTelefono || null,
      paciente_correo:      state.paraTitular ? null : state.pacienteCorreo || null,
      paciente_cedula:      state.paraTitular ? null : state.pacienteCedula || null,
      contrato_servicio_id: state.contrato_servicio_id,
      metodo_pago:          state.metodo_pago,
      monto:                state.monto,
    }),
  });

  const j = await res.json().catch(() => ({})) as {
    ok?: boolean; cita?: { id: string; estado_sync: string };
    error?: string; i18nKey?: string;
  };

  if (!res.ok || !j.ok) {
    const code = j.error;
    if (code === "SLOT_TAKEN") {
      toast.error(tErrors("slot_taken"));
      onPatch({ step: "horario", fechaHoraCita: null });
    } else if (code === "QUOTA_EXCEEDED") {
      toast.error(tErrors("quota_exceeded"));
    } else if (j.i18nKey) {
      // Mensaje genérico desde i18nKey
      try {
        const last = j.i18nKey.split(".").pop() ?? "unknown";
        toast.error(tErrors(last));
      } catch {
        toast.error(tErrors("unknown"));
      }
    } else {
      toast.error(tErrors("unknown"));
    }
    setSubmitting(false);
    return;
  }

  toast.success(tConfirmar("success"));
  onPatch({ cita_id: j.cita?.id ?? null });
  // Continúa según el estado retornado (igual que antes)
  // ...
}
```

(Adaptar nombres `state` / `onPatch` / `setSubmitting` a los reales del componente actual.)

- [ ] **Step 3: Agregar claves i18n nuevas**

Editar `messages/es.json`:
```json
{
  "Dashboard": {
    "miembro": {
      "citas": {
        "wizard": {
          "confirmar": {
            "aviso_concurrencia_titulo": "Este horario aún no está reservado.",
            "aviso_concurrencia_body": "Otros usuarios pueden tomarlo en cualquier momento — confirma tu cita ahora para asegurarla.",
            "success": "Cita creada exitosamente"
          }
        }
      }
    }
  },
  "Errors": {
    "citas": {
      "slot_taken": "Ese horario ya fue reservado. Por favor elige otro.",
      "slot_out_of_hours": "Ese horario no está dentro del horario de atención del doctor.",
      "slot_in_exception": "El doctor no atiende ese día.",
      "quota_exceeded": "Has alcanzado el límite de citas de este servicio.",
      "invalid_doctor_service": "Este doctor no ofrece el servicio seleccionado.",
      "cancel_too_late": "Las citas solo se pueden cancelar con suficiente anticipación.",
      "invalid_state_transition": "No se puede realizar esta acción en el estado actual de la cita.",
      "cita_not_found": "Cita no encontrada.",
      "doctor_not_found": "Doctor no encontrado.",
      "servicio_not_found": "Servicio no encontrado.",
      "contrato_or_metodo_pago_required": "Debes elegir un método de pago.",
      "unauthorized": "Sesión no válida.",
      "forbidden": "No tienes permisos para esta acción.",
      "unknown": "Ocurrió un error inesperado. Por favor intenta de nuevo."
    }
  }
}
```

Editar `messages/en.json` con las traducciones equivalentes:
```json
{
  "Dashboard": {
    "miembro": {
      "citas": {
        "wizard": {
          "confirmar": {
            "aviso_concurrencia_titulo": "This time slot is not yet reserved.",
            "aviso_concurrencia_body": "Other users can take it at any moment — confirm your appointment now to secure it.",
            "success": "Appointment created successfully"
          }
        }
      }
    }
  },
  "Errors": {
    "citas": {
      "slot_taken": "That time slot was just booked. Please pick another one.",
      "slot_out_of_hours": "That time is outside the doctor's working hours.",
      "slot_in_exception": "The doctor is not available on that day.",
      "quota_exceeded": "You've reached the appointment limit for this service.",
      "invalid_doctor_service": "This doctor does not offer the selected service.",
      "cancel_too_late": "Appointments can only be cancelled with enough notice.",
      "invalid_state_transition": "This action cannot be performed in the current appointment state.",
      "cita_not_found": "Appointment not found.",
      "doctor_not_found": "Doctor not found.",
      "servicio_not_found": "Service not found.",
      "contrato_or_metodo_pago_required": "You must choose a payment method.",
      "unauthorized": "Invalid session.",
      "forbidden": "You don't have permission for this action.",
      "unknown": "An unexpected error occurred. Please try again."
    }
  }
}
```

- [ ] **Step 4: Build**

```bash
pnpm build
```

Iterar hasta que pase.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/miembro/citas/steps/PasoConfirmar.tsx messages/es.json messages/en.json
git commit -m "feat(citas): PasoConfirmar adds concurrency notice + typed error handling on submit"
```

---

## Task 8: Refactor de `MisCitas.tsx`, `CitaCard.tsx`, `ProximaCitaCard.tsx`

**Files:**
- Modify: `components/dashboard/miembro/citas/MisCitas.tsx`
- Modify: `components/dashboard/miembro/citas/CitaCard.tsx`
- Modify: `components/dashboard/miembro/ProximaCitaCard.tsx`

Cambios:
- Quitar `ea_appointment_id` y cualquier `ea_*` de las queries y types.
- Joins por FKs nuevas:
  ```ts
  .select(`
    id, fecha_hora_cita, fecha_hora_fin, estado_sync, para_titular, paciente_nombre,
    doctor:doctores(nombre),
    servicio:servicios(nombre),
    ubicacion:ubicaciones(nombre, direccion)
  `)
  ```
- `CitaCard` puede mostrar la ubicación.

- [ ] **Step 1: Para cada archivo, aplicar el patrón**

Reemplazar las queries `.select(...)` para usar joins por FKs naturales y los types acordemente. Si la consulta especificaba `!citas_ea_service_id_fkey`, quitarlo; supabase-js inferirá el FK por nombre del campo.

- [ ] **Step 2: Build + lint**

```bash
pnpm build && pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/miembro/citas/MisCitas.tsx \
         components/dashboard/miembro/citas/CitaCard.tsx \
         components/dashboard/miembro/ProximaCitaCard.tsx
git commit -m "refactor(citas): MisCitas/CitaCard/ProximaCitaCard query by new FK fields"
```

---

## Task 9: Refactor de `actions.ts` y `page.tsx`

**Files:**
- Modify: `app/[locale]/(dashboard)/dashboard/citas/actions.ts`
- Modify: `app/[locale]/(dashboard)/dashboard/citas/page.tsx`

- [ ] **Step 1: Buscar referencias `ea_*`**

Run:
```bash
grep -n "ea_service_id\|ea_provider_id\|ea_appointment_id\|ea_customer_id\|categoriaId" \
  'app/[locale]/(dashboard)/dashboard/citas/actions.ts' \
  'app/[locale]/(dashboard)/dashboard/citas/page.tsx'
```

- [ ] **Step 2: Para cada referencia, reemplazar por el equivalente nuevo o eliminar**

- `ea_appointment_id` → quitar (ya no se usa)
- `ea_customer_id` → quitar
- `ea_service_id` / `ea_provider_id` → `servicio_id` / `doctor_id`
- `categoriaId` → `ubicacionId`

- [ ] **Step 3: Build**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add 'app/[locale]/(dashboard)/dashboard/citas/'
git commit -m "refactor(citas): update actions.ts and page.tsx to use new schema fields"
```

---

## Task 10: Refactor mínimo de componentes empresa/admin (para que el build pase)

**Files:**
- Modify: `components/dashboard/empresa/EmpresaCitasRegistro.tsx`
- Modify: `components/dashboard/empresa/DetalleModal.tsx`
- Modify: `components/dashboard/empresa/EmpresaInicio.tsx`
- Modify: `components/dashboard/empresa/EmpresaInicioCitasPorServicio.tsx`
- Modify: `components/dashboard/admin/AdminInicio.tsx`

El refactor completo del admin va en Fase 4. Aquí solo hacemos lo mínimo para que el build siga pasando.

- [ ] **Step 1: Para cada archivo, buscar `ea_*` y reemplazar joins/accesos**

Patrón:
- `ea_service_id` → `servicio_id`
- `ea_provider_id` → `doctor_id`
- `ea_appointment_id` → quitar (puede borrarse del display sin perder UX)
- Joins por FK explícitas: reemplazar `!citas_ea_service_id_fkey` por `!citas_servicio_id_fkey`.

- [ ] **Step 2: Build + lint**

```bash
pnpm build && pnpm lint
```

Iterar hasta que pase.

- [ ] **Step 3: Commit (granular por archivo)**

```bash
git add components/dashboard/empresa/<archivo>
git commit -m "refactor(citas): update <componente> queries to new FK fields"
```

---

## Task 11: Smoke test end-to-end del wizard

- [ ] **Step 1: Levantar el dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Crear una cita completa como miembro**

1. Login como miembro con empresa asignada.
2. Navegar a `/dashboard/citas/nueva` (o donde esté el wizard).
3. Paso 1: elegir ubicación → debería listar las del seed (Managua, León).
4. Paso 2: elegir servicio → solo aparecen los servicios ofrecidos en esa ubicación.
5. Paso 3: elegir doctor → solo doctores activos en esa ubicación que ofrecen ese servicio.
6. Paso 4: elegir fecha → días sin horario aparecen deshabilitados.
7. Paso 5: elegir horario → grid completo, ocupados en gris, libres clickeables.
8. Paso 6: confirmar paciente.
9. Paso 7 (si aplica): elegir pago.
10. Paso 8: confirmar → aparece el aviso de concurrencia, click confirmar, toast de éxito.

- [ ] **Step 3: Test de Realtime**

Abrir el mismo wizard en dos navegadores (o pestañas con sesiones distintas):
1. Ambos llegan al `PasoHorario` para el mismo doctor y fecha.
2. Usuario A reserva un slot.
3. Usuario B debería ver el slot pasar a "ocupado" sin recargar.

Si no funciona Realtime, verificar:
- ¿Está la tabla `citas` en `supabase_realtime` publication? (`SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime'`)
- ¿RLS permite SELECT al usuario autenticado?
- ¿La consola del navegador muestra el evento? (Supabase JS loguea conexión)

- [ ] **Step 4: Test de SLOT_TAKEN**

1. Reservar un slot como Usuario A.
2. Como Usuario B (que tenía el wizard cargado), intentar confirmar el mismo slot ignorando que ya cambió.
3. Esperar: toast rojo "Ese horario ya fue reservado" + auto-back al paso de horario con la grid refrescada.

- [ ] **Step 5: Commit simbólico de cierre de fase**

```bash
git commit --allow-empty -m "chore(citas): close phase 3 — wizard wired to native module"
git push
```

---

## Self-Review de Fase 3

- [ ] `WizardState` no contiene `ea*` ni `categoriaId`.
- [ ] Ningún componente bajo `components/dashboard/miembro/citas/` referencia `ea_*_id`.
- [ ] `PasoUbicacion` lista las ubicaciones desde la DB.
- [ ] `PasoServicio` filtra por ubicación correctamente.
- [ ] `PasoDoctor` filtra por `ubicacion_id` + `doctor_servicios.servicio_id`.
- [ ] `PasoFecha` deshabilita días sin horario.
- [ ] `PasoHorario` muestra todos los slots (libres y ocupados) y se suscribe a Realtime.
- [ ] `PasoConfirmar` muestra el aviso de concurrencia y maneja `SLOT_TAKEN`.
- [ ] `MisCitas`, `CitaCard`, `ProximaCitaCard` muestran los datos correctos.
- [ ] `pnpm build` y `pnpm lint` pasan.
- [ ] Smoke test end-to-end exitoso, incluyendo Realtime entre dos navegadores.

## Limitaciones conocidas tras Fase 3

- El admin todavía no tiene UI nueva para gestionar ubicaciones/servicios/doctores/
  horarios. Si un doctor no tiene `ubicacion_id` o no tiene horarios definidos, el
  wizard simplemente no lo listará. Documentar para el equipo.
- Notificaciones por WhatsApp/email al confirmar quedan para Fase 5.
- El botón "Agregar a calendario" en `CitaCard` no existe todavía (Fase 5).
