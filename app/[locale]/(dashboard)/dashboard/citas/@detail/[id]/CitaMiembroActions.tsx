"use client";

/**
 * CitaMiembroActions — Cancel action + Add-to-calendar for a miembro cita.
 * Cancel calls the existing `cancelarCita` server action from actions.ts.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, X, Ban } from "lucide-react";
import { cancelarCita } from "@/app/[locale]/(dashboard)/dashboard/citas/actions";
import AgregarACalendario from "@/components/dashboard/miembro/citas/AgregarACalendario";

interface CitaMiembroActionsProps {
  cita: {
    id:              string;
    fecha_hora_cita: string;
    fecha_hora_fin:  string | null;
    estado_sync:     string;
    servicio_asociado: string | null;
    doctor:          { nombre: string } | null;
    ubicacion:       { nombre: string; direccion: string | null } | null;
  };
}

const CANCELABLE = new Set(["pendiente", "confirmado"]);
const CUTOFF_MS  = 60 * 60 * 1000; // 1 hour

function isPastCutoff(fechaHoraCita: string, now: number): boolean {
  return now >= new Date(fechaHoraCita).getTime() - CUTOFF_MS;
}

export default function CitaMiembroActions({ cita }: CitaMiembroActionsProps) {
  const t      = useTranslations("Dashboard.miembro.citas");
  const tShared = useTranslations("Dashboard.shared");
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const nowRef = useState(() => Date.now())[0];

  const esPasada   = new Date(cita.fecha_hora_cita).getTime() < nowRef;
  const pastCutoff = isPastCutoff(cita.fecha_hora_cita, nowRef);
  const canCancel  = CANCELABLE.has(cita.estado_sync);

  async function handleCancel() {
    if (!confirm(t("cancelConfirm"))) return;
    setCancelling(true);
    const result = await cancelarCita(cita.id);
    setCancelling(false);
    if (result?.error) {
      toast.error(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="pt-4 border-t border-gray-100 space-y-3">
      {/* Add to calendar — confirmed only */}
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
      {canCancel && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling || pastCutoff}
            className="flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {cancelling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <X className="w-4 h-4" />
            )}
            {t("cancelBtn")}
          </button>
          {pastCutoff && !esPasada && (
            <p className="text-xs font-roboto text-gray-400">{t("cancelTooLate")}</p>
          )}
        </div>
      )}

      {/* Finalizada notice */}
      {cita.estado_sync === "confirmado" && esPasada && (
        <span className="inline-flex items-center gap-1.5 text-xs font-roboto text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
          <Ban className="w-3.5 h-3.5" />
          {tShared("citaFinalizadaNoCancelable")}
        </span>
      )}
    </div>
  );
}
