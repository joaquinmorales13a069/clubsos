"use client";

/**
 * DetalleModal — Right-side Sheet panel showing all fields of a cita.
 * If estado_sync is 'pendiente', shows Aprobar / Rechazar action buttons.
 * Uses the same Sheet primitive as the mobile sidebar for consistency.
 */

import { useTranslations } from "next-intl";
/** Formats a UTC ISO timestamp as "lunes 27 de abril 2026 · 09:00" in Nicaragua time.
 *  Uses Intl with explicit timeZone — works correctly in any browser/server timezone. */
function formatNiFull(isoStr: string): string {
  const dt   = new Date(isoStr);
  const tz   = "America/Managua";
  const date = dt.toLocaleDateString("es-NI", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = dt.toLocaleTimeString("es-NI", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} · ${time}`;
}
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CitaRegistro } from "./EmpresaCitasRegistro";

// ── Status badge styles ───────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pendiente:  { label: "statusPendiente",  cls: "bg-amber-100 text-amber-700" },
  confirmado: { label: "statusConfirmado", cls: "bg-emerald-100 text-emerald-700" },
  completado: { label: "statusCompletado", cls: "bg-blue-100 text-blue-700" },
  cancelado:  { label: "statusCancelado",  cls: "bg-gray-100 text-gray-500" },
  rechazado:  { label: "statusRechazado",  cls: "bg-red-100 text-red-600" },
};

// ── Field row ─────────────────────────────────────────────────────────────────

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      <span className={cn("text-sm font-roboto text-gray-800", mono && "font-mono text-xs")}>
        {value ?? "—"}
      </span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open:           boolean;
  cita:           CitaRegistro | null;
  aprobando:      boolean;
  rechazando:     boolean;
  onClose:        () => void;
  onAprobar:      (citaId: string) => void;
  onRechazar:     (citaId: string) => void;
}

export default function DetalleModal({
  open,
  cita,
  aprobando,
  rechazando,
  onClose,
  onAprobar,
  onRechazar,
}: Props) {
  const t      = useTranslations("Dashboard.empresa.registroCitas");
  const tCitas = useTranslations("Dashboard.empresa.citas");

  if (!cita) return null;

  const status     = STATUS_BADGE[cita.estado_sync] ?? STATUS_BADGE.cancelado;
  const isPendiente = cita.estado_sync === "pendiente";
  const isBusy      = aprobando || rechazando;

  const fechaFormateada = formatNiFull(cita.fecha_hora_cita);

  // "Creado por" — always the submitting user (paciente_id → public.users)
  const creadoPor = cita.paciente?.nombre_completo ?? t("sinRegistro");

  // "Paciente" — third-party name when para_titular=false, or same user when true
  const nombrePaciente = cita.para_titular
    ? (cita.paciente?.nombre_completo ?? t("sinRegistro"))
    : (cita.paciente_nombre ?? t("sinRegistro"));

  // Phone and ID: use paciente_* cita fields for third party, users row for titular
  const telefonoPaciente = cita.para_titular
    ? (cita.paciente?.telefono ?? t("sinRegistro"))
    : (cita.paciente_telefono ?? t("sinRegistro"));

  const cedulaPaciente = cita.para_titular
    ? (cita.paciente?.documento_identidad ?? t("sinRegistro"))
    : (cita.paciente_cedula ?? t("sinRegistro"));

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-white flex flex-col"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <SheetTitle className="text-base font-poppins font-semibold text-gray-900">
            {t("modalTitulo")}
          </SheetTitle>
          {/* Status badge */}
          <span className={cn(
            "self-start text-xs font-semibold px-2.5 py-1 rounded-full mt-1",
            status.cls,
          )}>
            {t(status.label as Parameters<typeof t>[0])}
          </span>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Patient section */}
          <section className="space-y-4">
            <h4 className="text-xs font-poppins font-semibold text-gray-500 uppercase tracking-wider">
              {t("fieldPaciente")}
            </h4>
            <div className="grid grid-cols-1 gap-3 bg-gray-50 rounded-xl p-4">
              <Field label={t("fieldCreadoPor")}  value={creadoPor} />
              <Field label={t("fieldPaciente")}   value={nombrePaciente} />
              <Field label={t("fieldPara")}
                value={
                  <span className={cn(
                    "inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full",
                    cita.para_titular ? "bg-secondary/10 text-secondary" : "bg-purple-100 text-purple-700",
                  )}>
                    {cita.para_titular ? t("valorTitular") : t("valorTercero")}
                  </span>
                }
              />
              <Field label={t("fieldTelefono")}   value={telefonoPaciente} />
              <Field label={t("fieldCedula")}     value={cedulaPaciente} />
              {!cita.para_titular && (
                <Field label={t("fieldCorreo")}   value={cita.paciente_correo ?? t("sinRegistro")} />
              )}
            </div>
          </section>

          {/* Appointment section */}
          <section className="space-y-4">
            <h4 className="text-xs font-poppins font-semibold text-gray-500 uppercase tracking-wider">
              Cita
            </h4>
            <div className="grid grid-cols-1 gap-3 bg-gray-50 rounded-xl p-4">
              <Field label={t("fieldFecha")}    value={fechaFormateada} />
              <Field label={t("fieldServicio")} value={cita.servicio?.nombre ?? t("sinRegistro")} />
              <Field label={t("fieldDoctor")}   value={cita.doctor?.nombre ?? t("sinRegistro")} />
              {cita.motivo_cita && (
                <Field label={t("fieldMotivo")} value={cita.motivo_cita} />
              )}
              {cita.ea_appointment_id && (
                <Field label={t("fieldEaId")}   value={cita.ea_appointment_id} mono />
              )}
            </div>
          </section>
        </div>

        {/* Footer actions — only for pending citas */}
        {isPendiente && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button
              type="button"
              onClick={() => onAprobar(cita.id)}
              disabled={isBusy}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         bg-emerald-600 text-white text-sm font-semibold font-roboto
                         hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {aprobando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {t("aprobarBtn")}
            </button>
            <button
              type="button"
              onClick={() => onRechazar(cita.id)}
              disabled={isBusy}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         border border-red-300 text-red-600 text-sm font-semibold font-roboto
                         hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {rechazando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              {t("rechazarBtn")}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
