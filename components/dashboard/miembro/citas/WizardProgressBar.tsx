"use client";

/** Visual step progress bar for the 7-step scheduling wizard */

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS, type WizardStep } from "./types";

interface WizardProgressBarProps {
  currentStep: WizardStep;
}

export default function WizardProgressBar({ currentStep }: WizardProgressBarProps) {
  const t = useTranslations("Dashboard.miembro.citas.wizard");
  const currentIdx = WIZARD_STEPS.indexOf(currentStep);

  const stepLabels: Record<WizardStep, string> = {
    ubicacion:    t("stepUbicacion"),
    servicio:     t("stepServicio"),
    doctor:       t("stepDoctor"),
    fecha:        t("stepFecha"),
    horario:      t("stepHorario"),
    paciente:     t("stepPaciente"),
    pago:         t("stepPago"),
    transferencia: t("stepTransferencia"),
    confirmar:    t("stepConfirmar"),
  };

  return (
    <div className="w-full">
      {/* Step dots row */}
      <div className="flex items-center gap-1">
        {WIZARD_STEPS.map((step, idx) => {
          const done    = idx < currentIdx;
          const active  = idx === currentIdx;
          return (
            <div key={step} className="flex items-center flex-1 gap-1">
              {/* Dot */}
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all",
                  done   && "bg-secondary text-white",
                  active && "bg-primary text-white ring-2 ring-primary/30",
                  !done && !active && "bg-gray-100 text-gray-400",
                )}
              >
                {done ? "✓" : idx + 1}
              </div>
              {/* Connector line (not after last) */}
              {idx < WIZARD_STEPS.length - 1 && (
                <div className={cn("flex-1 h-0.5 rounded-full", done ? "bg-secondary" : "bg-gray-100")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Current step label */}
      <p className="mt-2 text-xs font-roboto text-neutral text-center">
        {t("step")} {currentIdx + 1} / {WIZARD_STEPS.length} — <span className="font-medium text-gray-700">{stepLabels[currentStep]}</span>
      </p>
    </div>
  );
}
