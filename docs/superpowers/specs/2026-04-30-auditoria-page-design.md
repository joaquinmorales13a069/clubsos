# Auditoría del Sistema — Design Spec

**Date:** 2026-04-30
**Branch:** feat/data-log-registry
**Status:** Approved

---

## Overview

Admin-only page at `/dashboard/admin/auditoria` that displays all `audit_logs` entries with server-side pagination, column filters, and CSV export. Complements the audit logging system (table + triggers) already implemented in `20260430200000_audit_logs.sql`.

---

## Architecture

**Approach:** API route + client component (Option A). Consistent with existing admin patterns (citas, contratos, empresas all use `/api/admin/*` routes).

### Files

```
app/[locale]/(dashboard)/dashboard/admin/auditoria/
  page.tsx                        — Server Component: auth + admin role guard

app/api/admin/audit-logs/
  route.ts                        — GET handler: JSON (paginated) or CSV export

components/dashboard/admin/
  AdminAuditoria.tsx              — Client Component: orchestrates fetch, state
  AdminAuditoriaFiltros.tsx       — Filter bar (accion, entidad, fecha, actor search)
  AdminAuditoriaTabla.tsx         — Table + skeleton + expandable row detail

messages/es.json + en.json        — Keys under Dashboard.admin.auditoria.*
components/dashboard/Sidebar.tsx  — New admin nav entry: "Auditoría"
```

---

## API Route — `GET /api/admin/audit-logs`

### Auth
Calls `assertAdmin(supabase)` — same pattern as all other `/api/admin/*` routes. Returns 403 if not admin.

### Query Parameters

| Param       | Type   | Default | Description                          |
|-------------|--------|---------|--------------------------------------|
| `accion`    | string | —       | Exact match on `accion` column       |
| `entidad`   | string | —       | Exact match on `entidad` column      |
| `actor_id`  | uuid   | —       | Filter by actor user ID              |
| `desde`     | date   | —       | `YYYY-MM-DD` — `created_at >= desde` |
| `hasta`     | date   | —       | `YYYY-MM-DD` — `created_at <= hasta` |
| `page`      | int    | `0`     | Zero-based page number               |
| `page_size` | int    | `25`    | Max `100`                            |
| `format`    | string | `json`  | `json` or `csv`                      |

### JSON Response
```json
{
  "logs": [
    {
      "id": "uuid",
      "created_at": "2026-04-30T14:23:00Z",
      "actor_id": "uuid",
      "actor_nombre": "Joaquin Morales",
      "actor_rol": "admin",
      "accion": "empresa.crear",
      "entidad": "empresas",
      "entidad_id": "uuid",
      "datos_antes": null,
      "datos_despues": { "nombre": "Empresa X", "estado": "activa" },
      "ip_address": "192.168.1.1",
      "metadata": { "empresa_id": "uuid", "empresa_nombre": "Empresa X" }
    }
  ],
  "total": 342,
  "page": 0,
  "page_size": 25
}
```

### CSV Response
- `Content-Type: text/csv`
- `Content-Disposition: attachment; filename="audit-logs-YYYY-MM-DD.csv"`
- Columns: `fecha_hora, actor_nombre, actor_rol, accion, entidad, entidad_id, datos_antes, datos_despues, ip_address`
- `datos_antes` and `datos_despues` are JSON-stringified in the CSV cell.
- Same filters apply as JSON — exports the full result set (no page limit, max 5000 rows).

### SQL Query (Supabase)
```sql
SELECT al.*, u.nombre_completo as actor_nombre
FROM audit_logs al
LEFT JOIN users u ON u.id = al.actor_id
WHERE (accion = $accion OR $accion IS NULL)
  AND (entidad = $entidad OR $entidad IS NULL)
  AND (actor_id = $actor_id OR $actor_id IS NULL)
  AND (created_at >= $desde OR $desde IS NULL)
  AND (created_at <= $hasta OR $hasta IS NULL)
ORDER BY created_at DESC
LIMIT $page_size OFFSET $page * $page_size
```

---

## UI Components

### `AdminAuditoria.tsx`
- Client Component, holds: `filters` state, `page` state, `logs` data, `total`, `loading`
- Fetches on mount and on filter/page change
- Passes state down to `AdminAuditoriaFiltros` and `AdminAuditoriaTabla`
- Handles CSV export: calls same API with `?format=csv`, uses `window.location.href` to trigger browser download

### `AdminAuditoriaFiltros.tsx`
Filter bar (single row, wraps on mobile):

| Control | Type | Behavior |
|---|---|---|
| Acción | `<select>` | Options: all distinct `accion` values from a one-time fetch on mount |
| Entidad | `<select>` | Options: `citas`, `contratos`, `empresas`, `documentos_medicos`, `users` (static list) |
| Desde | `<input type="date">` | ISO date |
| Hasta | `<input type="date">` | ISO date |
| Actor (nombre) | `<input text>` | Debounced 300ms → resolves to `actor_id` via user search |
| [Limpiar] | button | Resets all filters |
| [Exportar CSV] | button | Triggers CSV download with current filters |

### `AdminAuditoriaTabla.tsx`
Table columns:

| Column | Content |
|---|---|
| Fecha/Hora | Formatted local datetime (Nicaragua UTC-6) |
| Actor | `nombre_completo` + badge with `actor_rol` |
| Acción | Colored badge (see color map below) |
| Entidad | Entity name + `entidad_id` (truncated UUID) |
| Detalle | Expand button `▼` |

**Expandable row:** Accordion inline below each row. Shows `datos_antes` and `datos_despues` side-by-side as pretty-printed JSON in a `<pre>` block with `font-mono text-xs bg-gray-50` styling. If only one side exists (create/delete), shows single column.

**Skeleton:** 8 rows of pulsing gray bars while loading.

**Empty state:** Centered icon + "No hay registros para los filtros seleccionados."

**Pagination:** `← Anterior  Página X de Y  Siguiente →` — same style as `AdminDocumentos`.

### Action Badge Color Map

| Pattern | Color |
|---|---|
| `*.crear` / `*.aprobar` / `*.subir` | green (`bg-green-100 text-green-700`) |
| `*.actualizar` / `*.activar` | blue (`bg-blue-100 text-blue-700`) |
| `*.desactivar` | amber (`bg-amber-100 text-amber-700`) |
| `*.eliminar` / `*.rechazar` | red (`bg-red-100 text-red-700`) |

---

## Sidebar Nav

Add to admin nav items in `Sidebar.tsx` (between `generarReportes` and `ajustesSistema`):

```ts
{ href: `${base}/admin/auditoria`, label: t("nav.auditoria"), icon: ShieldCheck }
```

Translation key: `nav.auditoria` → `"Auditoría"` (es) / `"Audit Log"` (en).

---

## i18n Keys

All keys under `Dashboard.admin.auditoria`:

```json
{
  "titulo": "Auditoría del Sistema",
  "subtitulo": "Registro de todas las acciones CRUD realizadas en el sistema",
  "filtros": {
    "accion": "Acción",
    "todasAcciones": "Todas las acciones",
    "entidad": "Entidad",
    "todasEntidades": "Todas las entidades",
    "desde": "Desde",
    "hasta": "Hasta",
    "actor": "Actor (nombre)",
    "limpiar": "Limpiar",
    "exportarCsv": "Exportar CSV"
  },
  "tabla": {
    "fechaHora": "Fecha / Hora",
    "actor": "Actor",
    "accion": "Acción",
    "entidad": "Entidad",
    "detalle": "Detalle",
    "antes": "Antes",
    "despues": "Después",
    "sinDatos": "—",
    "verDetalle": "Ver detalle",
    "ocultarDetalle": "Ocultar detalle"
  },
  "paginacion": {
    "anterior": "Anterior",
    "siguiente": "Siguiente",
    "pagina": "Página {page} de {total}"
  },
  "vacio": "No hay registros para los filtros seleccionados.",
  "errorCarga": "Error al cargar los registros.",
  "exportando": "Exportando..."
}
```

---

## Constraints

- Page size default: 25, max: 100
- CSV export max: 5000 rows (prevents memory issues)
- Actor search field: debounced 300ms; resolves name → `actor_id` via Supabase `users` query
- `entidad_id` displayed as first 8 chars of UUID to save space
- No delete or edit actions on audit logs — read-only UI
