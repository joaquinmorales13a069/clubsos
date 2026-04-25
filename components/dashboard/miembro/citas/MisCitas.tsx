"use client";

/**
 * MisCitas — Main client component for the appointments section.
 * Handles two views:
 *   - "list": existing appointments + "Schedule" button
 *   - "wizard": 7-step scheduling flow
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Plus } from "lucide-react";
import WizardProgressBar from "./WizardProgressBar";
import CitaCard from "./CitaCard";
import PasoUbicacion from "./steps/PasoUbicacion";
import PasoServicio  from "./steps/PasoServicio";
import PasoDoctor    from "./steps/PasoDoctor";
import PasoFecha     from "./steps/PasoFecha";
import PasoHorario   from "./steps/PasoHorario";
import PasoPaciente  from "./steps/PasoPaciente";
import PasoConfirmar from "./steps/PasoConfirmar";
import {
  INITIAL_WIZARD,
  WIZARD_STEPS,
  type CitaRow,
  type WizardState,
  type WizardUserProfile,
} from "./types";

interface MisCitasProps {
  citas:       CitaRow[];
  userProfile: WizardUserProfile | null;
  locale:      string;
}

type View = "list" | "wizard";

export default function MisCitas({ citas, userProfile, locale }: MisCitasProps) {
  const t = useTranslations("Dashboard.miembro.citas");
  const [view, setView]     = useState<View>("list");
  const [wizard, setWizard] = useState<WizardState>(INITIAL_WIZARD);

  /** Merge a partial patch into wizard state AND advance to next step */
  function patchAndAdvance(patch: Partial<WizardState>) {
    setWizard((prev) => {
      const merged = { ...prev, ...patch };
      const currentIdx = WIZARD_STEPS.indexOf(prev.step);
      const nextStep   = WIZARD_STEPS[currentIdx + 1] ?? prev.step;
      return { ...merged, step: nextStep };
    });
  }

  /** Go back one step */
  function goBack() {
    setWizard((prev) => {
      const currentIdx = WIZARD_STEPS.indexOf(prev.step);
      const prevStep   = WIZARD_STEPS[Math.max(0, currentIdx - 1)];
      return { ...prev, step: prevStep };
    });
  }

  /** Reset wizard and return to list */
  function exitWizard() {
    setWizard(INITIAL_WIZARD);
    setView("list");
  }

  // ── Wizard view ─────────────────────────────────────────────────────────────
  if (view === "wizard") {
    return (
      <div className="space-y-5 max-w-lg mx-auto">
        {/* Header with close button */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-poppins font-bold text-gray-900">{t("scheduleTitle")}</h1>
          <button
            type="button"
            onClick={exitWizard}
            className="text-sm font-roboto text-neutral hover:text-gray-700 transition-colors"
          >
            {t("cancelWizard")} ✕
          </button>
        </div>

        <WizardProgressBar currentStep={wizard.step} />

        {/* Step renderer */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {wizard.step === "ubicacion" && (
            <PasoUbicacion onSelect={patchAndAdvance} />
          )}
          {wizard.step === "servicio" && wizard.categoriaId !== null && (
            <PasoServicio
              categoriaId={wizard.categoriaId}
              onSelect={patchAndAdvance}
              onBack={goBack}
            />
          )}
          {wizard.step === "doctor" && wizard.eaServiceId !== null && (
            <PasoDoctor
              eaServiceId={wizard.eaServiceId}
              onSelect={patchAndAdvance}
              onBack={goBack}
            />
          )}
          {wizard.step === "fecha" && (
            <PasoFecha onSelect={patchAndAdvance} onBack={goBack} />
          )}
          {wizard.step === "horario" && wizard.eaProviderId !== null && wizard.eaServiceId !== null && wizard.fecha !== null && (
            <PasoHorario
              eaProviderId={wizard.eaProviderId}
              eaServiceId={wizard.eaServiceId}
              fecha={wizard.fecha}
              onSelect={patchAndAdvance}
              onBack={goBack}
            />
          )}
          {wizard.step === "paciente" && (
            <PasoPaciente
              userProfile={userProfile ?? { id: "", rol: "miembro", empresa_id: null, ea_customer_id: null, nombre_completo: null, telefono: null, documento_identidad: null }}
              onSelect={patchAndAdvance}
              onBack={goBack}
            />
          )}
          {wizard.step === "confirmar" && userProfile && (
            <PasoConfirmar
              wizard={wizard}
              userProfile={userProfile}
              onBack={goBack}
              onSuccess={exitWizard}
            />
          )}
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  // Filter into upcoming and past
  const now        = new Date();
  const upcoming   = citas.filter((c) => new Date(c.fecha_hora_cita) >= now && c.estado_sync !== "cancelado");
  const history    = citas.filter((c) => new Date(c.fecha_hora_cita) < now  || c.estado_sync === "cancelado");

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setView("wizard")}
          className="flex items-center gap-2 shrink-0 px-4 py-2 rounded-xl bg-primary text-white
                     text-sm font-semibold font-roboto hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t("scheduleBtn")}
        </button>
      </div>

      {/* Empty state */}
      {citas.length === 0 && (
        <div className="flex flex-col items-center text-center py-16 space-y-3">
          <CalendarDays className="w-14 h-14 text-gray-200" />
          <p className="text-base font-poppins font-semibold text-gray-500">{t("noAppointments")}</p>
          <p className="text-sm font-roboto text-neutral max-w-xs">{t("noAppointmentsSub")}</p>
          <button
            type="button"
            onClick={() => setView("wizard")}
            className="mt-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold font-roboto hover:bg-primary/90 transition-colors"
          >
            {t("scheduleBtn")}
          </button>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-poppins font-semibold text-gray-500 uppercase tracking-wide">{t("sectionUpcoming")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((c) => <CitaCard key={c.id} cita={c} />)}
          </div>
        </section>
      )}

      {/* History */}
      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-poppins font-semibold text-gray-500 uppercase tracking-wide">{t("sectionHistory")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {history.map((c) => <CitaCard key={c.id} cita={c} />)}
          </div>
        </section>
      )}
    </div>
  );
}
