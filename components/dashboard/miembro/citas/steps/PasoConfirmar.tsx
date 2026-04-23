"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Stethoscope, User, CalendarDays, Clock, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { crearCita } from "@/app/[locale]/(dashboard)/dashboard/citas/actions";
import type { WizardState, WizardUserProfile } from "../types";

interface PasoConfirmarProps {
  wizard:      WizardState;
  userProfile: WizardUserProfile;
  onBack: () => void;
  onSuccess: () => void;
}

/** Format "YYYY-MM-DD" to readable date */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const dt = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return dt.toLocaleDateString("es-NI", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Convert "HH:MM" 24h → "H:MM AM/PM" 12h */
function to12h(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  const h12    = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${mStr} ${period}`;
}

const SUMMARY_ITEMS = [
  { icon: MapPin,       key: "ubicacion",  getValue: (w: WizardState) => w.ubicacionNombre },
  { icon: Stethoscope,  key: "servicio",   getValue: (w: WizardState) => w.servicioNombre  },
  { icon: User,         key: "doctor",     getValue: (w: WizardState) => w.doctorNombre    },
  { icon: CalendarDays, key: "fecha",      getValue: (w: WizardState) => w.fecha ? formatDate(w.fecha) : "" },
  { icon: Clock,        key: "horario",    getValue: (w: WizardState) => w.hora ? to12h(w.hora) : "" },
  { icon: User,         key: "paciente",   getValue: (w: WizardState) => w.paraTitular ? "Para mí" : w.pacienteNombre },
] as const;

export default function PasoConfirmar({ wizard, userProfile, onBack, onSuccess }: PasoConfirmarProps) {
  const t  = useTranslations("Dashboard.miembro.citas.wizard");
  const tc = useTranslations("Dashboard.miembro.citas.wizard.confirmar");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleConfirm() {
    if (!wizard.fecha || !wizard.hora || !wizard.eaServiceId || !wizard.eaProviderId) return;
    setLoading(true);
    setError(null);

    const result = await crearCita({
      empresaId:        userProfile.empresa_id,
      eaCustomerId:     userProfile.ea_customer_id,
      eaServiceId:      wizard.eaServiceId,
      eaProviderId:     wizard.eaProviderId,
      fechaHoraCita:    `${wizard.fecha}T${wizard.hora}:00`,
      servicioAsociado: wizard.servicioNombre,
      paraTitular:      wizard.paraTitular,
      pacienteNombre:   wizard.paraTitular ? null : wizard.pacienteNombre,
      pacienteTelefono: wizard.paraTitular ? null : wizard.pacienteTelefono || null,
      pacienteCorreo:   wizard.paraTitular ? null : wizard.pacienteCorreo  || null,
      pacienteCedula:   wizard.paraTitular ? null : wizard.pacienteCedula  || null,
      motivoCita:       null,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setTimeout(onSuccess, 1500);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center text-center py-10 space-y-3">
        <CheckCircle2 className="w-14 h-14 text-green-500" />
        <p className="text-lg font-poppins font-bold text-gray-900">{tc("success")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{tc("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{tc("subtitle")}</p>
      </div>

      {/* Summary cards */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
        {SUMMARY_ITEMS.map(({ icon: Icon, key, getValue }) => (
          <div key={key} className="flex items-center gap-3 px-4 py-3">
            <Icon className="w-4 h-4 text-secondary shrink-0" />
            <span className="text-sm font-roboto text-gray-800 capitalize">{getValue(wizard)}</span>
          </div>
        ))}
      </div>

      {/* Pending approval notice */}
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs font-roboto text-amber-700">{tc("pendingNote")}</p>
      </div>

      {error && (
        <p className="text-xs font-roboto text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {tc("error")}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="text-sm font-roboto text-neutral hover:text-gray-700 transition-colors disabled:opacity-50"
        >
          ← {t("backBtn")}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold font-roboto
                     hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? tc("loading") : tc("confirmBtn")}
        </button>
      </div>
    </div>
  );
}
