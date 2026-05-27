"use client";

/** Displays a single cita with status badge and cancel action */

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { CalendarDays, Clock, MapPin, X, Loader2 } from "lucide-react";
import { cancelarCita } from "@/app/[locale]/(dashboard)/dashboard/citas/actions";
import CitaEstadoBadge from "./CitaEstadoBadge";
import AgregarACalendario from "./AgregarACalendario";
import type { CitaEstado, CitaRow } from "./types";
import { formatDateWeekdayShortNI, formatTime12NI, type Loc } from "@/lib/datetime";

interface CitaCardProps {
  cita: CitaRow;
}

const CANCELABLE = new Set(["pendiente", "confirmado"]);
const CUTOFF_MS  = 60 * 60 * 1000; // 1 hour in ms

function isPastCutoff(fechaHoraCita: string): boolean {
  return Date.now() >= new Date(fechaHoraCita).getTime() - CUTOFF_MS;
}

export default function CitaCard({ cita }: CitaCardProps) {
  const t      = useTranslations("Dashboard.miembro.citas");
  const locale = useLocale() as Loc;
  const [cancelling, setCancelling] = useState(false);
  const date = formatDateWeekdayShortNI(cita.fecha_hora_cita, locale);
  const time = formatTime12NI(cita.fecha_hora_cita, locale);
  const pastCutoff = isPastCutoff(cita.fecha_hora_cita);

  async function handleCancel() {
    if (!confirm(t("cancelConfirm"))) return;
    setCancelling(true);
    const result = await cancelarCita(cita.id);
    setCancelling(false);
    if (result?.error) {
      toast.error(result.error);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-gray-700">
            <CalendarDays className="w-4 h-4 text-secondary shrink-0" />
            <span className="text-sm font-roboto font-medium capitalize">{date}</span>
          </div>
          <div className="flex items-center gap-1.5 text-neutral">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="text-sm font-roboto">{time}</span>
          </div>
        </div>
        <CitaEstadoBadge estado={cita.estado_sync as CitaEstado} />
      </div>

      {/* Service */}
      {cita.servicio_asociado && (
        <p className="text-xs font-roboto text-neutral bg-gray-50 px-3 py-1.5 rounded-lg truncate">
          {cita.servicio_asociado}
        </p>
      )}

      {/* Ubicación */}
      {cita.ubicacion?.nombre && (
        <div className="flex items-start gap-1.5 text-neutral">
          <MapPin aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mt-0.5 text-secondary" />
          <div className="min-w-0">
            <p className="text-xs font-roboto font-medium text-gray-700 truncate">
              {cita.ubicacion.nombre}
            </p>
            {cita.ubicacion.direccion && (
              <p className="text-[11px] font-roboto text-gray-400 truncate">
                {cita.ubicacion.direccion}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Patient (when not for self) */}
      {!cita.para_titular && cita.paciente_nombre && (
        <p className="text-xs font-roboto text-neutral">
          Paciente: <span className="font-medium text-gray-700">{cita.paciente_nombre}</span>
        </p>
      )}

      {/* Add to external calendar — only for confirmed citas */}
      {cita.estado_sync === "confirmado" && (
        <AgregarACalendario
          citaId={cita.id}
          title={`${cita.servicio_asociado ?? "Cita médica"}${cita.doctor?.nombre ? ` con ${cita.doctor.nombre}` : ""}`}
          start={new Date(cita.fecha_hora_cita)}
          end={cita.fecha_hora_fin
            ? new Date(cita.fecha_hora_fin)
            : new Date(new Date(cita.fecha_hora_cita).getTime() + 30 * 60_000)}
          location={cita.ubicacion
            ? `${cita.ubicacion.nombre}${cita.ubicacion.direccion ? `, ${cita.ubicacion.direccion}` : ""}`
            : undefined}
        />
      )}

      {/* Cancel button */}
      {CANCELABLE.has(cita.estado_sync) && (
        <div className="space-y-1">
          <button
            onClick={handleCancel}
            disabled={cancelling || pastCutoff}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {cancelling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
            {t("cancelBtn")}
          </button>
          {pastCutoff && (
            <p className="text-[10px] font-roboto text-gray-400 leading-tight">
              {t("cancelTooLate")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
