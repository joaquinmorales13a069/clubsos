# Beneficios — Porcentaje de Descuento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the discount percentage on benefit cards (badge) and detail modals (highlighted text) for benefits of type `"descuento"`, with the admin able to set the value when creating or editing a benefit.

**Architecture:** A single nullable `TEXT` column `porcentaje_descuento` is added to the `beneficios` table. The admin form reveals an optional text input when `tipo_beneficio === "descuento"`. On the member side, the card badge shows the percentage (appending `%` for pure digit values) and falls back to `"Descuento"` when the field is empty; the detail modal renders the value as a large bold `<p>` between the title and description.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase (Postgres) · Tailwind CSS v4 · next-intl · sonner (toasts)

---

## File Map

| File | Change |
|---|---|
| `supabase/migrations/20260519120000_add_porcentaje_descuento_beneficios.sql` | **Create** — adds the new column |
| `messages/es.json` | **Modify** — add `fieldPorcentaje` i18n key |
| `messages/en.json` | **Modify** — add `fieldPorcentaje` i18n key |
| `components/dashboard/miembro/beneficios/BeneficioCard.tsx` | **Modify** — type + badge logic |
| `components/dashboard/miembro/beneficios/BeneficioDetailModal.tsx` | **Modify** — type + highlight block |
| `components/dashboard/miembro/beneficios/BeneficiosGrid.tsx` | **Modify** — add column to select string |
| `app/[locale]/(dashboard)/dashboard/beneficios/page.tsx` | **Modify** — add column to select string |
| `components/dashboard/admin/AdminBeneficios.tsx` | **Modify** — type update (select uses `*`, no string change) |
| `components/dashboard/admin/BeneficioFormModal.tsx` | **Modify** — form state + payload + conditional input |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260519120000_add_porcentaje_descuento_beneficios.sql`

- [ ] **Step 1.1 — Create migration file**

```sql
-- supabase/migrations/20260519120000_add_porcentaje_descuento_beneficios.sql
ALTER TABLE beneficios
  ADD COLUMN IF NOT EXISTS porcentaje_descuento TEXT NULL;
```

- [ ] **Step 1.2 — Commit**

```bash
git add supabase/migrations/20260519120000_add_porcentaje_descuento_beneficios.sql
git commit -m "feat(beneficios): add porcentaje_descuento column to beneficios"
```

---

## Task 2: i18n Keys

**Files:**
- Modify: `messages/es.json`
- Modify: `messages/en.json`

- [ ] **Step 2.1 — Add key to `messages/es.json`**

Inside `Dashboard.admin.beneficios.modal`, after the `"fieldImagen"` line:

```json
"fieldPorcentaje": "Porcentaje de descuento (opcional)",
```

- [ ] **Step 2.2 — Add key to `messages/en.json`**

Inside `Dashboard.admin.beneficios.modal`, after the `"fieldImagen"` line:

```json
"fieldPorcentaje": "Discount percentage (optional)",
```

- [ ] **Step 2.3 — Commit**

```bash
git add messages/es.json messages/en.json
git commit -m "feat(beneficios): add fieldPorcentaje i18n key"
```

---

## Task 3: TypeScript Types + Select Queries

**Files:**
- Modify: `components/dashboard/miembro/beneficios/BeneficioCard.tsx` (line 13–21)
- Modify: `components/dashboard/miembro/beneficios/BeneficioDetailModal.tsx` (line 8–16)
- Modify: `components/dashboard/admin/AdminBeneficios.tsx` (line 30–43)
- Modify: `components/dashboard/miembro/beneficios/BeneficiosGrid.tsx` (line 50)
- Modify: `app/[locale]/(dashboard)/dashboard/beneficios/page.tsx` (line 22)

- [ ] **Step 3.1 — Update `BeneficioRow` in `BeneficioCard.tsx`**

Replace lines 13–21:

```typescript
export type BeneficioRow = {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  tipo_beneficio: "descuento" | "promocion";
  beneficio_image_url: string | null;
  porcentaje_descuento: string | null;
};
```

- [ ] **Step 3.2 — Update `BeneficioDetailData` in `BeneficioDetailModal.tsx`**

Replace lines 8–16:

```typescript
export type BeneficioDetailData = {
  titulo: string;
  descripcion: string | null;
  fecha_fin: string | null;
  fecha_inicio?: string | null;
  tipo_beneficio: "descuento" | "promocion";
  beneficio_image_url: string | null;
  estado_beneficio?: "activa" | "expirada";
  porcentaje_descuento?: string | null;
};
```

- [ ] **Step 3.3 — Update `BeneficioRow` in `AdminBeneficios.tsx`**

Replace lines 30–43:

```typescript
export type BeneficioRow = {
  id:                   string;
  titulo:               string;
  descripcion:          string | null;
  fecha_inicio:         string | null;
  fecha_fin:            string | null;
  estado_beneficio:     "activa" | "expirada";
  tipo_beneficio:       "descuento" | "promocion";
  empresa_id:           string[] | null;
  beneficio_image_url:  string | null;
  creado_por:           string | null;
  created_at:           string;
  creado_por_user:      { nombre_completo: string } | null;
  porcentaje_descuento: string | null;
};
```

- [ ] **Step 3.4 — Update select in `BeneficiosGrid.tsx`**

Replace line 50:

```typescript
        .select("id, titulo, descripcion, fecha_inicio, fecha_fin, tipo_beneficio, beneficio_image_url, porcentaje_descuento", {
```

- [ ] **Step 3.5 — Update select in `beneficios/page.tsx`**

Replace line 22:

```typescript
    .select("id, titulo, descripcion, fecha_inicio, fecha_fin, tipo_beneficio, beneficio_image_url, porcentaje_descuento", {
```

- [ ] **Step 3.6 — Type-check**

```bash
pnpm build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3.7 — Commit**

```bash
git add \
  components/dashboard/miembro/beneficios/BeneficioCard.tsx \
  components/dashboard/miembro/beneficios/BeneficioDetailModal.tsx \
  components/dashboard/admin/AdminBeneficios.tsx \
  components/dashboard/miembro/beneficios/BeneficiosGrid.tsx \
  "app/[locale]/(dashboard)/dashboard/beneficios/page.tsx"
git commit -m "feat(beneficios): add porcentaje_descuento to types and select queries"
```

---

## Task 4: Card Badge Logic (`BeneficioCard`)

**Files:**
- Modify: `components/dashboard/miembro/beneficios/BeneficioCard.tsx` (lines 93–102)

The badge currently shows `t(config.labelKey)` for all types. For `"descuento"` benefits with a percentage, replace that label with the formatted percentage.

- [ ] **Step 4.1 — Update badge text inside the `<span>` (lines 93–102)**

Replace the badge `<span>` block:

```tsx
        {/* Tipo badge overlaid on image */}
        <span
          className={cn(
            "absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm",
            config.badge,
          )}
        >
          <Icon className="w-3 h-3" />
          {beneficio.tipo_beneficio === "descuento" && beneficio.porcentaje_descuento
            ? /^\d+$/.test(beneficio.porcentaje_descuento)
              ? `${beneficio.porcentaje_descuento}%`
              : beneficio.porcentaje_descuento
            : t(config.labelKey)}
        </span>
```

- [ ] **Step 4.2 — Type-check**

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 4.3 — Commit**

```bash
git add components/dashboard/miembro/beneficios/BeneficioCard.tsx
git commit -m "feat(beneficios): show porcentaje_descuento as badge on discount cards"
```

---

## Task 5: Modal Highlight (`BeneficioDetailModal`)

**Files:**
- Modify: `components/dashboard/miembro/beneficios/BeneficioDetailModal.tsx` (after line 106)

The modal body currently has: badge+title `<div>` → description `<p>`. Insert the percentage highlight between them.

- [ ] **Step 5.1 — Add highlight block after the title `<div>` (after line 106)**

In the `{/* Body */}` section, after the closing `</div>` of the title row (the one with `space-y-2` containing the badge and `<h2>`), and before the description `<p>`, insert:

```tsx
          {/* Porcentaje de descuento */}
          {beneficio.tipo_beneficio === "descuento" && beneficio.porcentaje_descuento && (
            <p className="font-poppins font-bold text-2xl text-[#CD2129]">
              {/^\d+$/.test(beneficio.porcentaje_descuento)
                ? `${beneficio.porcentaje_descuento}%`
                : beneficio.porcentaje_descuento}
            </p>
          )}
```

The resulting body order will be:
1. Title row div (badge pill + `<h2>`)
2. Porcentaje highlight `<p>` *(new)*
3. Description `<p>`
4. Dates block
5. Estado badge (admin only)
6. Close button

- [ ] **Step 5.2 — Type-check**

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 5.3 — Commit**

```bash
git add components/dashboard/miembro/beneficios/BeneficioDetailModal.tsx
git commit -m "feat(beneficios): show porcentaje_descuento as highlighted text in detail modal"
```

---

## Task 6: Admin Form Field (`BeneficioFormModal`)

**Files:**
- Modify: `components/dashboard/admin/BeneficioFormModal.tsx`

Four changes in this file: `FormState` type, `DEFAULT_FORM`, `useEffect` sync, tipo `onChange`, the conditional input JSX, and the submit payload.

- [ ] **Step 6.1 — Add `porcentaje_descuento` to `FormState` (lines 79–87)**

Replace the `FormState` type:

```typescript
type FormState = {
  titulo:               string;
  descripcion:          string;
  tipo_beneficio:       "descuento" | "promocion";
  estado_beneficio:     "activa" | "expirada";
  fecha_inicio:         string;
  fecha_fin:            string;
  empresa_ids:          string[];
  porcentaje_descuento: string;
};
```

- [ ] **Step 6.2 — Add field to `DEFAULT_FORM` (lines 89–97)**

Replace `DEFAULT_FORM`:

```typescript
const DEFAULT_FORM: FormState = {
  titulo:               "",
  descripcion:          "",
  tipo_beneficio:       "descuento",
  estado_beneficio:     "activa",
  fecha_inicio:         "",
  fecha_fin:            "",
  empresa_ids:          [],
  porcentaje_descuento: "",
};
```

- [ ] **Step 6.3 — Sync field in `useEffect` (lines 117–128)**

In the `useEffect` where `beneficio` is loaded, add `porcentaje_descuento` to the `setForm` call:

```typescript
        setForm({
          titulo:               beneficio.titulo,
          descripcion:          beneficio.descripcion ?? "",
          tipo_beneficio:       beneficio.tipo_beneficio,
          estado_beneficio:     beneficio.estado_beneficio,
          fecha_inicio:         toDateInput(beneficio.fecha_inicio),
          fecha_fin:            toDateInput(beneficio.fecha_fin),
          empresa_ids:          beneficio.empresa_id ?? [],
          porcentaje_descuento: beneficio.porcentaje_descuento ?? "",
        });
```

- [ ] **Step 6.4 — Clear porcentaje when tipo changes to "promocion"**

In the tipo `<select>` `onChange` (around line 312), replace:

```tsx
onChange={(e) => setForm({ ...form, tipo_beneficio: e.target.value as "descuento" | "promocion" })}
```

With:

```tsx
onChange={(e) => {
  const newTipo = e.target.value as "descuento" | "promocion";
  setForm({
    ...form,
    tipo_beneficio:       newTipo,
    porcentaje_descuento: newTipo === "promocion" ? "" : form.porcentaje_descuento,
  });
}}
```

- [ ] **Step 6.5 — Add conditional input JSX**

In the left column, after the closing `</div>` of the Tipo + Estado grid (around line 330) and before the Fechas grid, insert:

```tsx
                {/* Porcentaje de descuento — only visible for descuento type */}
                {form.tipo_beneficio === "descuento" && (
                  <FormField label={t("fieldPorcentaje")}>
                    <input
                      type="text"
                      maxLength={20}
                      value={form.porcentaje_descuento}
                      onChange={(e) => setForm({ ...form, porcentaje_descuento: e.target.value })}
                      placeholder="ej. 25 o hasta 30%"
                      className={inputCls}
                    />
                  </FormField>
                )}
```

- [ ] **Step 6.6 — Add field to submit payload (lines 206–215)**

Replace the `payload` constant:

```typescript
      const payload = {
        titulo:               form.titulo.trim(),
        descripcion:          form.descripcion.trim() || null,
        tipo_beneficio:       form.tipo_beneficio,
        estado_beneficio:     form.estado_beneficio,
        fecha_inicio:         form.fecha_inicio || null,
        fecha_fin:            form.fecha_fin    || null,
        empresa_id:           form.empresa_ids.length > 0 ? form.empresa_ids : null,
        beneficio_image_url:  finalImageUrl,
        porcentaje_descuento: form.tipo_beneficio === "descuento" && form.porcentaje_descuento.trim()
          ? form.porcentaje_descuento.trim()
          : null,
      };
```

- [ ] **Step 6.7 — Type-check**

```bash
pnpm build
```

Expected: build succeeds with no errors.

- [ ] **Step 6.8 — Commit**

```bash
git add components/dashboard/admin/BeneficioFormModal.tsx
git commit -m "feat(beneficios): add porcentaje_descuento field to admin create/edit form"
```

---

## Task 7: Apply Migration

- [ ] **Step 7.1 — Push migration to remote Supabase**

```bash
supabase db push
```

Expected output includes: `Applying migration 20260519120000_add_porcentaje_descuento_beneficios.sql`

- [ ] **Step 7.2 — Smoke test**

Start the dev server and verify:

```bash
pnpm dev
```

1. Open `/es/dashboard/beneficios` — cards load without errors.
2. Open `/es/dashboard/admin/beneficios` → create a new `"Descuento"` benefit → the `"Porcentaje de descuento (opcional)"` field appears. Enter `"25"` and save.
3. Back on the member view, the saved benefit's card badge shows `"25%"` instead of `"Descuento"`.
4. Click the card — the modal shows `25%` in large red text between the title and description.
5. Edit the benefit, change tipo to `"Promoción"` — the percentage field disappears and the value is cleared on save.
6. Create a benefit with `porcentaje_descuento = "hasta 30%"` — card badge shows `"hasta 30%"`, modal shows `"hasta 30%"` (no extra `%` appended).
7. Create a `"Descuento"` benefit without entering a percentage — card badge shows `"Descuento"` (fallback).
