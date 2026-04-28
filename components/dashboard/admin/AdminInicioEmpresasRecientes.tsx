"use client";

/**
 * AdminInicioEmpresasRecientes — latest 5 registered companies for admin home.
 * Shows estado badge (activa / inactiva) and relative creation time.
 */

import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Building2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmpresaRecienteRow = {
  id:         string;
  nombre:     string;
  estado:     string;
  created_at: string;
};

interface Props {
  loading:      boolean;
  error:        boolean;
  empresas:     EmpresaRecienteRow[];
  verTodasHref: string;
}

// ── Badge styles ──────────────────────────────────────────────────────────────

const ESTADO_BADGE: Record<string, string> = {
  activa:   "bg-emerald-100 text-emerald-700",
  inactiva: "bg-gray-100 text-gray-500",
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function EmpresasSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-2/5" />
            <div className="h-3 bg-gray-200 rounded w-1/3" />
          </div>
          <div className="h-5 w-16 bg-gray-200 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminInicioEmpresasRecientes({
  loading,
  error,
  empresas,
  verTodasHref,
}: Props) {
  const t = useTranslations("Dashboard.admin.inicio");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-secondary" />
          <h3 className="text-sm font-poppins font-semibold text-gray-900">
            {t("empresasRecientes_titulo")}
          </h3>
        </div>
        <Link
          href={verTodasHref}
          className="text-xs font-roboto font-medium text-secondary hover:text-secondary/80 transition-colors"
        >
          {t("empresasRecientes_verTodas")} →
        </Link>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <EmpresasSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center text-center py-8 space-y-2">
            <AlertCircle className="w-8 h-8 text-gray-300" />
            <p className="text-sm font-roboto text-neutral">{t("errorEmpresas")}</p>
          </div>
        ) : empresas.length === 0 ? (
          <div className="flex flex-col items-center text-center py-8 space-y-2">
            <Building2 className="w-10 h-10 text-gray-200" />
            <p className="text-sm font-roboto text-neutral">{t("empresasRecientes_empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {empresas.map((empresa) => {
              const initials = empresa.nombre
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase();

              const relativeTime = formatDistanceToNow(new Date(empresa.created_at), {
                addSuffix: true,
                locale: es,
              });

              return (
                <li key={empresa.id} className="flex items-center gap-3 py-3">
                  {/* Avatar */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                    <span className="text-xs font-poppins font-bold text-secondary">
                      {initials}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-poppins font-semibold text-gray-900 truncate">
                      {empresa.nombre}
                    </p>
                    <p className="text-[10px] font-roboto text-neutral/60">
                      {relativeTime}
                    </p>
                  </div>

                  {/* Estado badge */}
                  <span className={cn(
                    "shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full",
                    ESTADO_BADGE[empresa.estado] ?? ESTADO_BADGE.inactiva,
                  )}>
                    {t(`empresa_${empresa.estado}` as "empresa_activa" | "empresa_inactiva")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
