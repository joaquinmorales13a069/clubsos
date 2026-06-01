# Integración Pagadito — diseño

**Fecha:** 2026-06-01
**Branch:** `feat/pagadito-integration`
**Estado:** Diseño aprobado, pendiente plan de implementación

## Resumen

Integrar Pagadito como pasarela de pago principal para procesar el cobro de citas médicas excluidas de los contratos (convenios) de los pacientes. Reemplaza el flujo manual actual donde el admin pega un link de "pagoconpoket.com" en la cita y verifica el pago a mano. Implementación 100% en Next.js usando WSPG (web service crudo de Pagadito) con un cliente TypeScript propio. Reconciliación vía return URL del navegador como camino principal, más un `pg_cron` cada 10 min como respaldo para abandonos. Despliegue detrás de feature flag hasta tener credenciales sandbox.

## Motivación

El flujo actual de cobro por link tiene tres problemas:

- **Manual:** el admin recibe la solicitud, genera un link en una pasarela externa, lo pega en `PATCH /api/admin/citas/[id]/pago` con `action='paste_link'`, y lo envía por WhatsApp. Cuello de botella humano.
- **Verificación manual:** la confirmación del pago la hace el admin contra el panel de la pasarela externa. Susceptible a olvidos y retrasos para el miembro.
- **Sin integración real:** el sistema no sabe cuándo el miembro pagó. Solo sabe que el admin marcó verificado. Sin auditoría de la transacción, sin reconciliación.

Pagadito ofrece un web service que permite generar links programáticamente y consultar estado de transacción. Mover esa lógica al backend elimina el cuello manual y entrega confirmación al miembro en segundos.

## Decisiones de diseño

### WSPG vs APIPG

Pagadito ofrece dos capas: **WSPG** (web service crudo, lenguaje‑agnóstico, basado en SOAP/HTTP) y **APIPG** (wrappers SDK solo para PHP y Java). El APIPG no expone funcionalidad distinta — solo abstrae WSPG y agrega helpers de conveniencia.

Como el stack es Next.js/Node, **se implementa un cliente TypeScript propio sobre WSPG**. Tres operaciones (`connect`, `exec_trans`, `get_status`) no justifican adoptar una librería SOAP completa; un wrapper con `fetch` es trivial y se debuggea solo.

### Convivencia con métodos manuales

`metodo_pago` mantiene su enum existente (`link_pago`, `transferencia`, `pago_clinica`). **`link_pago` pasa a significar "pago con Pagadito"** — no se renombra para evitar migración de datos e i18n. `transferencia` y `pago_clinica` siguen con el flujo manual de admin.

### Timing del link

El link de Pagadito se genera **inmediato en el wizard**, en cuanto el miembro elige `link_pago`. El wizard crea la cita, dispara `exec_trans`, y redirige al checkout de Pagadito. No se envía WhatsApp con el link en este flujo (el miembro ya está en la app).

### Moneda

Cobro en **NIO** (Córdoba nicaragüense). El cliente Pagadito acepta cualquier moneda soportada por la plataforma (`NIO`, `USD`, `HNL`, `GTQ`, `CRC`, `DOP`, `PAB`) — esto deja el cliente listo para multi-moneda futura sin requerir cambios al schema ni al wizard hoy.

### Reconciliación

**Return URL como camino principal + `pg_cron` cada 10 min como respaldo**. Cuando el miembro vuelve a la app tras pagar, `GET /api/pagadito/return` consulta `get_status` y cierra el pago. Si el miembro abandona el navegador sin volver, el cron busca pagos en estado `iniciado` con más de 5 minutos de antigüedad y los reconcilia. Pagos en `iniciado` por más de **6 horas** se marcan `rechazado` (hard expiry) para liberar al miembro a reintentar.

### Sin WhatsApp en el flujo automático

El flujo `link_pago` automatizado **no envía WhatsApp** — ni el link inicial (el miembro está en la app), ni recordatorios de abandono. Si abandona, expira a las 6h. El template existente `cita_realizar_pago_link_poket` queda solo para el fallback manual del admin.

### Arquitectura 100% Next.js

Toda la integración (cliente Pagadito, endpoints de init, return, reconcile) vive en Next.js. El `pg_cron` llama el endpoint interno de reconcile vía `net.http_post` con un secret header compartido. Se descartó el approach híbrido con Supabase Edge Function porque el caso de uso (SOAP a Pagadito + lectura/escritura de Supabase) no requiere Deno ni SDKs específicos.

### Feature flag

Mientras `PAGADITO_UID` esté vacío, `POST /api/citas/[id]/pagadito/init` responde 503 y el wizard oculta `link_pago` o lo muestra como "Próximamente". Permite desplegar el código sin credenciales.

## Arquitectura

### Diagrama de flujo

```
┌──────────┐   1.elige link_pago    ┌──────────────┐
│ Wizard   │ ─────────────────────► │ POST /api/   │
│ miembro  │                        │  citas/[id]/ │
└────┬─────┘                        │ pagadito/init│
     │                              └──────┬───────┘
     │ 3.redirect URL                      │ 2.exec_trans()
     ▼                                     ▼
┌──────────┐    4.miembro paga      ┌──────────────┐
│ Checkout │ ─────────────────────► │   Pagadito   │
│ Pagadito │                        └──────┬───────┘
└────┬─────┘                               │
     │ 5.return URL (?token=…)             │
     ▼                                     │
┌──────────────────┐  6.get_status(token)  │
│ GET /api/pagadito│ ◄─────────────────────┘
│  /return         │
└────┬─────────────┘
     │ 7.RPC confirmar_cita_por_pago
     ▼
┌──────────────────┐
│ Wizard - paso    │
│ confirmación     │
└──────────────────┘

         ┌─ Cron de respaldo (pg_cron, cada 10 min) ─┐
         │ net.http_post('/api/internal/pagadito/    │
         │   reconcile') con secret                  │
         │   → busca pagos.estado='iniciado'         │
         │     AND iniciado_at < NOW()-5min          │
         │   → llama get_status para cada uno        │
         │   → si > 6h: rechazado (hard expiry)      │
         └───────────────────────────────────────────┘
```

### Componentes

- **`lib/pagadito/client.ts`** — cliente tipado: `connect()`, `execTrans()`, `getStatus()`. Cachea token de sesión a nivel de proceso. Sin Supabase, puro.
- **`lib/pagadito/errors.ts`** — `PagaditoError` class + mapping de códigos Pagadito (`PG2003`, `PG2004`, etc.) a i18n keys + HTTP status.
- **`lib/pagadito/types.ts`** — `PagaditoCurrency`, `Detail`, `GetStatusResult`, etc.
- **`lib/pagadito/config.ts`** — lee env, expone endpoints sandbox/producción.
- **`app/api/citas/[id]/pagadito/init/route.ts`** — auth miembro + ownership; idempotente (reusa link < 30 min); llama `execTrans`; persiste; devuelve `{ redirect_url }`.
- **`app/api/pagadito/return/route.ts`** — recibe `?token=…`; service-role client (sesión no garantizada); llama `getStatus`; ejecuta RPC `confirmar_cita_por_pago` si completado; redirige al wizard con `?pago=ok|rechazado|pendiente|desconocido`.
- **`app/api/internal/pagadito/reconcile/route.ts`** — protegido por header `x-cron-secret`; batch de 100; hard expiry a 6h.
- **`components/dashboard/miembro/citas/steps/PasoRedireccionPagadito.tsx`** — nuevo paso del wizard: crea cita → init → redirect, con estados visuales (`creando_cita`, `generando_link`, `redirigiendo`, `error`).

## Schema (migraciones)

Dos migraciones separadas:

### Migración 1: `pagadito_integration.sql`

```sql
-- Extender enum estado_pago con 'iniciado'
ALTER TYPE public.estado_pago ADD VALUE IF NOT EXISTS 'iniciado' BEFORE 'verificado';

-- Columnas Pagadito en pagos
ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS pagadito_token   TEXT,
  ADD COLUMN IF NOT EXISTS pagadito_ern     TEXT,
  ADD COLUMN IF NOT EXISTS pagadito_estado  TEXT,
  ADD COLUMN IF NOT EXISTS pagadito_payload JSONB,
  ADD COLUMN IF NOT EXISTS iniciado_at      TIMESTAMPTZ;

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_pagadito_ern
  ON public.pagos (pagadito_ern) WHERE pagadito_ern IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_estado_iniciado_at
  ON public.pagos (iniciado_at)
  WHERE estado = 'iniciado';
```

> Nota: `ALTER TYPE ... ADD VALUE` no se puede ejecutar dentro de un bloque transaccional con otras DDL en algunas versiones de Postgres. Si `supabase db push` se queja, se separa esa línea a una migración propia previa.

### Migración 2: `confirmar_cita_por_pago_rpc.sql`

RPC `SECURITY DEFINER` que ejecuta atómicamente:
- `UPDATE pagos SET estado='verificado', pagadito_payload=..., pagadito_estado=..., verificado_at=NOW()`
- `UPDATE citas SET estado_sync='confirmado'` (solo si `estado_sync IN ('pendiente_pago', 'pendiente_admin')`; si está `cancelado` deja flag para reembolso manual)
- `INSERT INTO cita_eventos` para que `procesar_eventos_cita` dispare WhatsApp/email/notificación

Idempotente: si el pago ya está `verificado`, no-op.

### Migración 3: `pagadito_pg_cron.sql` (separada del rollout inicial)

```sql
SELECT cron.schedule(
  'pagadito_reconcile',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.settings.next_base_url') || '/api/internal/pagadito/reconcile',
      headers := jsonb_build_object('x-cron-secret', current_setting('app.settings.pagadito_reconcile_secret')),
      body    := '{}'::jsonb
    );
  $$
);
```

GUCs requeridas:
```sql
ALTER DATABASE postgres SET app.settings.next_base_url = 'https://app.clubsos.com';
ALTER DATABASE postgres SET app.settings.pagadito_reconcile_secret = '<secret>';
```

### Lo que NO cambia

- Enum `metodo_pago` se mantiene (`link_pago` ahora significa Pagadito).
- `pagos.link_url`, `pagos.referencia` se mantienen (no se renombran ni reusan).
- `crear_cita_atomic` RPC sigue creando `pagos` con `estado='pendiente'` cuando `metodo='link_pago'`.

## Cliente Pagadito (`lib/pagadito/`)

### `config.ts`

```ts
type Env = "sandbox" | "production";

export const PAGADITO = {
  env: (process.env.PAGADITO_ENV ?? "sandbox") as Env,
  uid: required("PAGADITO_UID"),
  wsk: required("PAGADITO_WSK"),
  endpoint:
    process.env.PAGADITO_ENV === "production"
      ? "https://comercios.pagadito.com/wspg/charges.php"
      : "https://sandbox.pagadito.com/comercios/wspg/charges.php",
  returnUrl: required("PAGADITO_RETURN_URL"),
  reconcileSecret: required("PAGADITO_RECONCILE_SECRET"),
};
```

URLs exactas se confirman contra la doc oficial cuando lleguen credenciales.

### `types.ts`

```ts
export type PagaditoCurrency =
  | "NIO" | "USD" | "HNL" | "GTQ" | "CRC" | "DOP" | "PAB";
```

### `client.ts` — API pública

```ts
export class PagaditoClient {
  async connect(): Promise<string>;

  async execTrans(input: {
    ern: string;
    amount: number;
    currency: PagaditoCurrency;
    details: Array<{ quantity: number; description: string; amount: number }>;
    customParams?: Record<string, string>;
  }): Promise<{ url: string; token: string }>;

  async getStatus(token: string): Promise<{
    code: string;
    status: "completed" | "pending" | "failed" | "cancelled";
    reference?: string;
    raw: unknown;
  }>;
}

export const pagadito = new PagaditoClient();
```

### Decisiones del cliente

1. **HTTP nativo, no librería SOAP.** Tres operaciones simples no justifican `node-soap`. Si la doc resulta requerir SOAP estricto con WSDL al validar, se reevalúa.
2. **Cache de token a nivel de proceso.** Evita round-trip por cada `execTrans`. Si `getStatus` devuelve `PG2004` (sesión expirada), reintenta una vez tras `connect()`.
3. **Sin reintentos genéricos.** Solo en `PG2004`. Los demás errores se propagan como `PagaditoError`.
4. **No toca Supabase.** Puro: input → output. Toda la persistencia la hace el route handler. Testeable con mocks de `fetch`.
5. **Logging estructurado, prefijo `[pagadito]`.** Nunca logear `wsk`, `uid`, ni payloads completos de miembros.
6. **Validación interna** (`amount > 0`, `ern` no vacío, `Σ details.amount === amount`) antes de mandar a Pagadito.

### Fuera de scope (YAGNI)

- ❌ Refunds / `void_trans` / `process_refund` (manejo manual desde panel Pagadito).
- ❌ Suscripciones / cobros recurrentes.
- ❌ Reportes (`get_consult_balance`).

## Route Handlers

### `POST /api/citas/[id]/pagadito/init`

**Auth:** usuario autenticado, dueño de la cita.

**Lógica:**
1. Cargar cita + pago. Validar ownership, `metodo='link_pago'`, `estado != 'verificado'`.
2. **Idempotencia:** si `pago.estado='iniciado'` y `iniciado_at < 30 min`, devolver el mismo `link_url`.
3. Generar ERN único: `${citaId}:${unix_timestamp}` (permite reintentos sobre la misma cita).
4. Llamar `pagadito.execTrans({ ern, amount, currency: "NIO", details: [...], customParams: { cita_id }})`.
5. Persistir: `pagos.estado='iniciado'`, `link_url`, `pagadito_token`, `pagadito_ern`, `iniciado_at=NOW()`.
6. Audit log `pago.pagadito.init`.
7. Devolver `{ redirect_url }`.

**Errores:**
- 401 sin auth, 403 si no es dueño, 404 cita no existe, 400 método incorrecto, 409 ya pagado.
- `PagaditoError` se traduce a status del mapping (típicamente 502).

### `GET /api/pagadito/return`

**Auth:** ninguna obligatoria — Pagadito redirige sin garantía de sesión. Service-role client lee `pagos` por `pagadito_token` (opaco, no enumerable).

**Lógica:**
1. Validar `?token=...` presente. Si no, redirect a `/dashboard/citas?pago=error`.
2. Buscar `pagos` por `pagadito_token`. Si no existe → `?pago=desconocido`.
3. Llamar `pagadito.getStatus(token)`.
4. Según `result.status`:
   - `completed` → RPC `confirmar_cita_por_pago` → redirect a `/dashboard/citas/[id]?pago=ok`
   - `failed`/`cancelled` → `pagos.estado='rechazado'` + payload → `?pago=rechazado`
   - `pending` → no-op, redirect a `?pago=pendiente`
5. Si `getStatus` throws, no marcar nada — dejar al cron.

**Idempotente:** replay del return URL no doble-cobra ni doble-notifica gracias a la RPC.

### `POST /api/internal/pagadito/reconcile`

**Auth:** header `x-cron-secret` debe matchear env.

**Lógica:**
1. Cargar hasta 100 pagos con `estado='iniciado'` y `iniciado_at < NOW() - 5 min`.
2. Para cada uno:
   - Si `age > 6h` → `estado='rechazado'`, continuar.
   - Llamar `getStatus`. Mapear igual que `/return`.
   - Si error individual → log + continuar.
3. Devolver `{ confirmados, rechazados, expirados, errores }`.

### Endpoint admin existente

`PATCH /api/admin/citas/[id]/pago` con `action='paste_link'` se mantiene **solo como fallback manual**. UI admin lo expone con disclaimer "Solo usar si Pagadito está caído". `action='verify'` se mantiene intacto para `transferencia` y `pago_clinica`.

## Wizard UX

### Ramaje por método en `PasoPago`

```
PasoPago (elige metodo)
    │
    ├── transferencia  ──┐
    ├── pago_clinica   ──┼──► PasoConfirmacion (flujo actual)
    │
    └── link_pago ──────► PasoRedireccionPagadito (NUEVO)
                              · crea cita (estado_sync='pendiente_pago')
                              · POST /api/citas/[id]/pagadito/init
                              · redirige a result.url
```

### `PasoRedireccionPagadito`

Componente que en mount crea la cita, dispara init, y redirige. Estados visuales:

- `creando_cita` — spinner + "Reservando tu cita..."
- `generando_link` — spinner + "Generando enlace de pago seguro..."
- `redirigiendo` — spinner + logo Pagadito + "Te llevamos a Pagadito..." (delay 800ms para UX)
- `error` — ícono + mensaje i18n + botones "Reintentar" / "Cambiar método"

### Por qué crear cita antes del redirect

Reserva el slot inmediatamente vía `crear_cita_atomic`. Si dos miembros eligen la misma hora y el primero va a pagar, el segundo no puede agarrar el slot. Si el miembro abandona en Pagadito, la cita queda en `pendiente_pago` y el cron de Pagadito o un cleanup posterior la procesa.

### Página de retorno

`/[locale]/dashboard/citas/[id]?pago=ok|rechazado|pendiente|desconocido` muestra banner + toast según el query param. `useEffect` con `router.replace` limpia el query tras mostrar el toast para que recargar no re-dispare.

| `?pago=` | Mensaje |
|---|---|
| `ok` | "¡Pago confirmado! Tu cita está agendada." |
| `pendiente` | "Estamos verificando tu pago. Te avisaremos por WhatsApp." |
| `rechazado` | "El pago no se completó. Puedes reintentar." (+ botón reintentar) |
| `desconocido` | "No encontramos esta transacción. Contacta a soporte." |

### i18n

Nuevas keys en `messages/es.json` y `messages/en.json` (siempre ambas):

```json
"Dashboard.miembro.citas.pagadito": {
  "creando_cita":   "Reservando tu cita...",
  "generando_link": "Generando enlace de pago seguro...",
  "redirigiendo":   "Te llevamos a Pagadito...",
  "errors": {
    "invalid_credentials":  "Servicio de pagos no disponible. Intenta más tarde.",
    "invalid_amount":       "Monto inválido. Contacta a soporte.",
    "currency_not_enabled": "Moneda no habilitada. Contacta a soporte.",
    "generic":              "No pudimos generar el enlace. Reintenta."
  },
  "retorno": {
    "ok":          "¡Pago confirmado! Tu cita está agendada.",
    "pendiente":   "Estamos verificando tu pago. Te avisaremos por WhatsApp.",
    "rechazado":   "El pago no se completó. Puedes reintentar.",
    "desconocido": "No encontramos esta transacción. Contacta a soporte."
  },
  "reintentar":     "Reintentar pago",
  "cambiar_metodo": "Cambiar método de pago"
}
```

## Variables de entorno

Agregar a `.env.local` y documentar en `CLAUDE.md`:

```bash
PAGADITO_ENV=sandbox               # 'sandbox' | 'production'
PAGADITO_UID=                       # merchant identifier
PAGADITO_WSK=                       # access key
PAGADITO_RETURN_URL=                # https://app.clubsos.com/api/pagadito/return
PAGADITO_RECONCILE_SECRET=          # random 32+ chars
```

GUCs Postgres:
```sql
ALTER DATABASE postgres SET app.settings.next_base_url = 'https://app.clubsos.com';
ALTER DATABASE postgres SET app.settings.pagadito_reconcile_secret = '<mismo valor>';
```

## Rollout

1. **PR 1:** Migraciones 1 y 2 (schema + RPC). Desplegable sin código, no rompe nada.
2. **PR 2:** `lib/pagadito/*` + 3 route handlers + `PasoRedireccionPagadito`. Feature flag activo (sin credenciales, `link_pago` oculto).
3. **PR 3:** Credenciales sandbox → poblar env, smoke test, activar `link_pago` en wizard.
4. **PR 4:** Migración 3 (`pg_cron` schedule + GUCs).
5. **Producción:** swap `PAGADITO_ENV=production` y credenciales reales. Monitor 1 semana antes de retirar el endpoint admin manual.

## Testing

No hay suite de tests en el proyecto. Testing manual estructurado + smoke script:

### Casos manuales (cuando lleguen credenciales sandbox)

| Caso | Resultado esperado |
|---|---|
| Happy path | toast "ok", cita `confirmado`, pago `verificado` |
| Cancelación en Pagadito | toast "rechazado", reintentar funciona |
| Abandono total (cerrar pestaña) | tras 6h, cron marca `rechazado` |
| Abandono + pago (pagó pero no volvió) | tras ≤10 min, cron marca `confirmado` + dispara WhatsApp/email |
| Reintento tras rechazo | nuevo ERN, nuevo link, no colisiona |
| Credenciales malas (`PAGADITO_WSK` inválido) | init devuelve 502, mensaje claro |
| Slot taken (dos miembros simultáneos) | el segundo recibe `SLOT_TAKEN`, no se llama Pagadito |
| Doble click en init | mismo link devuelto (idempotencia) |
| Replay del return URL | no doble-cobra ni doble-notifica |

### Smoke script

`scripts/pagadito-smoke.ts` ejecuta `connect → execTrans → getStatus` con ERN dummy. Útil para validar credenciales y conectividad sin pasar por el wizard.

## Edge cases

- **Pagadito caído al hacer init:** route 502 + i18n key. Wizard ofrece "Cambiar método" o reintentar desde la página de detalle (cita ya creada).
- **Cita creada pero init falla:** queda en `pendiente_pago` sin link. Miembro reintenta desde `/dashboard/citas/[id]` con botón "Reintentar pago". No se permite cambiar `metodo_pago` post-creación (máquina de estado limpia); ofrecer "Cancelar y reservar de nuevo".
- **Replay del return URL:** idempotente. La RPC `confirmar_cita_por_pago` chequea estado antes de insertar `cita_eventos`.
- **Pago verificado pero cita cancelada:** la RPC detecta `estado_sync='cancelado'` y NO confirma. Marca `pagos.estado='verificado'` igual con flag para reembolso manual.
- **Cambio de slot post-pago:** si admin reagenda, no afecta el pago. Solo cambia la fecha.

## Observabilidad

- Logs estructurados con prefijo `[pagadito]` (info: éxitos, error: throws).
- Respuesta del reconcile (`{ confirmados, rechazados, expirados, errores }`) capturada en `cron.job_run_details`. Alertar si `errores > N`.
- Tabla opcional futura: `pagadito_audit (id, pago_id, accion, request_payload, response_payload, created_at)` para trazabilidad legal. Fuera del scope inicial.

## Resumen de archivos

**Nuevos:**
- `supabase/migrations/YYYYMMDDHHMMSS_pagadito_integration.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_confirmar_cita_por_pago_rpc.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_pagadito_pg_cron.sql` (rollout PR 4)
- `lib/pagadito/{client,errors,types,config}.ts`
- `app/api/citas/[id]/pagadito/init/route.ts`
- `app/api/pagadito/return/route.ts`
- `app/api/internal/pagadito/reconcile/route.ts`
- `components/dashboard/miembro/citas/steps/PasoRedireccionPagadito.tsx`
- `scripts/pagadito-smoke.ts`

**Modificados:**
- `components/dashboard/miembro/citas/steps/PasoPago.tsx` (ramaje por método)
- `app/[locale]/(dashboard)/dashboard/citas/[id]/page.tsx` (banner `?pago=…`)
- `app/api/admin/citas/[id]/pago/route.ts` (mantener como fallback con disclaimer)
- `messages/es.json` + `messages/en.json`
- `.env.local` + `CLAUDE.md`
