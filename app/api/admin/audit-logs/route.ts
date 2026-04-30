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

const CSV_HEADERS = [
  "fecha_hora", "actor_nombre", "actor_rol", "accion",
  "entidad", "entidad_id", "datos_antes", "datos_despues", "ip_address",
];

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
    actorIds?: string[];
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

  if (params.accion)   q = q.eq("accion", params.accion);
  if (params.entidad)  q = q.eq("entidad", params.entidad);
  if (params.actorIds) q = q.in("actor_id", params.actorIds);
  if (params.desde)    q = q.gte("created_at", `${params.desde}T00:00:00Z`);
  if (params.hasta)    q = q.lte("created_at", `${params.hasta}T23:59:59Z`);

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
  const headers = CSV_HEADERS;
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

  const actorSearchRaw = sp.get("actor_search")?.slice(0, 100) || undefined;
  let actorIds: string[] | undefined;
  if (actorSearchRaw) {
    const ids = await resolveActorIds(supabase, actorSearchRaw);
    if (!ids || ids.length === 0) {
      if (format === "csv") {
        return new NextResponse(CSV_HEADERS.join(",") + "\r\n", {
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
    accion:   sp.get("accion")  || undefined,
    entidad:  sp.get("entidad") || undefined,
    actorIds,
    desde:    sp.get("desde")   || undefined,
    hasta:    sp.get("hasta")   || undefined,
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

  const page     = Math.max(0, parseInt(sp.get("page") ?? "0", 10) || 0);
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, parseInt(sp.get("page_size") ?? String(PAGE_SIZE_DEFAULT), 10) || PAGE_SIZE_DEFAULT),
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
