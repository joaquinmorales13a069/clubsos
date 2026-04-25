"use client";

/**
 * EmpresaInicioMiembrosRecientes — latest 5 members registered in the empresa.
 * Displays skeleton while loading. Each row shows estado and tipo_cuenta badges.
 */

import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Users, AlertCircle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export type MiembroRecienteRow = {
  id: string;
  nombre_completo: string | null;
  estado: string;
  tipo_cuenta: string;
  created_at: string;
};

interface Props {
  loading:       boolean;
  error:         boolean;
  miembros:      MiembroRecienteRow[];
  /** Locale-aware href to "empresa/usuarios" full list */
  verTodosHref:  string;
}

// ── Badge styles ──────────────────────────────────────────────────────────────

const ESTADO_BADGE: Record<string, string> = {
  activo:    "bg-emerald-100 text-emerald-700",
  inactivo:  "bg-gray-100 text-gray-500",
  pendiente: "bg-amber-100 text-amber-700",
};

const TIPO_BADGE: Record<string, string> = {
  titular:  "bg-secondary/10 text-secondary",
  familiar: "bg-purple-100 text-purple-700",
};

// ── Skeleton ─────────────────────────────────────────────────────────────────

function MiembrosSkeleton() {
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

export default function EmpresaInicioMiembrosRecientes({
  loading,
  error,
  miembros,
  verTodosHref,
}: Props) {
  const t = useTranslations("Dashboard.empresa.inicio");
  const tFamilia = useTranslations("Dashboard.miembro.familia");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-secondary" />
          <h3 className="text-sm font-poppins font-semibold text-gray-900">
            {t("miembrosRecientes_titulo")}
          </h3>
        </div>
        <Link
          href={verTodosHref}
          className="text-xs font-roboto font-medium text-secondary hover:text-secondary/80 transition-colors"
        >
          {t("miembrosRecientes_verTodos")} →
        </Link>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <MiembrosSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center text-center py-8 space-y-2">
            <AlertCircle className="w-8 h-8 text-gray-300" />
            <p className="text-sm font-roboto text-neutral">{t("errorMiembros")}</p>
          </div>
        ) : miembros.length === 0 ? (
          <div className="flex flex-col items-center text-center py-8 space-y-2">
            <Users className="w-10 h-10 text-gray-200" />
            <p className="text-sm font-roboto text-neutral">{t("miembrosRecientes_empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {miembros.map((miembro) => {
              const initials = (miembro.nombre_completo ?? "?")
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((n) => n[0])
                .join("")
                .toUpperCase();

              const relativeTime = formatDistanceToNow(new Date(miembro.created_at), {
                addSuffix: true,
                locale: es,
              });

              return (
                <li key={miembro.id} className="flex items-center gap-3 py-3">
                  {/* Avatar */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                    <span className="text-xs font-poppins font-bold text-secondary">
                      {initials}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-poppins font-semibold text-gray-900 truncate">
                      {miembro.nombre_completo ?? "—"}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* tipo_cuenta chip */}
                      <span className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        TIPO_BADGE[miembro.tipo_cuenta] ?? TIPO_BADGE.familiar,
                      )}>
                        {tFamilia(`tipoCuenta.${miembro.tipo_cuenta}` as Parameters<typeof tFamilia>[0])}
                      </span>
                      {/* Relative time */}
                      <span className="text-[10px] font-roboto text-neutral/60">
                        {relativeTime}
                      </span>
                    </div>
                  </div>

                  {/* Estado badge */}
                  <span className={cn(
                    "shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full",
                    ESTADO_BADGE[miembro.estado] ?? ESTADO_BADGE.inactivo,
                  )}>
                    {tFamilia(`estado.${miembro.estado}` as Parameters<typeof tFamilia>[0])}
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
