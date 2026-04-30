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
