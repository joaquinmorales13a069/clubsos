# Módulo nativo de citas — diseño

**Fecha:** 2026-05-22
**Branch:** `feat/citas-modulo-nativo`
**Estado:** Diseño aprobado, pendiente plan de implementación

## Resumen

Reemplazar la integración con Easy! Appointments (EA) por un módulo nativo de citas en
Supabase. Resolver los duplicados y errores de sincronización moviendo la fuente de
verdad de la disponibilidad a Postgres, garantizando atomicidad con inserts
transaccionales, y entregando una experiencia en tiempo real con Supabase Realtime.
Añadir gestión completa de servicios, doctores, horarios y ubicaciones desde el
dashboard admin, e integración con calendarios externos vía `.ics` y enlaces directos.

## Motivación

El módulo actual sincroniza citas contra EA y arrastra varios bugs:

- **Duplicados:** dos usuarios pueden reservar el mismo slot porque EA solo conoce las
  citas `confirmado` (sincronizadas al aprobar). Las citas `pendiente` /
  `pendiente_admin` no bloquean el slot en EA.
- **Race conditions:** el índice único existente
  `citas_no_double_booking (ea_provider_id, ea_service_id, fecha_hora_cita)` mitiga
  parte del problema pero la fuente de verdad sigue siendo EA, no Supabase.
- **Sin tiempo real:** los clientes no se enteran si otro usuario tomó un slot mientras
  ellos navegan el wizard.
- **Administración fragmentada:** servicios, doctores, horarios y excepciones se
  gestionan en EA (UI externa, fuera del dashboard admin).
- **Sin sincronización con calendarios personales:** los usuarios no pueden agregar la
  cita a su Google/Apple/Outlook Calendar.

## Decisiones de diseño

- **EA queda fuera por completo.** Supabase es la única fuente de verdad. Datos
  existentes son de prueba → se borran antes de migrar.
- **Horario por doctor:** cada doctor tiene horario semanal recurrente
  (`horarios_doctores`) más excepciones puntuales (`excepciones_horario`).
- **Ubicación pertenece al doctor:** los servicios son globales; el doctor define la
  ubicación, y los servicios disponibles en una ubicación son los que tienen al menos
  un doctor activo allí.
- **Atomic insert + Realtime:** una RPC Postgres ejecuta el booking en transacción
  con índice único parcial. Realtime emite cambios a los clientes para UI en vivo.
- **Citas `pendiente_admin` bloquean el slot.** Una cita pendiente de aprobación
  ocupa el horario para evitar doble-aprobación manual.
- **Auto-confirmación condicional + override admin:** las citas se confirman
  automáticamente si el pago está OK (o no se requiere) y la empresa tiene
  `auto_confirmar_citas = true`. El admin global siempre puede aprobar/rechazar.
- **Calendarios externos:** `.ics` + enlaces a Google / Outlook / Apple. Sin OAuth.
- **Notificaciones desacopladas:** trigger inserta en `cita_eventos`, edge function
  procesa la cola y dispara WhatsApp + email + in-app + recordatorio 24h.
- **Email transaccional:** Resend.
- **Cron:** `pg_cron` v1.6.4 (verificada como habilitada en el proyecto).

## Arquitectura

### Modelo de datos

#### Tablas nuevas

##### `ubicaciones`

```
id              UUID PK
nombre          TEXT NOT NULL UNIQUE
direccion       TEXT
telefono        TEXT
zona_horaria    TEXT NOT NULL DEFAULT 'America/Managua'
activo          BOOLEAN NOT NULL DEFAULT TRUE
created_at, updated_at
```

##### `horarios_doctores`

Horario semanal recurrente por doctor. Múltiples filas por día permiten varios
bloques (ej. mañana + tarde).

```
id              UUID PK
doctor_id       UUID FK → doctores ON DELETE CASCADE
dia_semana      SMALLINT NOT NULL CHECK (0..6)   -- 0=domingo
hora_inicio     TIME NOT NULL
hora_fin        TIME NOT NULL
slot_duracion   SMALLINT NOT NULL DEFAULT 30
activo          BOOLEAN NOT NULL DEFAULT TRUE
created_at, updated_at
UNIQUE (doctor_id, dia_semana, hora_inicio)
CHECK (hora_fin > hora_inicio)
```

##### `excepciones_horario`

Bloqueos puntuales (vacaciones, feriados, ausencias). `doctor_id NULL` aplica a
todos los doctores (feriado general). `ubicacion_id NULL` aplica a todas las
ubicaciones.

```
id              UUID PK
doctor_id       UUID FK → doctores ON DELETE CASCADE NULL
ubicacion_id    UUID FK → ubicaciones ON DELETE CASCADE NULL
fecha_inicio    TIMESTAMPTZ NOT NULL
fecha_fin       TIMESTAMPTZ NOT NULL
motivo          TEXT
created_at
CHECK (fecha_fin > fecha_inicio)
```

##### `doctor_servicios`

Pivote many-to-many. Reemplaza el array `ea_servicios` de `doctores`.

```
doctor_id    UUID FK → doctores ON DELETE CASCADE
servicio_id  UUID FK → servicios ON DELETE CASCADE
PRIMARY KEY (doctor_id, servicio_id)
```

##### `cita_eventos`

Cola de eventos para procesamiento asíncrono de notificaciones.

```
id           UUID PK
cita_id      UUID FK → citas ON DELETE CASCADE
evento       TEXT NOT NULL   -- 'creada', 'confirmada', 'rechazada',
                             -- 'cancelada', 'recordatorio_24h'
payload      JSONB           -- snapshot de datos al momento del evento
procesado    BOOLEAN NOT NULL DEFAULT FALSE
procesado_at TIMESTAMPTZ
intentos     INT NOT NULL DEFAULT 0
ultimo_error TEXT
created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
INDEX (procesado, created_at) WHERE procesado = FALSE
```

##### `notificaciones`

Notificaciones in-app por usuario (campana en topbar).

```
id          UUID PK
user_id     UUID FK → users
tipo        TEXT
titulo      TEXT
mensaje     TEXT
link        TEXT            -- '/dashboard/citas/${id}'
leida       BOOLEAN DEFAULT FALSE
created_at  TIMESTAMPTZ DEFAULT NOW()
INDEX (user_id, leida, created_at DESC)
```

#### Cambios a tablas existentes

##### `doctores`

- `+ ubicacion_id UUID FK → ubicaciones NOT NULL`
- `- ea_provider_id`
- `- ea_servicios`

##### `servicios`

- `- ea_service_id`
- `- ea_category_id`
- `+ slot_duracion SMALLINT NOT NULL DEFAULT 30` — cuántos slots consume una cita
  del servicio.

##### `citas`

- `- ea_provider_id`, `- ea_service_id`, `- ea_appointment_id`, `- ea_customer_id`
- `+ doctor_id UUID FK → doctores NOT NULL`
- `+ servicio_id UUID FK → servicios NOT NULL`
- `+ ubicacion_id UUID FK → ubicaciones NOT NULL` (denormalizada para queries)
- `+ fecha_hora_fin TIMESTAMPTZ NOT NULL` — calculada por la RPC al insertar
- `+ confirmado_por UUID FK → users NULL`
- `+ confirmado_at TIMESTAMPTZ NULL`
- `+ rechazado_por UUID FK → users NULL`
- `+ rechazado_at TIMESTAMPTZ NULL`
- `+ motivo_rechazo TEXT NULL`
- `+ cancelado_por UUID FK → users NULL`
- `+ cancelado_at TIMESTAMPTZ NULL`
- `+ motivo_cancelacion TEXT NULL`

##### `users`

- `- ea_customer_id`

#### Índices críticos

- `UNIQUE INDEX citas_no_double_booking ON citas (doctor_id, fecha_hora_cita) WHERE estado_sync NOT IN ('cancelado','rechazado')`
  — reemplaza el actual.
- `INDEX (doctor_id, fecha_hora_cita)` — disponibilidad.
- `INDEX (ubicacion_id, fecha_hora_cita)` — calendario admin.
- `INDEX (paciente_id, fecha_hora_cita DESC)` — "Mis citas".

##### `configuracion_sistema`

- `+ ventana_cancelacion_horas SMALLINT NOT NULL DEFAULT 24` — horas mínimas de
  anticipación para que un paciente pueda cancelar su cita. Configurable por admin.

#### Limpieza de datos previa

Datos actuales son de prueba. Antes de aplicar el drop de columnas `ea_*`:

```sql
DELETE FROM citas;
-- doctores y servicios se conservan para preservar nombres/precios, pero los
-- campos ea_*_id se droppean y ubicacion_id se asigna manualmente desde el
-- dashboard admin después de la fase 1 (o por script si la lista es chica).
```

### API y RPCs

Las operaciones críticas viven en RPCs Postgres. Los route handlers Next.js son
wrappers delgados con auth + traducción de errores.

#### RPCs

**`obtener_slots_disponibles(p_doctor_id UUID, p_servicio_id UUID, p_fecha DATE) RETURNS TABLE(...)`**

Devuelve la grilla completa del día (libres y ocupados). Considera horario semanal,
excepciones y citas activas. Toma en cuenta `servicio.slot_duracion` para servicios
multi-slot.

**`obtener_dias_disponibles(p_doctor_id UUID, p_mes_inicio DATE, p_mes_fin DATE) RETURNS TABLE(fecha DATE, tiene_slots BOOLEAN)`**

Pinta el calendario en `PasoFecha` deshabilitando días sin horario o sin slots.

**`crear_cita_atomic(...) RETURNS UUID`** — la RPC crítica

Transacción con:

1. Validación: doctor ofrece el servicio, slot dentro del horario, no en excepción,
   cuota de contrato disponible.
2. Cálculo de `fecha_hora_fin = p_fecha_hora_cita + servicio.slot_duracion * intervalo`.
3. `pg_advisory_xact_lock` por `(doctor_id, fecha)` para serializar inserts del
   mismo doctor el mismo día (cubre servicios multi-slot).
4. Determinación del estado inicial (`pendiente` / `pendiente_admin` / `confirmado`).
5. `INSERT INTO citas` — si choca con otro request, el índice único parcial dispara
   `unique_violation` → la RPC captura y devuelve `SLOT_TAKEN`.

**`confirmar_cita(p_cita_id UUID)`** — admin. Estado → `confirmado`, registra
auditoría.

**`rechazar_cita(p_cita_id UUID, p_motivo TEXT)`** — admin. Estado → `rechazado`,
libera slot.

**`cancelar_cita(p_cita_id UUID, p_motivo TEXT)`** — paciente o admin. Valida
ventana de cancelación (configurable en `configuracion_sistema`).

#### Códigos de error tipados

| Código                | Significado                                            |
| --------------------- | ------------------------------------------------------ |
| `SLOT_TAKEN`          | Otro usuario tomó el slot mientras confirmabas         |
| `SLOT_OUT_OF_HOURS`   | Slot fuera del horario del doctor                      |
| `SLOT_IN_EXCEPTION`   | Cae en una excepción                                   |
| `QUOTA_EXCEEDED`      | Sin cuotas en el contrato                              |
| `INVALID_DOCTOR_SERVICE` | Doctor no ofrece ese servicio                       |
| `CANCEL_TOO_LATE`     | Cancelación fuera de la ventana configurada            |

#### Route handlers

```
POST   /api/citas                              → crear_cita_atomic
GET    /api/citas/disponibilidad               → obtener_slots_disponibles
GET    /api/citas/dias-disponibles             → obtener_dias_disponibles
POST   /api/admin/citas/[id]/confirmar         → confirmar_cita
POST   /api/admin/citas/[id]/rechazar          → rechazar_cita
POST   /api/citas/[id]/cancelar                → cancelar_cita
GET    /api/citas/[id]/ics                     → genera .ics on-demand (auth)
POST   /api/admin/ubicaciones                  → CRUD
POST   /api/admin/servicios                    → CRUD
POST   /api/admin/doctores                     → CRUD
POST   /api/admin/doctores/[id]/horarios       → CRUD horarios
POST   /api/admin/doctores/[id]/excepciones    → CRUD excepciones
POST   /api/admin/doctores/[id]/servicios      → asignación pivote
```

Eliminados: `app/api/ea/*` completo, `/api/admin/citas/[id]/aprobar` (renombrado a
`/confirmar`).

### Prevención de duplicados — tres capas

1. **UI en vivo (Supabase Realtime).** `PasoHorario` se suscribe a cambios de
   `citas` filtrados por `doctor_id`. Cualquier INSERT/UPDATE refresca la grilla.
   Es UX, **no garantía**.
2. **Verificación pre-submit.** Antes de `POST /api/citas`, el cliente re-consulta
   `obtener_slots_disponibles`. Si el slot está ocupado, aborta con toast sin tocar
   la RPC.
3. **Atomic insert (garantía dura).** Índice único parcial + `pg_advisory_xact_lock`
   en `crear_cita_atomic`. Postgres garantiza que exactamente una transacción gana.

### Wizard del miembro

Refactor de `components/dashboard/miembro/citas/`.

```
1. Ubicación   → SELECT FROM ubicaciones WHERE activo
2. Servicio    → filtra por doctores activos en ubicación
3. Doctor      → filtra doctores por ubicación + servicio
4. Fecha       → calendario con obtener_dias_disponibles
5. Horario     → obtener_slots_disponibles + Realtime
6. Paciente    → titular o familiar (sin cambios funcionales)
7. Pago        → flujo existente
8. Confirmar   → re-verifica slot + crear_cita_atomic
```

#### Aviso de concurrencia en `PasoConfirmar`

Texto (i18n `Dashboard.miembro.citas.wizard.confirmar.aviso_concurrencia`):

> **Este horario aún no está reservado.** Otros usuarios pueden tomarlo en
> cualquier momento — confirma tu cita ahora para asegurarla.

#### Manejo de errores en el submit

- `SLOT_TAKEN` → toast + auto-back a `PasoHorario` con grilla refrescada.
- `QUOTA_EXCEEDED` → toast + bloquear submit.
- Otros códigos tipados → toast específico según código.
- Error de red genérico → toast genérico sin perder el estado del wizard.

### Dashboard admin

Rutas nuevas bajo `app/[locale]/(dashboard)/dashboard/admin/`:

```
admin/
  ubicaciones/                   — CRUD
  servicios/                     — CRUD
  doctores/                      — lista
  doctores/[id]/                 — detalle con tabs (info / servicios / horarios+excepciones)
  citas/calendario/              — vista calendario
  citas/                         — lista existente, refactor menor
```

- `AdminCalendarioCitas` usa `@fullcalendar/react` (instalado vía pnpm). Vistas
  día/semana/mes, filtros por ubicación/doctor/servicio/estado, color por estado,
  modal con acciones (confirmar/rechazar/cancelar). Suscripción Realtime para
  refresco en vivo cuando varios admins están viendo.
- `AdminDoctorDetalle` con tabs Info / Servicios / Horario+Excepciones. La pestaña
  de horario muestra grilla semanal Lun-Dom con bloques agregables y un panel de
  excepciones cronológico.

### Notificaciones y .ics

#### Flujo

1. Trigger `tr_cita_estado_change`:
   - `AFTER INSERT ON citas` → inserta evento `creada`.
   - `AFTER UPDATE OF estado_sync ON citas` → inserta evento según el nuevo estado
     (`confirmada`, `rechazada`, `cancelada`).
2. Edge function `procesar_eventos_cita` consume eventos `procesado = FALSE`.
   Se invoca por `pg_cron` cada 30s (mecanismo principal). Para latencia menor en
   eventos visibles al usuario (confirmación, rechazo), el trigger adicionalmente
   dispara `pg_net.http_post` hacia la edge function. Ambos caminos son idempotentes:
   el primero en llegar marca el evento `procesado` y el otro encuentra la cola vacía.
3. Por cada evento dispara las notificaciones según el tipo:
   - `creada` → in-app (paciente y admin).
   - `confirmada` → WhatsApp + email con `.ics` + botones de calendario + in-app.
   - `rechazada` → WhatsApp + email + in-app.
   - `cancelada` → WhatsApp + in-app.
   - `recordatorio_24h` → WhatsApp + email + in-app.
4. Marca `procesado = TRUE`. Errores incrementan `intentos` con tope de 3.

#### Generación de `.ics`

Helper `lib/calendar/ics.ts` (server-side). Endpoint `GET /api/citas/[id]/ics` para
descarga con auth. Se adjunta al email de confirmación.

#### Botones de calendario

Componente `<AgregarACalendario citaId />` con dropdown shadcn:

- Google Calendar (URL con params prellenados)
- Outlook web (URL con params prellenados)
- Apple Calendar (descarga `.ics`)
- Descargar `.ics`

Helpers en `lib/calendar/links.ts`. Aparece en `CitaCard` cuando estado =
`confirmado` y dentro del email.

#### Email con Resend

Variables nuevas:

```
RESEND_API_KEY
EMAIL_FROM
```

Templates: `cita_confirmada`, `cita_rechazada`, `recordatorio_24h`.

#### Recordatorio 24h

```sql
SELECT cron.schedule('recordatorios_citas_24h', '*/15 * * * *', $$
  INSERT INTO cita_eventos (cita_id, evento)
  SELECT c.id, 'recordatorio_24h'
  FROM citas c
  WHERE c.estado_sync = 'confirmado'
    AND c.fecha_hora_cita BETWEEN NOW() + INTERVAL '23 hours 45 minutes'
                              AND NOW() + INTERVAL '24 hours 15 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM cita_eventos e
      WHERE e.cita_id = c.id AND e.evento = 'recordatorio_24h'
    );
$$);
```

Ventana ±15min absorbe la frecuencia del cron; `NOT EXISTS` evita duplicados.

#### Notificación in-app

`<NotificacionesCampana />` en `Topbar.tsx`. Badge con count de no leídas,
dropdown con últimas 10, suscripción Realtime sobre `notificaciones` filtrada por
`user_id`. RLS: `SELECT/UPDATE` solo donde `user_id = auth.uid()`.

### RLS

- `ubicaciones`, `servicios`, `doctores`, `horarios_doctores`,
  `excepciones_horario`, `doctor_servicios` — `SELECT` para `authenticated`,
  mutaciones solo admin.
- `citas` — políticas existentes adaptadas al nuevo schema (paciente ve las suyas,
  admin global ve todas, empresa_admin ve las de sus usuarios).
- `cita_eventos` — solo `service_role` (consumido por edge function).
- `notificaciones` — `SELECT/UPDATE` solo donde `user_id = auth.uid()`.

### i18n

Nuevas claves bajo:

- `Dashboard.admin.ubicaciones.*`
- `Dashboard.admin.servicios.*`
- `Dashboard.admin.doctores.*`
- `Dashboard.admin.citas.calendario.*`
- `Dashboard.miembro.citas.wizard.confirmar.aviso_concurrencia`
- `Errors.citas.*` (códigos tipados de las RPCs)
- `Notificaciones.*` (campana in-app)

Todas en `messages/es.json` y `messages/en.json`.

## Plan de entrega — 5 fases (Opción B)

Cada fase es mergeable y desplegable. Estado funcional preservado entre fases.

### Fase 1 — Schema + datos

- Migraciones: crear tablas nuevas, alterar existentes, drop de columnas `ea_*`,
  índices, RLS.
- Borrar citas existentes (datos de prueba) antes del drop de columnas.
- Seed inicial de `ubicaciones` (Managua, León).
- Poblar `doctor_servicios` a partir del array `ea_servicios` existente
  (script SQL en la migración: `INSERT INTO doctor_servicios SELECT d.id, s.id FROM doctores d, servicios s WHERE s.ea_service_id = ANY(d.ea_servicios)`).
- `doctores.ubicacion_id` se agrega como `NULL` inicialmente, después de seedear
  ubicaciones se hace `UPDATE doctores SET ubicacion_id = ...` (asignación manual
  por admin desde el dashboard en fase 4, o script de seed si la lista es chica),
  y se aplica `ALTER TABLE doctores ALTER COLUMN ubicacion_id SET NOT NULL` en una
  migración posterior una vez completada la asignación.
- RPC `crear_cita_atomic`, `obtener_slots_disponibles`, `obtener_dias_disponibles`.
- Habilitar Realtime sobre `citas` y `notificaciones`.

Después de fase 1, el bug de duplicados ya queda mitigado en el insert (aunque el
wizard todavía consulta EA hasta la fase 3).

### Fase 2 — Backend de disponibilidad

- Endpoints nuevos: `/api/citas/disponibilidad`, `/api/citas/dias-disponibles`.
- Wrapper de `crear_cita_atomic` en `/api/citas` (POST) con mapeo de errores.
- RPCs `confirmar_cita`, `rechazar_cita`, `cancelar_cita` + endpoints
  correspondientes.

### Fase 3 — Wizard del miembro

- Refactor de los 8 pasos del wizard + `MisCitas` + `CitaCard` + `ProximaCitaCard`.
- Suscripción Realtime en `PasoHorario`.
- Aviso de concurrencia en `PasoConfirmar`.
- Eliminación de referencias a `ea_*` en componentes de empresa
  (`EmpresaCitasRegistro`, `EmpresaInicio`, `DetalleModal`, etc.).
- Eliminar `app/api/ea/`.

### Fase 4 — Dashboard admin

- `admin/ubicaciones`, `admin/servicios`, `admin/doctores`,
  `admin/doctores/[id]`, `admin/citas/calendario`.
- Endpoints CRUD admin.
- Instalar `@fullcalendar/react` con pnpm.
- Actualizar `Sidebar` y `messages/{es,en}.json`.

### Fase 5 — Notificaciones, .ics, recordatorios

- Tabla `cita_eventos` + trigger `tr_cita_estado_change`.
- Edge function `procesar_eventos_cita`.
- Helpers `lib/calendar/ics.ts` y `lib/calendar/links.ts`.
- Endpoint `/api/citas/[id]/ics`.
- Componente `<AgregarACalendario />` en `CitaCard`.
- Integración Resend + templates.
- `pg_cron` para recordatorio 24h.
- Tabla `notificaciones` + `<NotificacionesCampana />` en `Topbar`.
- `procesar_eventos_cita` reemplaza el rol de `notificar_estado_cita` (hoy llamada
  directamente desde route handlers). La lógica de envío WhatsApp existente en
  `notificar_cita_whatsapp` se refactoriza como helper interno (`lib/whatsapp/`)
  reutilizado por `procesar_eventos_cita`. Las edge functions antiguas se borran
  cuando la nueva cubre todos los casos. `sync_ea_customer` se borra de entrada.
- Limpieza final: borrar variables EA del `.env.local` y `CLAUDE.md`; borrar
  workflows n8n EA→DB obsoletos.

## Testing

Sin suite formal todavía. Mínimos por fase:

### Tests SQL (scripts en `supabase/tests/`)

- Concurrencia: 10 requests paralelos al mismo slot → 1 cita creada, 9 reciben
  `SLOT_TAKEN`.
- Multi-slot: servicio de 60 min sobre doctor con `slot_duracion=30` → bloquea
  ambos slots.
- Rechazo libera slot: rechazar cita → otro usuario reserva el mismo slot.
- Excepción bloquea: excepción de día completo → no se crean citas ese día.
- Cuota: contrato con 1 cuota → 2do intento devuelve `QUOTA_EXCEEDED`.

### Pruebas manuales por fase

Checklist documentado en el plan de implementación con escenarios end-to-end
(crear cita, doble-booking, rechazo, recordatorio, `.ics`, vista calendario admin).

## Limpieza y migración

- `DELETE FROM citas` antes de las alteraciones de schema.
- Drop de columnas `ea_*` en `citas`, `doctores`, `servicios`, `users`.
- Borrar `app/api/ea/` y `supabase/functions/sync_ea_customer/`.
- Quitar de `.env.local` y `CLAUDE.md`: `NEXT_PUBLIC_EA_API_URL`, `EA_API_KEY`.
- Documentar baja de workflows n8n EA→DB (memory `n8n workflows migration pending`
  queda resuelto cuando estos se desactiven).

## Riesgos y mitigaciones

| Riesgo                                                | Mitigación                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| Migración rompe citas en producción                   | Datos son de prueba; se borran. Cada fase es mergeable independiente.      |
| Edge function de eventos falla y notificaciones se pierden | Cola con reintentos (tope 3), badge in-app sigue mostrando estado.   |
| Realtime no llega al cliente (red lenta)              | Verificación pre-submit + atomic insert garantizan integridad.             |
| `pg_advisory_xact_lock` serializa demasiado           | Lock es por `(doctor_id, fecha)`; el costo es milisegundos.                |
| Resend cae                                            | WhatsApp y in-app siguen funcionando; email se reintenta vía cola.         |
| `.ics` mal formateado rompe import a Google/Apple     | Helper validado contra RFC 5545; tests manuales en fase 5.                 |

## Dependencias

- Paquete nuevo: `@fullcalendar/react` (+ plugins `daygrid`, `timegrid`,
  `interaction`). Instalación con pnpm.
- Paquete nuevo: `resend` (cliente oficial JS).
- Sin nuevas extensiones Postgres (todas las requeridas — `pg_cron`, `pg_net`,
  `pgcrypto` — ya están habilitadas).
- Variables de entorno nuevas: `RESEND_API_KEY`, `EMAIL_FROM`.
- Variables a eliminar: `NEXT_PUBLIC_EA_API_URL`, `EA_API_KEY`.

## Fuera de alcance

- Reembolsos automatizados al cancelar citas pagadas.
- Drag-and-drop de citas en el calendario admin (FullCalendar lo soporta;
  se evalúa post-MVP).
- OAuth con Google Calendar para sync bidireccional.
- Notificaciones push (web push o app móvil).
- Multi-zona horaria (todo opera en `America/Managua` por ahora).
