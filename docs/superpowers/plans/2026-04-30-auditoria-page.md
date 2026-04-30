# Auditoría del Sistema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/dashboard/admin/auditoria` — a paginated, filterable audit log viewer with CSV export for the global admin role.

**Architecture:** API route (`GET /api/admin/audit-logs`) serves JSON (paginated) or CSV. A Client Component (`AdminAuditoria`) fetches from that endpoint and renders filters + table. Server Component page (`page.tsx`) guards auth + admin role. Postgres trigger already captures `documentos_medicos` changes; `logAction()` already wired into `contratos` and `empresas` routes.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS v4 · Supabase (server client) · next-intl · sonner (toasts) · lucide-react

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/api/admin/audit-logs/route.ts` | GET handler — JSON paginated + CSV export |
| Create | `app/[locale]/(dashboard)/dashboard/admin/auditoria/page.tsx` | Server Component auth + admin guard |
| Create | `components/dashboard/admin/AdminAuditoria.tsx` | Client Component — state, fetch orchestration |
| Create | `components/dashboard/admin/AdminAuditoriaFiltros.tsx` | Filter bar (accion, entidad, fechas, actor) |
| Create | `components/dashboard/admin/AdminAuditoriaTabla.tsx` | Table, skeleton, expandable row, pagination |
| Modify | `messages/es.json` | Add `Dashboard.admin.auditoria.*` keys |
| Modify | `messages/en.json` | Add `Dashboard.admin.auditoria.*` keys |
| Modify | `components/dashboard/Sidebar.tsx` | Add nav entry + `ShieldCheck` icon import |

---

## Task 1: API route — JSON + CSV

**Files:**
- Create: `app/api/admin/audit-logs/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// app/api/admin/audit-logs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("rol").eq("id", user.id).single();
  return data?.rol === "admin" ? user : null;
}

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX     = 100;
const CSV_ROWS_MAX      = 5000;

type LogRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_rol: string;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  datos_antes: Record<string, unknown> | null;
  datos_despues: Record<string, unknown> | null;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  actor_nombre: string | null;
};

async function resolveActorIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorSearch: string,
): Promise<string[] | null> {
  const { data } = await supabase
    .from("users")
    .select("id")
    .ilike("nombre_completo", `%${actorSearch}%`)
    .limit(50);
  return data ? data.map((u) => u.id) : null;
}

function buildQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    accion?: string;
    entidad?: string;
    actorIds?: string[];   // resolved from actorSearch by caller
    desde?: string;
    hasta?: string;
  },
) {
  let q = supabase
    .from("audit_logs")
    .select(
      `id, created_at, actor_id, actor_rol, accion, entidad, entidad_id,
       datos_antes, datos_despues, ip_address, metadata,
       actor:users!actor_id(nombre_completo)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (params.accion)               q = q.eq("accion", params.accion);
  if (params.entidad)              q = q.eq("entidad", params.entidad);
  if (params.actorIds)             q = q.in("actor_id", params.actorIds);
  if (params.desde)                q = q.gte("created_at", `${params.desde}T00:00:00Z`);
  if (params.hasta)                q = q.lte("created_at", `${params.hasta}T23:59:59Z`);

  return q;
}

function flattenRows(data: unknown[]): LogRow[] {
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id:            row.id as string,
    created_at:    row.created_at as string,
    actor_id:      row.actor_id as string | null,
    actor_rol:     row.actor_rol as string,
    accion:        row.accion as string,
    entidad:       row.entidad as string,
    entidad_id:    row.entidad_id as string | null,
    datos_antes:   row.datos_antes as Record<string, unknown> | null,
    datos_despues: row.datos_despues as Record<string, unknown> | null,
    ip_address:    row.ip_address as string | null,
    metadata:      (row.metadata ?? {}) as Record<string, unknown>,
    actor_nombre:  (row.actor as { nombre_completo?: string } | null)?.nombre_completo ?? null,
  }));
}

function rowsToCsv(rows: LogRow[]): string {
  const headers = [
    "fecha_hora", "actor_nombre", "actor_rol", "accion",
    "entidad", "entidad_id", "datos_antes", "datos_despues", "ip_address",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.created_at,
        r.actor_nombre,
        r.actor_rol,
        r.accion,
        r.entidad,
        r.entidad_id,
        r.datos_antes,
        r.datos_despues,
        r.ip_address,
      ]
        .map(escape)
        .join(","),
    ),
  ];
  return lines.join("\r\n");
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp     = req.nextUrl.searchParams;
  const format = sp.get("format") ?? "json";

  const actorSearchRaw = sp.get("actor_search") || undefined;
  let actorIds: string[] | undefined;
  if (actorSearchRaw) {
    const ids = await resolveActorIds(supabase, actorSearchRaw);
    // If search returned no matches, short-circuit with empty result
    if (!ids || ids.length === 0) {
      if (format === "csv") {
        return new NextResponse("fecha_hora,actor_nombre,actor_rol,accion,entidad,entidad_id,datos_antes,datos_despues,ip_address\r\n", {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
          },
        });
      }
      return NextResponse.json({ logs: [], total: 0, page: 0, page_size: PAGE_SIZE_DEFAULT });
    }
    actorIds = ids;
  }

  const filterParams = {
    accion:    sp.get("accion")  || undefined,
    entidad:   sp.get("entidad") || undefined,
    actorIds,
    desde:     sp.get("desde")   || undefined,
    hasta:     sp.get("hasta")   || undefined,
  };

  if (format === "csv") {
    const { data, error } = await buildQuery(supabase, filterParams)
      .limit(CSV_ROWS_MAX);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const csv      = rowsToCsv(flattenRows(data ?? []));
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // JSON paginated
  const page     = Math.max(0, parseInt(sp.get("page") ?? "0", 10));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, parseInt(sp.get("page_size") ?? String(PAGE_SIZE_DEFAULT), 10)),
  );

  const { data, count, error } = await buildQuery(supabase, filterParams)
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    logs:      flattenRows(data ?? []),
    total:     count ?? 0,
    page,
    page_size: pageSize,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | grep -E "error|Error|✓ Compiled"
```

Expected: `✓ Compiled successfully` with no type errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/audit-logs/route.ts
git commit -m "feat: add GET /api/admin/audit-logs with JSON pagination and CSV export"
```

---

## Task 2: i18n keys

**Files:**
- Modify: `messages/es.json` (insert before closing `}` of `"admin"` block, after `"sistema"` section)
- Modify: `messages/en.json` (same location)

- [ ] **Step 1: Add Spanish keys to `messages/es.json`**

Find the closing `}` of the `"sistema"` object (around line 1195 before `}` closing `"admin"`). Insert after the `"sistema"` block's closing brace:

```json
      "auditoria": {
        "titulo": "Auditoría del Sistema",
        "subtitulo": "Registro de todas las acciones realizadas en el sistema.",
        "filtros": {
          "accion": "Acción",
          "todasAcciones": "Todas las acciones",
          "entidad": "Entidad",
          "todasEntidades": "Todas las entidades",
          "desde": "Desde",
          "hasta": "Hasta",
          "actor": "Actor (nombre)",
          "limpiar": "Limpiar",
          "exportarCsv": "Exportar CSV",
          "exportando": "Exportando..."
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
          "ocultarDetalle": "Ocultar detalle",
          "pageInfo": "{from}–{to} de {total} registros",
          "anterior": "Anterior",
          "siguiente": "Siguiente"
        },
        "vacio": "No hay registros para los filtros seleccionados.",
        "errorCarga": "Error al cargar los registros de auditoría."
      }
```

- [ ] **Step 2: Add English keys to `messages/en.json`**

Same location in `en.json`, same structure:

```json
      "auditoria": {
        "titulo": "System Audit Log",
        "subtitulo": "Record of all actions performed in the system.",
        "filtros": {
          "accion": "Action",
          "todasAcciones": "All actions",
          "entidad": "Entity",
          "todasEntidades": "All entities",
          "desde": "From",
          "hasta": "To",
          "actor": "Actor (name)",
          "limpiar": "Clear",
          "exportarCsv": "Export CSV",
          "exportando": "Exporting..."
        },
        "tabla": {
          "fechaHora": "Date / Time",
          "actor": "Actor",
          "accion": "Action",
          "entidad": "Entity",
          "detalle": "Detail",
          "antes": "Before",
          "despues": "After",
          "sinDatos": "—",
          "verDetalle": "View detail",
          "ocultarDetalle": "Hide detail",
          "pageInfo": "{from}–{to} of {total} records",
          "anterior": "Previous",
          "siguiente": "Next"
        },
        "vacio": "No records found for the selected filters.",
        "errorCarga": "Error loading audit records."
      }
```

- [ ] **Step 3: Verify build still compiles**

```bash
pnpm build 2>&1 | grep -E "error|Error|✓ Compiled"
```

- [ ] **Step 4: Commit**

```bash
git add messages/es.json messages/en.json
git commit -m "feat: add auditoria i18n keys (es + en)"
```

---

## Task 3: Sidebar nav entry

**Files:**
- Modify: `components/dashboard/Sidebar.tsx`

- [ ] **Step 1: Add `ShieldCheck` to the lucide-react import**

Find the existing lucide import line (around line 17–40). Add `ShieldCheck` to it. Example — the existing import looks like:
```typescript
import {
  LayoutDashboard, CalendarDays, Gift, Megaphone, FileText,
  SlidersHorizontal, UserCog, Building2, BarChart3, Settings,
  CalendarCheck, /* … other icons … */
} from "lucide-react";
```
Add `ShieldCheck` to that list.

- [ ] **Step 2: Add nav item between `generarReportes` and `ajustesSistema`**

Find the admin nav array (around line 100–107). The current entries are:
```typescript
{ href: `${base}/admin/reportes`,   label: t("nav.generarReportes"),     icon: BarChart3 },
{ href: `${base}/admin/sistema`,    label: t("nav.ajustesSistema"),      icon: Settings },
```

Insert between them:
```typescript
{ href: `${base}/admin/reportes`,   label: t("nav.generarReportes"),     icon: BarChart3 },
{ href: `${base}/admin/auditoria`,  label: t("nav.auditoria"),           icon: ShieldCheck },
{ href: `${base}/admin/sistema`,    label: t("nav.ajustesSistema"),      icon: Settings },
```

- [ ] **Step 3: Add translation key `nav.auditoria` to both JSON files**

In `messages/es.json`, find the `"sidebar"."nav"` block (around line 143–166) and add:
```json
"auditoria": "Auditoría"
```

In `messages/en.json`, same location:
```json
"auditoria": "Audit Log"
```

- [ ] **Step 4: Verify build**

```bash
pnpm build 2>&1 | grep -E "error|Error|✓ Compiled"
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/Sidebar.tsx messages/es.json messages/en.json
git commit -m "feat: add auditoria nav entry to admin sidebar"
```

---

## Task 4: Table component — `AdminAuditoriaTabla.tsx`

**Files:**
- Create: `components/dashboard/admin/AdminAuditoriaTabla.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type AuditLogRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_nombre: string | null;
  actor_rol: string;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  datos_antes: Record<string, unknown> | null;
  datos_despues: Record<string, unknown> | null;
  ip_address: string | null;
  metadata: Record<string, unknown>;
};

interface Props {
  logs: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const NI_OFFSET_MS = -6 * 60 * 60 * 1000;

function formatDatetime(iso: string): string {
  const d   = new Date(new Date(iso).getTime() + NI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function accionBadgeClass(accion: string): string {
  if (accion.endsWith(".crear") || accion.endsWith(".aprobar") || accion.endsWith(".subir"))
    return "bg-green-100 text-green-700";
  if (accion.endsWith(".actualizar") || accion.endsWith(".activar"))
    return "bg-blue-100 text-blue-700";
  if (accion.endsWith(".desactivar"))
    return "bg-amber-100 text-amber-700";
  if (accion.endsWith(".eliminar") || accion.endsWith(".rechazar"))
    return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

function rolBadgeClass(rol: string): string {
  if (rol === "admin")         return "bg-primary/10 text-primary";
  if (rol === "empresa_admin") return "bg-secondary/10 text-secondary";
  return "bg-gray-100 text-gray-600";
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-px">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 bg-white border-b border-gray-50">
          <div className="h-4 bg-gray-100 rounded w-32" />
          <div className="h-4 bg-gray-100 rounded w-36" />
          <div className="h-4 bg-gray-100 rounded w-28" />
          <div className="h-4 bg-gray-100 rounded w-24" />
          <div className="h-4 bg-gray-100 rounded w-8 ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ── Expandable row detail ─────────────────────────────────────────────────────

function RowDetail({
  datosAntes,
  datosDespues,
  labelAntes,
  labelDespues,
}: {
  datosAntes: Record<string, unknown> | null;
  datosDespues: Record<string, unknown> | null;
  labelAntes: string;
  labelDespues: string;
}) {
  const hasBoth = datosAntes && datosDespues;
  return (
    <div className={cn("grid gap-3 p-4 bg-gray-50 border-t border-gray-100 text-xs", hasBoth ? "grid-cols-2" : "grid-cols-1")}>
      {datosAntes && (
        <div>
          <p className="font-semibold font-poppins text-gray-500 mb-1">{labelAntes}</p>
          <pre className="font-mono text-gray-700 whitespace-pre-wrap break-all bg-white rounded-lg p-3 border border-gray-100">
            {JSON.stringify(datosAntes, null, 2)}
          </pre>
        </div>
      )}
      {datosDespues && (
        <div>
          <p className="font-semibold font-poppins text-gray-500 mb-1">{labelDespues}</p>
          <pre className="font-mono text-gray-700 whitespace-pre-wrap break-all bg-white rounded-lg p-3 border border-gray-100">
            {JSON.stringify(datosDespues, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminAuditoriaTabla({ logs, total, page, pageSize, loading, onPageChange }: Props) {
  const t = useTranslations("Dashboard.admin.auditoria");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalPages = Math.ceil(total / pageSize);
  const fromItem   = total === 0 ? 0 : page * pageSize + 1;
  const toItem     = Math.min((page + 1) * pageSize, total);

  const toggleRow = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  if (loading) return <TableSkeleton />;

  if (!loading && logs.length === 0) {
    return (
      <div className="py-16 text-center text-sm font-roboto text-neutral">
        {t("vacio")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-poppins font-semibold text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {t("tabla.fechaHora")}
                </th>
                <th className="px-4 py-3 text-left font-poppins font-semibold text-xs text-gray-500 uppercase tracking-wide">
                  {t("tabla.actor")}
                </th>
                <th className="px-4 py-3 text-left font-poppins font-semibold text-xs text-gray-500 uppercase tracking-wide">
                  {t("tabla.accion")}
                </th>
                <th className="px-4 py-3 text-left font-poppins font-semibold text-xs text-gray-500 uppercase tracking-wide">
                  {t("tabla.entidad")}
                </th>
                <th className="px-4 py-3 text-center font-poppins font-semibold text-xs text-gray-500 uppercase tracking-wide w-20">
                  {t("tabla.detalle")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                const hasDetail  = log.datos_antes || log.datos_despues;
                return (
                  <Fragment key={log.id}>
                    <tr
                      className={cn(
                        "bg-white transition-colors",
                        isExpanded && "bg-gray-50/60",
                      )}
                    >
                      <td className="px-4 py-3 font-roboto text-gray-700 whitespace-nowrap text-xs">
                        {formatDatetime(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-roboto text-gray-800 font-medium text-sm">
                            {log.actor_nombre ?? t("tabla.sinDatos")}
                          </span>
                          <span className={cn(
                            "inline-block self-start text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                            rolBadgeClass(log.actor_rol),
                          )}>
                            {log.actor_rol}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-block text-xs font-semibold px-2 py-0.5 rounded-full font-roboto",
                          accionBadgeClass(log.accion),
                        )}>
                          {log.accion}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-roboto text-gray-800 text-sm">{log.entidad}</span>
                          {log.entidad_id && (
                            <span className="font-mono text-[10px] text-gray-400">
                              {log.entidad_id.slice(0, 8)}…
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hasDetail ? (
                          <button
                            type="button"
                            onClick={() => toggleRow(log.id)}
                            className="inline-flex items-center gap-1 text-xs text-secondary hover:text-secondary/80 font-roboto transition-colors"
                            aria-label={isExpanded ? t("tabla.ocultarDetalle") : t("tabla.verDetalle")}
                          >
                            {isExpanded
                              ? <ChevronUp className="w-4 h-4" />
                              : <ChevronDown className="w-4 h-4" />
                            }
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">{t("tabla.sinDatos")}</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && hasDetail && (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <RowDetail
                            datosAntes={log.datos_antes}
                            datosDespues={log.datos_despues}
                            labelAntes={t("tabla.antes")}
                            labelDespues={t("tabla.despues")}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2 text-sm font-roboto text-neutral">
        <span className="text-xs">
          {t("tabla.pageInfo", { from: fromItem, to: toItem, total })}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("tabla.anterior")}
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("tabla.siguiente")}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build 2>&1 | grep -E "error|Error|✓ Compiled"
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/admin/AdminAuditoriaTabla.tsx
git commit -m "feat: add AdminAuditoriaTabla component with skeleton, expandable rows, pagination"
```

---

## Task 5: Filter bar component — `AdminAuditoriaFiltros.tsx`

**Files:**
- Create: `components/dashboard/admin/AdminAuditoriaFiltros.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useTranslations } from "next-intl";
import { X, Download, Loader2 } from "lucide-react";

const ACCIONES = [
  "cita.aprobar", "cita.rechazar", "cita.crear", "cita.cancelar",
  "empresa.crear", "empresa.actualizar", "empresa.activar", "empresa.desactivar",
  "contrato.crear", "contrato.actualizar", "contrato.eliminar",
  "documento.subir", "documento.actualizar", "documento.eliminar",
  "usuario.activar", "usuario.desactivar", "pago.verificar",
];

const ENTIDADES = [
  "citas", "empresas", "contratos", "documentos_medicos", "users", "pagos",
];

export type AuditoriaFiltros = {
  accion:      string;
  entidad:     string;
  actorSearch: string;
  desde:       string;
  hasta:       string;
};

interface Props {
  filtros:       AuditoriaFiltros;
  exporting:     boolean;
  onFiltroChange: (key: keyof AuditoriaFiltros, value: string) => void;
  onLimpiar:     () => void;
  onExportCsv:   () => void;
}

const inputCls =
  "px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 " +
  "focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors";

export default function AdminAuditoriaFiltros({
  filtros, exporting, onFiltroChange, onLimpiar, onExportCsv,
}: Props) {
  const t = useTranslations("Dashboard.admin.auditoria.filtros");

  const hayFiltros =
    !!filtros.accion || !!filtros.entidad || !!filtros.actorSearch ||
    !!filtros.desde  || !!filtros.hasta;

  return (
    <div className="flex flex-wrap gap-3 items-end">
      {/* Acción */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <label className="text-xs font-semibold font-roboto text-gray-500 uppercase tracking-wide">
          {t("accion")}
        </label>
        <select
          value={filtros.accion}
          onChange={(e) => onFiltroChange("accion", e.target.value)}
          className={inputCls}
        >
          <option value="">{t("todasAcciones")}</option>
          {ACCIONES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Entidad */}
      <div className="flex flex-col gap-1 min-w-[150px]">
        <label className="text-xs font-semibold font-roboto text-gray-500 uppercase tracking-wide">
          {t("entidad")}
        </label>
        <select
          value={filtros.entidad}
          onChange={(e) => onFiltroChange("entidad", e.target.value)}
          className={inputCls}
        >
          <option value="">{t("todasEntidades")}</option>
          {ENTIDADES.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      {/* Desde */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold font-roboto text-gray-500 uppercase tracking-wide">
          {t("desde")}
        </label>
        <input
          type="date"
          value={filtros.desde}
          onChange={(e) => onFiltroChange("desde", e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Hasta */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold font-roboto text-gray-500 uppercase tracking-wide">
          {t("hasta")}
        </label>
        <input
          type="date"
          value={filtros.hasta}
          onChange={(e) => onFiltroChange("hasta", e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Actor search */}
      <div className="flex flex-col gap-1 min-w-[180px]">
        <label className="text-xs font-semibold font-roboto text-gray-500 uppercase tracking-wide">
          {t("actor")}
        </label>
        <input
          type="text"
          placeholder={t("actor")}
          value={filtros.actorSearch}
          onChange={(e) => onFiltroChange("actorSearch", e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pb-0.5">
        {hayFiltros && (
          <button
            type="button"
            onClick={onLimpiar}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200
                       text-sm font-roboto text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            {t("limpiar")}
          </button>
        )}
        <button
          type="button"
          onClick={onExportCsv}
          disabled={exporting}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-white
                     text-sm font-roboto font-semibold hover:bg-secondary/90 disabled:opacity-60
                     transition-colors"
        >
          {exporting
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Download className="w-3.5 h-3.5" />
          }
          {exporting ? t("exportando") : t("exportarCsv")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build 2>&1 | grep -E "error|Error|✓ Compiled"
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/admin/AdminAuditoriaFiltros.tsx
git commit -m "feat: add AdminAuditoriaFiltros component"
```

---

## Task 6: Main client component — `AdminAuditoria.tsx`

**Files:**
- Create: `components/dashboard/admin/AdminAuditoria.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import AdminAuditoriaFiltros, { type AuditoriaFiltros } from "./AdminAuditoriaFiltros";
import AdminAuditoriaTabla, { type AuditLogRow } from "./AdminAuditoriaTabla";

const PAGE_SIZE = 25;
const DEBOUNCE_MS = 300;

const FILTROS_INICIAL: AuditoriaFiltros = {
  accion:      "",
  entidad:     "",
  actorSearch: "",
  desde:       "",
  hasta:       "",
};

function buildUrl(filtros: AuditoriaFiltros, page: number, format: "json" | "csv"): string {
  const sp = new URLSearchParams();
  if (filtros.accion)      sp.set("accion",       filtros.accion);
  if (filtros.entidad)     sp.set("entidad",      filtros.entidad);
  if (filtros.actorSearch) sp.set("actor_search", filtros.actorSearch);
  if (filtros.desde)       sp.set("desde",        filtros.desde);
  if (filtros.hasta)       sp.set("hasta",        filtros.hasta);
  sp.set("page",      String(page));
  sp.set("page_size", String(PAGE_SIZE));
  sp.set("format",    format);
  return `/api/admin/audit-logs?${sp.toString()}`;
}

export default function AdminAuditoria() {
  const t = useTranslations("Dashboard.admin.auditoria");

  const [filtros,    setFiltros]    = useState<AuditoriaFiltros>(FILTROS_INICIAL);
  const [page,       setPage]       = useState(0);
  const [logs,       setLogs]       = useState<AuditLogRow[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [exporting,  setExporting]  = useState(false);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = useCallback(async (f: AuditoriaFiltros, p: number) => {
    setLoading(true);
    try {
      const res  = await fetch(buildUrl(f, p, "json"));
      if (!res.ok) throw new Error();
      const json = await res.json() as { logs: AuditLogRow[]; total: number };
      setLogs(json.logs);
      setTotal(json.total);
    } catch {
      toast.error(t("errorCarga"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Initial load
  useEffect(() => {
    fetchLogs(filtros, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch on page change (not debounced)
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchLogs(filtros, newPage);
  };

  // Re-fetch on filter change (debounced for text fields)
  const handleFiltroChange = (key: keyof AuditoriaFiltros, value: string) => {
    const next = { ...filtros, [key]: value };
    setFiltros(next);
    setPage(0);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchLogs(next, 0);
    }, key === "actorSearch" ? DEBOUNCE_MS : 0);
  };

  const handleLimpiar = () => {
    setFiltros(FILTROS_INICIAL);
    setPage(0);
    fetchLogs(FILTROS_INICIAL, 0);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const url  = buildUrl(filtros, 0, "csv");
      const res  = await fetch(url);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = href;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      toast.error(t("errorCarga"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-secondary" />
        </div>
        <div>
          <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("titulo")}</h1>
          <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitulo")}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <AdminAuditoriaFiltros
          filtros={filtros}
          exporting={exporting}
          onFiltroChange={handleFiltroChange}
          onLimpiar={handleLimpiar}
          onExportCsv={handleExportCsv}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-5">
        <AdminAuditoriaTabla
          logs={logs}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={loading}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build 2>&1 | grep -E "error|Error|✓ Compiled"
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/admin/AdminAuditoria.tsx
git commit -m "feat: add AdminAuditoria main client component"
```

---

## Task 7: Page route — Server Component

**Files:**
- Create: `app/[locale]/(dashboard)/dashboard/admin/auditoria/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminAuditoria from "@/components/dashboard/admin/AdminAuditoria";

export default async function AdminAuditoriaPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users").select("rol").eq("id", user.id).single();

  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return <AdminAuditoria />;
}
```

- [ ] **Step 2: Full production build**

```bash
pnpm build 2>&1 | tail -30
```

Expected: build succeeds, new route `/[locale]/dashboard/admin/auditoria` appears in the output.

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/(dashboard)/dashboard/admin/auditoria/page.tsx"
git commit -m "feat: add /dashboard/admin/auditoria page route"
```

---

## Task 8: Smoke test in dev server

**No test suite exists — verify manually.**

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Navigate to the page**

Open `http://localhost:3000/es/dashboard/admin/auditoria` while logged in as an admin account.

Expected:
- Page loads without console errors
- "Auditoría del Sistema" heading visible
- Table renders (or empty state if no logs yet)
- "Auditoría" nav item visible in sidebar

- [ ] **Step 3: Test filters**

- Select any `Acción` from the dropdown → table re-fetches
- Enter text in the Actor field → debounces 300ms then re-fetches
- Set a date range → table filters

- [ ] **Step 4: Test CSV export**

Click "Exportar CSV" → browser downloads a `.csv` file. Open it — verify columns match spec: `fecha_hora, actor_nombre, actor_rol, accion, entidad, entidad_id, datos_antes, datos_despues, ip_address`.

- [ ] **Step 5: Test expandable rows**

Click `▼` on a row that has `datos_antes` or `datos_despues` → accordion expands showing JSON. Click again → collapses.

- [ ] **Step 6: Test pagination**

If more than 25 logs exist, verify `Siguiente` / `Anterior` buttons navigate pages correctly.

- [ ] **Step 7: Final commit (if any fixups needed)**

```bash
git add -p
git commit -m "fix: auditoria page smoke test fixups"
```
