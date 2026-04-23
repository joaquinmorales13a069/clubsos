/**
 * ProximaCitaCard — Home info card showing the next upcoming appointment.
 * Shows date, time, service, and status badge.
 * Server Component.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock } from "lucide-react";

type Cita = {
  id: string;
  fecha_hora_cita: string;
  estado_sync: "pendiente" | "confirmado" | "completado" | "cancelado";
  servicio_asociado: string | null;
} | null;

interface ProximaCitaCardProps {
  cita: Cita;
  locale: string;
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente:  "bg-amber-100 text-amber-700",
  confirmado: "bg-green-100 text-green-700",
};

/** Format TIMESTAMPTZ to separate date string and time string in es-NI locale */
function formatDateTime(dtStr: string) {
  const dt = new Date(dtStr);
  return {
    date: dt.toLocaleDateString("es-NI", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    time: dt.toLocaleTimeString("es-NI", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export default async function ProximaCitaCard({ cita, locale }: ProximaCitaCardProps) {
  const t = await getTranslations("Dashboard.miembro.inicio.proximaCita");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-secondary" />
          <span className="text-sm font-poppins font-semibold text-gray-900">{t("title")}</span>
        </div>
        <Link
          href={`/${locale}/dashboard/citas`}
          className="flex items-center gap-0.5 text-xs font-roboto text-secondary hover:text-secondary/80 transition-colors"
        >
          {t("viewAll")}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Body */}
      <div className="p-4">
        {cita ? (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-roboto font-medium text-gray-800 capitalize">
                {formatDateTime(cita.fecha_hora_cita).date}
              </p>
              <span
                className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_BADGE[cita.estado_sync] ?? "bg-gray-100 text-gray-600"}`}
              >
                {cita.estado_sync === "pendiente" ? t("statusPendiente") : t("statusConfirmado")}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-neutral">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-sm font-roboto">{formatDateTime(cita.fecha_hora_cita).time}</span>
            </div>
            {cita.servicio_asociado && (
              <p className="text-xs font-roboto text-neutral bg-gray-50 px-3 py-1.5 rounded-lg truncate">
                {cita.servicio_asociado}
              </p>
            )}
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center text-center py-3 space-y-2">
            <CalendarDays className="w-8 h-8 text-gray-200" />
            <p className="text-sm font-roboto font-medium text-gray-500">{t("empty")}</p>
            <p className="text-xs font-roboto text-neutral">{t("emptySub")}</p>
            <Link
              href={`/${locale}/dashboard/citas`}
              className="mt-1 text-xs font-semibold font-roboto text-white bg-primary hover:bg-primary/90 transition-colors px-4 py-1.5 rounded-full"
            >
              {t("schedule")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
