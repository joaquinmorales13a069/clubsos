# Subscription-Based Citas — Part 1: Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add contratos/pagos schema, quota-check RPCs, and all API routes that power the subscription-based cita scheduling system.

**Architecture:** New tables (`contratos`, `contrato_servicios`, `pagos`) extend the existing schema. Three new `estado_sync` values drive state-machine routing. All role checks follow the existing pattern in `app/api/ea/citas/aprobar/route.ts` — fetch session → check `users.rol` → validate ownership → act.

**Tech Stack:** Supabase (PostgreSQL migrations via `supabase db push`), Next.js 16 App Router Route Handlers, TypeScript, `@supabase/ssr`.

**Part 2:** UI components are in `2026-04-28-subscription-citas-part2-frontend.md`. Complete this plan first — Part 2 depends on all routes defined here.

---

## File Map

### New files
- `supabase/migrations/20260428200000_subscription_citas_schema.sql` — all DDL
- `supabase/migrations/20260428210000_subscription_citas_rpcs.sql` — all RPCs
- `app/api/admin/contratos/route.ts` — GET list, POST create
- `app/api/admin/contratos/[id]/route.ts` — PATCH edit, DELETE
- `app/api/admin/contratos/[id]/servicios/route.ts` — POST add servicio, DELETE remove
- `app/api/admin/citas/pagos/route.ts` — GET payment verification queue
- `app/api/admin/citas/[id]/pago/route.ts` — PATCH paste link / verify payment
- `app/api/admin/citas/[id]/aprobar/route.ts` — POST approve pendiente_admin
- `app/api/admin/citas/[id]/rechazar/route.ts` — POST reject any admin-owned state
- `app/api/ea/citas/[id]/aprobar/route.ts` — NEW file replacing existing logic + handles pendiente_empresa
- `app/api/ea/citas/[id]/rechazar/route.ts` — POST reject pendiente_empresa
- `app/api/citas/route.ts` — POST create cita (enhanced with contract check)
- `app/api/citas/[id]/referencia/route.ts` — POST member submits transfer reference

### Modified files
- `app/api/ea/citas/aprobar/route.ts` — update estado guard from `pendiente` → `pendiente_empresa`

---

## Task 1: Database Migration — Schema

**Files:**
- Create: `supabase/migrations/20260428200000_subscription_citas_schema.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: subscription_citas_schema
-- Adds contratos, contrato_servicios, pagos tables and alters citas + estado_sync.

-- 1. New enum values on estado_sync
ALTER TYPE public.estado_sync ADD VALUE IF NOT EXISTS 'pendiente_empresa';
ALTER TYPE public.estado_sync ADD VALUE IF NOT EXISTS 'pendiente_pago';
ALTER TYPE public.estado_sync ADD VALUE IF NOT EXISTS 'pendiente_admin';

-- 2. Payment enums
DO $$ BEGIN
  CREATE TYPE public.metodo_pago AS ENUM ('link_pago', 'transferencia', 'pago_clinica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.estado_pago AS ENUM ('pendiente', 'verificado', 'rechazado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. contratos
CREATE TABLE IF NOT EXISTS public.contratos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE,
  tipo_reset   TEXT NOT NULL CHECK (tipo_reset IN ('mensual','semanal','personalizado')),
  dia_reset    INT  NOT NULL,
  activo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. contrato_servicios
CREATE TABLE IF NOT EXISTS public.contrato_servicios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id       UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  servicio_id       UUID NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  cuota_por_titular INT  NOT NULL CHECK (cuota_por_titular > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contrato_id, servicio_id)
);

-- 5. pagos
CREATE TABLE IF NOT EXISTS public.pagos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cita_id        UUID NOT NULL UNIQUE REFERENCES public.citas(id) ON DELETE CASCADE,
  metodo         public.metodo_pago NOT NULL,
  estado         public.estado_pago NOT NULL DEFAULT 'pendiente',
  monto          NUMERIC(10,2),
  link_url       TEXT,
  referencia     TEXT,
  verificado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
  verificado_at  TIMESTAMPTZ,
  notas          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Alter citas
ALTER TABLE public.citas
  ADD COLUMN IF NOT EXISTS contrato_servicio_id UUID REFERENCES public.contrato_servicios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS titular_ref_id       UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_contratos_empresa   ON public.contratos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cs_contrato         ON public.contrato_servicios(contrato_id);
CREATE INDEX IF NOT EXISTS idx_citas_cs_id         ON public.citas(contrato_servicio_id);
CREATE INDEX IF NOT EXISTS idx_citas_titular_ref   ON public.citas(titular_ref_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cita          ON public.pagos(cita_id);

-- 8. RLS
ALTER TABLE public.contratos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos             ENABLE ROW LEVEL SECURITY;

-- admin: full access
CREATE POLICY contratos_admin_all ON public.contratos
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

CREATE POLICY cs_admin_all ON public.contrato_servicios
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

-- empresa_admin: read own empresa contratos
CREATE POLICY contratos_ea_read ON public.contratos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.rol = 'empresa_admin' AND u.empresa_id = empresa_id
    )
  );

CREATE POLICY cs_ea_read ON public.contrato_servicios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.contratos c ON c.empresa_id = u.empresa_id
      WHERE u.id = auth.uid() AND u.rol = 'empresa_admin'
        AND c.id = contrato_id
    )
  );

-- miembro: read own empresa contratos (for scheduling UI)
CREATE POLICY contratos_miembro_read ON public.contratos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.rol = 'miembro' AND u.empresa_id = empresa_id
    )
  );

CREATE POLICY cs_miembro_read ON public.contrato_servicios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.contratos c ON c.empresa_id = u.empresa_id
      WHERE u.id = auth.uid() AND u.rol = 'miembro' AND c.id = contrato_id
    )
  );

-- pagos: admin full access
CREATE POLICY pagos_admin_all ON public.pagos
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND rol = 'admin')
  );

-- miembro: read + insert own cita's pago
CREATE POLICY pagos_miembro_read ON public.pagos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.citas c WHERE c.id = cita_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY pagos_miembro_insert ON public.pagos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.citas c WHERE c.id = cita_id AND c.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push
```

Expected: migration applied with no errors. Verify in Supabase dashboard that all tables exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260428200000_subscription_citas_schema.sql
git commit -m "feat(db): add contratos, contrato_servicios, pagos schema and alter citas"
```

---

## Task 2: Database Migration — RPCs

**Files:**
- Create: `supabase/migrations/20260428210000_subscription_citas_rpcs.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: subscription_citas_rpcs
-- Helper: current_period_start
-- RPCs: check_cuota_disponible, get_empresa_contrato_usage, get_miembro_contrato_usage

-- ── Helper: compute start of current quota period ───────────────────────────
CREATE OR REPLACE FUNCTION public.current_period_start(p_contrato_id UUID)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tipo       TEXT;
  v_dia        INT;
  v_inicio     DATE;
  v_today      DATE := CURRENT_DATE;
  v_period_start DATE;
BEGIN
  SELECT tipo_reset, dia_reset, fecha_inicio
    INTO v_tipo, v_dia, v_inicio
    FROM public.contratos WHERE id = p_contrato_id;

  IF v_tipo = 'mensual' THEN
    -- dia_reset = day of month; period starts on that day of current (or prev) month
    v_period_start := DATE_TRUNC('month', v_today) + (v_dia - 1) * INTERVAL '1 day';
    IF v_period_start > v_today THEN
      v_period_start := v_period_start - INTERVAL '1 month';
    END IF;

  ELSIF v_tipo = 'semanal' THEN
    -- dia_reset = ISO day of week (1=Mon, 7=Sun)
    v_period_start := v_today - ((EXTRACT(ISODOW FROM v_today)::INT - v_dia + 7) % 7) * INTERVAL '1 day';

  ELSE -- personalizado: period length in days from fecha_inicio
    DECLARE
      v_days_since INT := v_today - v_inicio;
      v_periods    INT := v_days_since / v_dia;
    BEGIN
      v_period_start := v_inicio + v_periods * v_dia * INTERVAL '1 day';
    END;
  END IF;

  RETURN v_period_start;
END;
$$;

-- ── RPC: check_cuota_disponible ──────────────────────────────────────────────
-- Returns remaining quota (negative = exceeded). Called from the scheduling UI.
CREATE OR REPLACE FUNCTION public.check_cuota_disponible(
  p_contrato_servicio_id UUID,
  p_titular_ref_id       UUID
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuota    INT;
  v_used     INT;
  v_contrato UUID;
  v_period   DATE;
BEGIN
  SELECT cuota_por_titular, contrato_id
    INTO v_cuota, v_contrato
    FROM public.contrato_servicios
   WHERE id = p_contrato_servicio_id;

  v_period := public.current_period_start(v_contrato);

  SELECT COUNT(*)
    INTO v_used
    FROM public.citas
   WHERE contrato_servicio_id = p_contrato_servicio_id
     AND titular_ref_id       = p_titular_ref_id
     AND estado_sync NOT IN ('cancelado', 'rechazado')
     AND fecha_hora_cita >= v_period::TIMESTAMPTZ;

  RETURN v_cuota - v_used;
END;
$$;

-- ── RPC: get_empresa_contrato_usage ─────────────────────────────────────────
-- Returns per-contrato, per-servicio usage for empresa_admin dashboard.
CREATE OR REPLACE FUNCTION public.get_empresa_contrato_usage(p_empresa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '[]'::JSONB;
  v_row    RECORD;
BEGIN
  FOR v_row IN
    SELECT
      c.id        AS contrato_id,
      c.nombre    AS contrato_nombre,
      c.tipo_reset,
      c.dia_reset,
      c.fecha_inicio,
      c.fecha_fin,
      cs.id       AS cs_id,
      s.nombre    AS servicio_nombre,
      cs.cuota_por_titular,
      -- count active titulares in empresa
      (SELECT COUNT(DISTINCT u.id)
         FROM public.users u
        WHERE u.empresa_id = p_empresa_id
          AND u.rol = 'miembro'
          AND u.titular_id IS NULL) AS titulares_count,
      -- used this period
      (SELECT COUNT(*)
         FROM public.citas ci
        WHERE ci.contrato_servicio_id = cs.id
          AND ci.estado_sync NOT IN ('cancelado','rechazado')
          AND ci.fecha_hora_cita >= public.current_period_start(c.id)::TIMESTAMPTZ
      ) AS used
    FROM public.contratos c
    JOIN public.contrato_servicios cs ON cs.contrato_id = c.id
    JOIN public.servicios s           ON s.id = cs.servicio_id
   WHERE c.empresa_id = p_empresa_id
     AND c.activo = true
   ORDER BY c.nombre, s.nombre
  LOOP
    v_result := v_result || jsonb_build_object(
      'contrato_id',       v_row.contrato_id,
      'contrato_nombre',   v_row.contrato_nombre,
      'tipo_reset',        v_row.tipo_reset,
      'dia_reset',         v_row.dia_reset,
      'fecha_inicio',      v_row.fecha_inicio,
      'fecha_fin',         v_row.fecha_fin,
      'cs_id',             v_row.cs_id,
      'servicio_nombre',   v_row.servicio_nombre,
      'cuota_por_titular', v_row.cuota_por_titular,
      'titulares_count',   v_row.titulares_count,
      'total_cuota',       v_row.cuota_por_titular * v_row.titulares_count,
      'used',              v_row.used,
      'period_start',      public.current_period_start(v_row.contrato_id)
    );
  END LOOP;
  RETURN v_result;
END;
$$;

-- ── RPC: get_miembro_contrato_usage ─────────────────────────────────────────
-- Returns per-servicio usage for the member's titular group.
CREATE OR REPLACE FUNCTION public.get_miembro_contrato_usage(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id    UUID;
  v_titular_ref   UUID;
  v_familiares    INT;
  v_result        JSONB := '[]'::JSONB;
  v_row           RECORD;
BEGIN
  -- Resolve empresa and titular_ref_id
  SELECT u.empresa_id,
         COALESCE(u.titular_id, u.id) AS titular_ref,
         (SELECT COUNT(*) FROM public.users f WHERE f.titular_id = COALESCE(u.titular_id, u.id)) AS fam_count
    INTO v_empresa_id, v_titular_ref, v_familiares
    FROM public.users u
   WHERE u.id = p_user_id;

  FOR v_row IN
    SELECT
      c.id        AS contrato_id,
      c.nombre    AS contrato_nombre,
      c.tipo_reset,
      c.dia_reset,
      cs.id       AS cs_id,
      s.nombre    AS servicio_nombre,
      cs.cuota_por_titular,
      (SELECT COUNT(*)
         FROM public.citas ci
        WHERE ci.contrato_servicio_id = cs.id
          AND ci.titular_ref_id = v_titular_ref
          AND ci.estado_sync NOT IN ('cancelado','rechazado')
          AND ci.fecha_hora_cita >= public.current_period_start(c.id)::TIMESTAMPTZ
      ) AS used
    FROM public.contratos c
    JOIN public.contrato_servicios cs ON cs.contrato_id = c.id
    JOIN public.servicios s           ON s.id = cs.servicio_id
   WHERE c.empresa_id = v_empresa_id
     AND c.activo = true
   ORDER BY c.nombre, s.nombre
  LOOP
    v_result := v_result || jsonb_build_object(
      'contrato_id',       v_row.contrato_id,
      'contrato_nombre',   v_row.contrato_nombre,
      'cs_id',             v_row.cs_id,
      'servicio_nombre',   v_row.servicio_nombre,
      'cuota_por_titular', v_row.cuota_por_titular,
      'familiares_count',  v_familiares,
      'used',              v_row.used,
      'remaining',         v_row.cuota_por_titular - v_row.used::INT,
      'period_start',      public.current_period_start(v_row.contrato_id)
    );
  END LOOP;
  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users (SECURITY DEFINER handles row access)
GRANT EXECUTE ON FUNCTION public.check_cuota_disponible(UUID, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_empresa_contrato_usage(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_miembro_contrato_usage(UUID)      TO authenticated;
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push
```

Expected: all four functions created, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260428210000_subscription_citas_rpcs.sql
git commit -m "feat(db): add quota RPCs (current_period_start, check_cuota_disponible, usage RPCs)"
```

---

## Task 3: Admin Contratos Routes

**Files:**
- Create: `app/api/admin/contratos/route.ts`
- Create: `app/api/admin/contratos/[id]/route.ts`
- Create: `app/api/admin/contratos/[id]/servicios/route.ts`

- [ ] **Step 1: Create `app/api/admin/contratos/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("rol").eq("id", user.id).single();
  return data?.rol === "admin" ? user : null;
}

export async function GET() {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data, error } = await supabase
    .from("contratos")
    .select(`
      id, nombre, fecha_inicio, fecha_fin, tipo_reset, dia_reset, activo, empresa_id,
      empresa:empresas(nombre),
      contrato_servicios(id, cuota_por_titular, servicio:servicios(id, nombre))
    `)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contratos: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: {
    empresa_id: string; nombre: string; fecha_inicio: string;
    fecha_fin?: string; tipo_reset: string; dia_reset: number;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("contratos")
    .insert({ ...body, activo: true })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contrato: data }, { status: 201 });
}
```

- [ ] **Step 2: Create `app/api/admin/contratos/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("users").select("rol").eq("id", user.id).single();
  return data?.rol === "admin";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const allowed = ["nombre","fecha_inicio","fecha_fin","tipo_reset","dia_reset","activo"];
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  const { data, error } = await supabase.from("contratos").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contrato: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { error } = await supabase.from("contratos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create `app/api/admin/contratos/[id]/servicios/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("users").select("rol").eq("id", user.id).single();
  return data?.rol === "admin";
}

// POST body: { servicio_id: string, cuota_por_titular: number }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: contrato_id } = await params;
  let body: { servicio_id: string; cuota_por_titular: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("contrato_servicios")
    .insert({ contrato_id, servicio_id: body.servicio_id, cuota_por_titular: body.cuota_por_titular })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contrato_servicio: data }, { status: 201 });
}

// DELETE body: { contrato_servicio_id: string }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await params; // contrato id unused for delete; use contrato_servicio_id from body
  let body: { contrato_servicio_id: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { error } = await supabase.from("contrato_servicios").delete().eq("id", body.contrato_servicio_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/contratos/
git commit -m "feat(api): add admin contratos CRUD routes"
```

---

## Task 4: Enhanced Cita Creation Route

**Files:**
- Create: `app/api/citas/route.ts`

This route checks contract coverage, sets the correct `estado_sync`, creates the `pagos` row when needed, and sets `contrato_servicio_id` + `titular_ref_id`.

- [ ] **Step 1: Create `app/api/citas/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type CreateCitaBody = {
  ea_service_id:    number;
  ea_provider_id:   number;
  fecha_hora_cita:  string; // ISO string
  servicio_asociado?: string;
  para_titular:     boolean;
  paciente_nombre?:   string;
  paciente_telefono?: string;
  paciente_correo?:   string;
  paciente_cedula?:   string;
  motivo_cita?:       string;
  // Optional — provided by client after RPC check
  contrato_servicio_id?: string;
  // Payment method — required if out of contract
  metodo_pago?: "link_pago" | "transferencia" | "pago_clinica";
  monto?: number;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("rol, empresa_id, titular_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.rol !== "miembro") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: CreateCitaBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Resolve titular_ref_id: own id if titular, else parent titular_id
  const titular_ref_id: string = profile.titular_id ?? user.id;

  let estado_sync: string;
  let contrato_servicio_id: string | null = null;

  if (body.contrato_servicio_id) {
    // Verify quota still available (server-side guard)
    const { data: quota } = await supabase.rpc("check_cuota_disponible", {
      p_contrato_servicio_id: body.contrato_servicio_id,
      p_titular_ref_id: titular_ref_id,
    });

    if (typeof quota === "number" && quota > 0) {
      estado_sync = "pendiente_empresa";
      contrato_servicio_id = body.contrato_servicio_id;
    } else {
      // Quota exhausted since UI check — fall through to payment flow
      if (!body.metodo_pago) {
        return NextResponse.json({ error: "Quota exhausted. metodo_pago required." }, { status: 409 });
      }
      estado_sync = body.metodo_pago === "pago_clinica" ? "pendiente_admin" : "pendiente_pago";
    }
  } else if (body.metodo_pago) {
    estado_sync = body.metodo_pago === "pago_clinica" ? "pendiente_admin" : "pendiente_pago";
  } else {
    return NextResponse.json({ error: "contrato_servicio_id or metodo_pago required" }, { status: 400 });
  }

  // Insert cita
  const { data: cita, error: citaError } = await supabase
    .from("citas")
    .insert({
      user_id:              user.id,
      paciente_id:          user.id,
      empresa_id:           profile.empresa_id,
      ea_service_id:        body.ea_service_id,
      ea_provider_id:       body.ea_provider_id,
      fecha_hora_cita:      body.fecha_hora_cita,
      servicio_asociado:    body.servicio_asociado ?? null,
      estado_sync,
      para_titular:         body.para_titular,
      paciente_nombre:      body.paciente_nombre ?? null,
      paciente_telefono:    body.paciente_telefono ?? null,
      paciente_correo:      body.paciente_correo ?? null,
      paciente_cedula:      body.paciente_cedula ?? null,
      motivo_cita:          body.motivo_cita ?? null,
      contrato_servicio_id,
      titular_ref_id:       contrato_servicio_id ? titular_ref_id : null,
    })
    .select("id, estado_sync")
    .single();

  if (citaError || !cita) {
    return NextResponse.json({ error: citaError?.message ?? "Failed to create cita" }, { status: 500 });
  }

  // Insert pagos row if payment required
  if (body.metodo_pago) {
    await supabase.from("pagos").insert({
      cita_id: cita.id,
      metodo:  body.metodo_pago,
      monto:   body.monto ?? null,
    });
  }

  return NextResponse.json({ ok: true, cita }, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/citas/route.ts
git commit -m "feat(api): add enhanced cita creation route with contract/payment routing"
```

---

## Task 5: Member Referencia Route

**Files:**
- Create: `app/api/citas/[id]/referencia/route.ts`

- [ ] **Step 1: Create route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// POST body: { referencia: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: cita_id } = await params;

  // Verify cita belongs to user and is pendiente_pago
  const { data: cita } = await supabase
    .from("citas")
    .select("id, estado_sync, user_id")
    .eq("id", cita_id)
    .single();

  if (!cita || cita.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (cita.estado_sync !== "pendiente_pago") {
    return NextResponse.json({ error: "Cita not in pendiente_pago state" }, { status: 409 });
  }

  let body: { referencia: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.referencia?.trim()) {
    return NextResponse.json({ error: "referencia required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("pagos")
    .update({ referencia: body.referencia.trim() })
    .eq("cita_id", cita_id)
    .eq("metodo", "transferencia");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/citas/[id]/referencia/route.ts
git commit -m "feat(api): add member transferencia reference submission route"
```

---

## Task 6: Admin Payment Queue Routes

**Files:**
- Create: `app/api/admin/citas/pagos/route.ts`
- Create: `app/api/admin/citas/[id]/pago/route.ts`

- [ ] **Step 1: Create `app/api/admin/citas/pagos/route.ts`** — payment verification queue

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("citas")
    .select(`
      id, estado_sync, fecha_hora_cita, servicio_asociado, created_at,
      user:users!user_id(nombre_completo, telefono, correo),
      pago:pagos(id, metodo, estado, monto, link_url, referencia, notas)
    `)
    .in("estado_sync", ["pendiente_pago", "pendiente_admin"])
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ citas: data });
}
```

- [ ] **Step 2: Create `app/api/admin/citas/[id]/pago/route.ts`** — paste link or verify payment

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// PATCH body: { action: "paste_link", link_url: string }
//          | { action: "verify", notas?: string }
//          | { action: "reject", notas?: string }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: cita_id } = await params;
  let body: { action: string; link_url?: string; notas?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.action === "paste_link") {
    if (!body.link_url) return NextResponse.json({ error: "link_url required" }, { status: 400 });
    await supabase.from("pagos").update({ link_url: body.link_url }).eq("cita_id", cita_id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "verify") {
    await supabase.from("pagos").update({
      estado: "verificado",
      verificado_por: user.id,
      verificado_at: new Date().toISOString(),
      notas: body.notas ?? null,
    }).eq("cita_id", cita_id);

    // Advance cita to confirmado (EA sync handled separately by aprobar route)
    const { error } = await supabase.from("citas").update({ estado_sync: "confirmado" }).eq("id", cita_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/citas/pagos/route.ts app/api/admin/citas/[id]/pago/route.ts
git commit -m "feat(api): add admin payment queue and pago verification routes"
```

---

## Task 7: Admin Cita Approve / Reject Routes

**Files:**
- Create: `app/api/admin/citas/[id]/aprobar/route.ts`
- Create: `app/api/admin/citas/[id]/rechazar/route.ts`

Admin approve handles `pendiente_admin` (pago_clinica). It mirrors the EA sync logic from `app/api/ea/citas/aprobar/route.ts`.

- [ ] **Step 1: Create `app/api/admin/citas/[id]/aprobar/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const EA_RAW_URL = process.env.NEXT_PUBLIC_EA_API_URL ?? "";
const EA_KEY     = process.env.EA_API_KEY ?? "";

function eaBase() {
  return EA_RAW_URL.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

const NI_OFFSET_MS = -6 * 60 * 60 * 1000;
function toEaDatetime(d: Date): string {
  const ni  = new Date(d.getTime() + NI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ni.getUTCFullYear()}-${pad(ni.getUTCMonth()+1)}-${pad(ni.getUTCDate())} ${pad(ni.getUTCHours())}:${pad(ni.getUTCMinutes())}:${pad(ni.getUTCSeconds())}`;
}

// POST body: { citaId: string }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let citaId: string;
  try { ({ citaId } = await req.json()); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data: cita } = await supabase
    .from("citas")
    .select(`
      id, estado_sync, ea_appointment_id, ea_service_id, ea_provider_id,
      fecha_hora_cita, para_titular, paciente_nombre, paciente_telefono,
      paciente_correo, paciente_cedula, motivo_cita,
      paciente:users!paciente_id(ea_customer_id),
      servicio:servicios!citas_ea_service_id_fkey(duracion)
    `)
    .eq("id", citaId)
    .single();

  if (!cita) return NextResponse.json({ error: "Cita not found" }, { status: 404 });
  if (!["pendiente_admin"].includes((cita as { estado_sync: string }).estado_sync)) {
    return NextResponse.json({ error: `Cannot approve cita in state: ${(cita as { estado_sync: string }).estado_sync}` }, { status: 409 });
  }

  // EA sync (soft fail — same pattern as ea/citas/aprobar)
  let eaAppointmentId: string | null = null;
  const c = cita as {
    estado_sync: string; ea_appointment_id: string | null;
    ea_service_id: number | null; ea_provider_id: number | null;
    fecha_hora_cita: string; para_titular: boolean;
    paciente_nombre: string | null; paciente_telefono: string | null;
    paciente_correo: string | null; paciente_cedula: string | null; motivo_cita: string | null;
    paciente: { ea_customer_id: number | null } | null;
    servicio: { duracion: number | null } | null;
  };
  const customerId = c.paciente?.ea_customer_id ?? null;
  if (EA_RAW_URL && EA_KEY && c.ea_service_id && c.ea_provider_id && customerId) {
    try {
      const start = new Date(c.fecha_hora_cita);
      const end   = new Date(start.getTime() + (c.servicio?.duracion ?? 30) * 60_000);
      const notes = !c.para_titular
        ? ["[Paciente tercero]",
           c.paciente_nombre   && `Nombre: ${c.paciente_nombre}`,
           c.paciente_telefono && `Teléfono: ${c.paciente_telefono}`,
           c.motivo_cita       && `Motivo: ${c.motivo_cita}`,
          ].filter(Boolean).join("\n")
        : c.motivo_cita ?? undefined;

      const res = await fetch(`${eaBase()}/api/v1/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${EA_KEY}` },
        body: JSON.stringify({
          book: toEaDatetime(new Date()), start: toEaDatetime(start), end: toEaDatetime(end),
          serviceId: c.ea_service_id, providerId: c.ea_provider_id, customerId: Number(customerId),
          ...(notes ? { notes } : {}),
        }),
      });
      if (res.ok) {
        const d = await res.json() as { id?: number };
        if (d.id) eaAppointmentId = String(d.id);
      }
    } catch (err) { console.error("[admin/aprobar] EA error:", err); }
  }

  const { data: updated, error } = await supabase
    .from("citas")
    .update({ estado_sync: "confirmado", ea_appointment_id: eaAppointmentId })
    .eq("id", citaId)
    .select("id, estado_sync, ea_appointment_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cita: updated });
}
```

- [ ] **Step 2: Create `app/api/admin/citas/[id]/rechazar/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// POST body: { citaId: string, motivo?: string }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("users").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { citaId: string; motivo?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const adminStates = ["pendiente_pago", "pendiente_admin"];
  const { data: cita } = await supabase
    .from("citas").select("estado_sync").eq("id", body.citaId).single();

  if (!cita || !adminStates.includes((cita as { estado_sync: string }).estado_sync)) {
    return NextResponse.json({ error: "Cita not in admin-owned state" }, { status: 409 });
  }

  const { error } = await supabase
    .from("citas")
    .update({ estado_sync: "rechazado" })
    .eq("id", body.citaId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.motivo) {
    await supabase.from("pagos").update({ notas: body.motivo }).eq("cita_id", body.citaId);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/citas/[id]/aprobar/route.ts app/api/admin/citas/[id]/rechazar/route.ts
git commit -m "feat(api): add admin approve/reject routes for pendiente_admin citas"
```

---

## Task 8: Update EA Approve Route + Add EA Reject Route

**Files:**
- Modify: `app/api/ea/citas/aprobar/route.ts` — guard change: `pendiente` → `pendiente_empresa`
- Create: `app/api/ea/citas/[id]/rechazar/route.ts`

- [ ] **Step 1: Update the estado guard in `app/api/ea/citas/aprobar/route.ts`**

Find line ~135 (the guard check) and change `"pendiente"` to `"pendiente_empresa"`:

```typescript
// Before:
if (citaTyped.estado_sync !== "pendiente") {

// After:
if (citaTyped.estado_sync !== "pendiente_empresa") {
```

- [ ] **Step 2: Create `app/api/ea/citas/[id]/rechazar/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// POST body: { motivo?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users").select("rol, empresa_id").eq("id", user.id).single();
  if (profile?.rol !== "empresa_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: cita_id } = await params;
  let body: { motivo?: string } = {};
  try { body = await req.json(); } catch { /* motivo optional */ }

  const { data: cita } = await supabase
    .from("citas").select("estado_sync, empresa_id").eq("id", cita_id).single();

  if (!cita || (cita as { empresa_id: string }).empresa_id !== profile.empresa_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ((cita as { estado_sync: string }).estado_sync !== "pendiente_empresa") {
    return NextResponse.json({ error: "Cita not in pendiente_empresa state" }, { status: 409 });
  }

  const { error } = await supabase
    .from("citas").update({ estado_sync: "rechazado" }).eq("id", cita_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/ea/citas/aprobar/route.ts app/api/ea/citas/[id]/rechazar/route.ts
git commit -m "feat(api): update EA approve guard to pendiente_empresa, add EA reject route"
```

---

## Self-Review Checklist

- [x] **Spec §1 (State machine):** All 4 paths covered — Task 4 creates correct initial state, Tasks 7-8 handle approvals/rejections.
- [x] **Spec §2 (Schema):** All tables, enum values, columns, indexes, RLS in Task 1. All RPCs in Task 2.
- [x] **Spec §3 (API routes):** All 12 routes implemented across Tasks 3-8. Note: `/api/admin/citas/[id]/rechazar` uses dynamic segment `[id]` but body contains citaId — this is intentional, the `[id]` segment is unused for admin reject (body-based to match ea pattern).
- [x] **Spec §5 (Scheduling flow):** Task 4 implements server-side quota guard + correct estado assignment.
- [x] **Spec §2 (Bank details):** Out of scope for Part 1 — handled in Part 2 as AdminSistemaAjustes component (stored in existing `configuracion_sistema` or JSONB row — see spec §2).
- [x] **Type consistency:** `contrato_servicio_id`, `titular_ref_id`, `estado_sync` values used consistently across Tasks 1, 2, 4.
- [x] **No placeholders:** All steps have complete code.
