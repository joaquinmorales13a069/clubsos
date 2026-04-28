# Subscription-Based Citas Scheduling — Design Spec

**Date:** 2026-04-28  
**Branch:** feature/dashboard-global-admin  
**Status:** Approved

---

## Overview

Add a subscription/contract system that allows empresas to give their members free appointment scheduling up to a configurable quota per servicio per period. When a cita falls outside the contract (service not covered or quota exceeded), the member must select a payment method before submitting. All out-of-contract citas require global admin approval; within-contract citas require empresa_admin approval.

---

## 1. Cita State Machine

Three new `estado_sync` values are added to the existing enum:

| State | Meaning | Who acts |
|---|---|---|
| `pendiente_empresa` | Within contract, awaiting empresa_admin approval | empresa_admin |
| `pendiente_pago` | Payment required; link not sent yet OR transfer reference pending | admin |
| `pendiente_admin` | Pago en clínica; awaiting admin manual approval | admin |

Existing states (`confirmado`, `rechazado`, `cancelado`, `completado`) remain. EA sync fires on `confirmado` and `cancelado` as today — new states do not trigger it.

### Path 1 — Within contract, quota available
`pendiente_empresa` → empresa_admin approves → `confirmado` → EA sync  
OR empresa_admin rejects → `rechazado`

### Path 2 — Out of contract, pago en clínica
`pendiente_admin` → admin approves → `confirmado` → EA sync  
OR admin rejects → `rechazado`

### Path 3 — Out of contract, link de pago
`pendiente_pago` → admin pastes URL, member notified → admin verifies payment received → `confirmado` → EA sync

### Path 4 — Out of contract, transferencia bancaria
`pendiente_pago` → member submits reference number → admin verifies transfer → `confirmado` → EA sync

---

## 2. Database Schema

### New tables

```sql
-- One or many active contracts per empresa
CREATE TABLE public.contratos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  fecha_inicio   DATE NOT NULL,
  fecha_fin      DATE,                        -- NULL = open-ended
  tipo_reset     TEXT NOT NULL                -- 'mensual' | 'semanal' | 'personalizado'
                 CHECK (tipo_reset IN ('mensual','semanal','personalizado')),
  dia_reset      INT NOT NULL,                -- mensual: day of month (1–31); semanal: day of week (1=Mon…7=Sun); personalizado: period length in days
  activo         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Servicios covered per contract with allowance
CREATE TABLE public.contrato_servicios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id       UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  servicio_id       UUID NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  cuota_por_titular INT NOT NULL CHECK (cuota_por_titular > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contrato_id, servicio_id)
);

-- Payment record — one per cita, only when payment is required
CREATE TYPE public.metodo_pago AS ENUM ('link_pago', 'transferencia', 'pago_clinica');
CREATE TYPE public.estado_pago AS ENUM ('pendiente', 'verificado', 'rechazado');

CREATE TABLE public.pagos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cita_id         UUID NOT NULL UNIQUE REFERENCES public.citas(id) ON DELETE CASCADE,
  metodo          public.metodo_pago NOT NULL,
  estado          public.estado_pago NOT NULL DEFAULT 'pendiente',
  monto           NUMERIC(10,2),
  link_url        TEXT,                        -- admin pastes for link_pago
  referencia      TEXT,                        -- member submits for transferencia
  verificado_por  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  verificado_at   TIMESTAMPTZ,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Changes to existing tables

```sql
-- citas: 2 new columns (no pago_id — join via pagos.cita_id instead to avoid circular FK)
ALTER TABLE public.citas
  ADD COLUMN contrato_servicio_id UUID REFERENCES public.contrato_servicios(id) ON DELETE SET NULL,
  ADD COLUMN titular_ref_id       UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- estado_sync: 3 new values
ALTER TYPE public.estado_sync ADD VALUE IF NOT EXISTS 'pendiente_empresa';
ALTER TYPE public.estado_sync ADD VALUE IF NOT EXISTS 'pendiente_pago';
ALTER TYPE public.estado_sync ADD VALUE IF NOT EXISTS 'pendiente_admin';
```

- `contrato_servicio_id` — NULL means out of contract
- `titular_ref_id` — the titular whose quota this cita counts against (set to the member's own id if they are a titular, or to their `titular_id` if they are a familiar)
- Payment record is found via `pagos.cita_id` (UNIQUE), no FK needed on `citas` side — avoids circular dependency

### Quota check logic

An RPC `check_cuota_disponible(p_contrato_servicio_id, p_titular_ref_id)` returns the remaining quota:

```sql
-- Count non-cancelled/rejected citas in current period for this titular group
SELECT cuota_por_titular - COUNT(c.id)
FROM public.contrato_servicios cs
JOIN public.citas c ON c.contrato_servicio_id = cs.id
  AND c.titular_ref_id = p_titular_ref_id
  AND c.estado_sync NOT IN ('cancelado', 'rechazado')
  AND c.fecha_hora_cita >= current_period_start(cs.contrato_id)
WHERE cs.id = p_contrato_servicio_id;
```

`current_period_start` is a helper that computes the start of the current period from `contratos.tipo_reset`, `contratos.dia_reset`, and `contratos.fecha_inicio`.

### Bank details configuration

Admin-configurable bank details stored in the existing `configuracion_sistema` table (or a new `ajustes_sistema` JSONB row) under key `datos_bancarios`:

```json
{
  "banco": "Banpro",
  "numero_cuenta": "...",
  "iban": "NI..."
}
```

Editable at `dashboard/admin/sistema`. Displayed to members on the transferencia bancaria payment step.

---

## 3. API Routes

| Route | Method | Role | Purpose |
|---|---|---|---|
| `api/admin/contratos` | GET, POST | admin | List / create contracts |
| `api/admin/contratos/[id]` | PATCH, DELETE | admin | Edit / delete contract |
| `api/admin/contratos/[id]/servicios` | POST, DELETE | admin | Add / remove servicio from contract |
| `api/admin/citas/pagos` | GET | admin | Payment verification queue |
| `api/admin/citas/[id]/pago` | PATCH | admin | Paste link URL or verify payment |
| `api/admin/citas/[id]/aprobar` | POST | admin | Approve pago_clinica cita |
| `api/admin/citas/[id]/rechazar` | POST | admin | Reject cita |
| `api/ea/citas/[id]/aprobar` | POST | empresa_admin | Approve within-contract cita |
| `api/ea/citas/[id]/rechazar` | POST | empresa_admin | Reject within-contract cita |
| `api/citas` (existing) | POST | miembro | Schedule cita — enhanced with contract check |
| `api/citas/[id]/referencia` | POST | miembro | Submit bank transfer reference |

---

## 4. UI Components

### Member (`components/dashboard/miembro/`)

- **CitaSchedulingForm** — enhanced: after selecting servicio, shows contract coverage badge + quota bar. If out of contract or quota exceeded, shows payment method selection (link_pago, transferencia, pago_clinica).
- **CitaTransferenciaForm** — step shown after scheduling with transferencia: displays bank details (banco, cuenta, IBAN from sistema config) and reference number input.
- **CitaEstadoBadge** — updated to render new states with proper labels.

### Empresa Admin (`components/dashboard/empresa/`)

- **EmpresaCitasPendientes** — card/table showing `pendiente_empresa` citas for the empresa. Each row shows quota bar, titular/familiar context, approve/reject buttons.
- **EmpresaContratosOverview** — read-only view of active contracts and per-servicio quota usage.

### Admin (`components/dashboard/admin/`)

- **AdminContratosManager** — empresa sidebar + contract list + create/edit modal. Lives under `dashboard/admin/empresas` (tab or sub-section).
- **AdminPagoVerificacion** — two-column queue: transferencia (reference received / missing) and link_pago (paste URL / verify payment). Lives under `dashboard/admin/citas`.
- **AdminCitasPendientesAdmin** — `pendiente_admin` queue for pago_clinica approvals.
- **AdminSistemaAjustes** — existing `dashboard/admin/sistema` page gets a "Datos Bancarios" section (banco, cuenta, IBAN fields).

---

## 5. Scheduling Flow (member, step by step)

1. Member selects servicio, doctor, fecha/hora, paciente (self or familiar).
2. Client calls RPC to determine coverage:
   - Find active contract(s) for member's empresa that cover the selected servicio.
   - If covered: call `check_cuota_disponible` → show quota bar.
     - Quota > 0 → submit as `pendiente_empresa`, set `contrato_servicio_id` + `titular_ref_id`.
     - Quota = 0 → treat as out-of-contract → show payment selection.
   - If not covered by any contract → show payment selection.
3. Payment selection (if required):
   - **link_pago** → create cita as `pendiente_pago` + create `pagos` row (metodo=link_pago).
   - **transferencia** → create cita as `pendiente_pago` + create `pagos` row (metodo=transferencia) → redirect to reference submission screen.
   - **pago_clinica** → create cita as `pendiente_admin` + create `pagos` row (metodo=pago_clinica).

---

## 6. Notifications

| Trigger | Recipient | Message |
|---|---|---|
| Cita created `pendiente_empresa` | empresa_admin | New cita pending approval |
| empresa_admin approves | member | Cita confirmed |
| empresa_admin rejects | member | Cita rejected |
| Cita created `pendiente_pago` (link) | admin | New cita needs payment link |
| Admin pastes link_url | member | Payment link ready — link included |
| Admin verifies payment | member | Cita confirmed |
| Cita created `pendiente_pago` (transfer) | admin | New cita waiting transfer reference |
| Member submits reference | admin | Reference submitted, verify transfer |
| Cita created `pendiente_admin` (clinica) | admin | New cita pending approval |
| Admin approves pago_clinica | member | Cita confirmed |
| Any rejection | member | Cita rejected with reason |

Notifications use the existing announcements/notification system or WhatsApp via the existing `notificar_cita_whatsapp` hook.

---

## 7. Out of Scope

- Online payment gateway integration (Stripe, etc.) — link_pago is manual.
- Member-facing contract details page (future).
- Automated payment reconciliation.
- Contract templates or cloning between empresas.
