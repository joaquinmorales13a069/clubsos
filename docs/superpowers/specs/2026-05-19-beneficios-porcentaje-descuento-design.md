# Design: Porcentaje de Descuento en Beneficios

**Date:** 2026-05-19
**Status:** Approved

## Summary

Agregar soporte para mostrar el porcentaje de descuento en beneficios de tipo `"descuento"`. El dato se guarda como texto libre en la base de datos y se muestra como badge en la card del miembro y como texto resaltado en el modal de detalle.

---

## 1. Data Layer

### Migration

New nullable column on the `beneficios` table:

```sql
ALTER TABLE beneficios
  ADD COLUMN porcentaje_descuento TEXT NULL;
```

No index required — display-only field, not used in filtering or sorting.

### TypeScript Types

Add `porcentaje_descuento: string | null` to all types that model a beneficio row:

- `BeneficioRow` in `BeneficioCard.tsx`
- `BeneficioDetailData` in `BeneficioDetailModal.tsx`
- `BeneficioRow` (admin) in `AdminBeneficios.tsx`

Queries that `SELECT` beneficio columns must include `porcentaje_descuento`.

---

## 2. Admin Form (`BeneficioFormModal`)

- Add an optional text input for `porcentaje_descuento`.
- Input is **only visible** when `tipo_beneficio === 'descuento'`.
- Not required — an empty value is valid (badge fallback applies).
- Placeholder: `"ej. 25 o hasta 30%"`.
- When the admin switches `tipo_beneficio` to `"promocion"`, clear the field and submit `null`.

---

## 3. Card Badge (`BeneficioCard`)

Badge display logic (color and style unchanged — only the label changes):

| Condition | Badge label |
|---|---|
| `tipo === 'descuento'` + `porcentaje_descuento` is pure digits (e.g. `"25"`) | `"25%"` |
| `tipo === 'descuento'` + `porcentaje_descuento` contains text (e.g. `"hasta 30%"`) | `"hasta 30%"` |
| `tipo === 'descuento'` + no `porcentaje_descuento` | `"Descuento"` (current behavior) |
| `tipo === 'promocion'` | `"Promoción"` (unchanged) |

Helper: `isOnlyDigits(value: string): boolean` — `return /^\d+$/.test(value)`.

---

## 4. Detail Modal (`BeneficioDetailModal`)

- When `tipo_beneficio === 'descuento'` and `porcentaje_descuento` is present, render the value as a `<p>` with large, bold styling (e.g. `text-2xl font-bold text-[#CD2129]`) positioned between the title and the description.
- Same formatting rule as the badge (pure digits → append `%`, mixed text → as-is).
- When `porcentaje_descuento` is absent, the section does not render.
- `tipo === 'promocion'`: no changes.

---

## Files to Touch

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_add_porcentaje_descuento_beneficios.sql` | New migration |
| `components/dashboard/admin/BeneficioFormModal.tsx` | Conditional input |
| `components/dashboard/admin/AdminBeneficios.tsx` | Type update + include column in SELECT |
| `components/dashboard/miembro/beneficios/BeneficioCard.tsx` | Badge logic + type update |
| `components/dashboard/miembro/beneficios/BeneficioDetailModal.tsx` | Highlighted display + type update |
| `components/dashboard/miembro/beneficios/BeneficiosGrid.tsx` | Include `porcentaje_descuento` in `BeneficioRow` type and ensure it is fetched + passed to `BeneficioCard` |
| `messages/es.json` + `messages/en.json` | Any new i18n keys |

---

## Out of Scope

- Admin table column for percentage (not requested).
- `RecentBeneficiosCard` on dashboard home (not requested).
- Input validation beyond placeholder guidance (no required rule, no max length enforcement).
- Numeric storage or arithmetic on the percentage value.
