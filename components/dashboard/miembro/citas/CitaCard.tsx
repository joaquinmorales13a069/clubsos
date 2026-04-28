"use client";

/** Displays a single cita with status badge and cancel action */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarDays, Clock, X, Loader2 } from "lucide-react";
import { cancelarCita } from "@/app/[locale]/(dashboard)/dashboard/citas/actions";
import CitaEstadoBadge from "./CitaEstadoBadge";
import type { CitaEstado, CitaRow } from "./types";

interface CitaCardProps {
  cita: CitaRow;
}

function formatDateTime(dtStr: string) {
  const dt = new Date(dtStr);
  return {
    date: dt.toLocaleDateString("es-NI", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "America/Managua" }),
    time: dt.toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit", timeZone: "America/Managua" }),
  };
}

const CANCELABLE = new Set(["pendiente", "confirmado"]);

export default function CitaCard({ cita }: CitaCardProps) {
  const t = useTranslations("Dashboard.miembro.citas");
  const [cancelling, setCancelling] = useState(false);
  const { date, time } = formatDateTime(cita.fecha_hora_cita);

  async function handleCancel() {
    if (!confirm(t("cancelConfirm"))) return;
    setCancelling(true);
    const result = await cancelarCita(cita.id, cita.ea_appointment_id);
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

      {/* Patient (when not for self) */}
      {!cita.para_titular && cita.paciente_nombre && (
        <p className="text-xs font-roboto text-neutral">
          Paciente: <span className="font-medium text-gray-700">{cita.paciente_nombre}</span>
        </p>
      )}

      {/* Cancel button */}
      {CANCELABLE.has(cita.estado_sync) && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
        >
          {cancelling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
          {t("cancelBtn")}
        </button>
      )}
    </div>
  );
}
