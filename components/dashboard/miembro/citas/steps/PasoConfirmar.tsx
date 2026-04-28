"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MapPin, Stethoscope, User, CalendarDays, Clock, AlertCircle, Loader2 } from "lucide-react";
import type { WizardState, WizardUserProfile } from "../types";

interface PasoConfirmarProps {
  wizard:      WizardState;
  userProfile: WizardUserProfile;
  onBack: () => void;
  onSuccess: () => void;
  onTransferenciaRequired: (citaId: string) => void;
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

export default function PasoConfirmar({ wizard, userProfile, onBack, onSuccess, onTransferenciaRequired }: PasoConfirmarProps) {
  const t  = useTranslations("Dashboard.miembro.citas.wizard");
  const tc = useTranslations("Dashboard.miembro.citas.wizard.confirmar");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (!wizard.fecha || !wizard.hora || !wizard.eaServiceId || !wizard.eaProviderId) return;
    setLoading(true);

    try {
      const body = {
        ea_service_id:     wizard.eaServiceId,
        ea_provider_id:    wizard.eaProviderId,
        fecha_hora_cita:   `${wizard.fecha}T${wizard.hora}:00`,
        servicio_asociado: wizard.servicioNombre,
        para_titular:      wizard.paraTitular,
        paciente_nombre:   wizard.paraTitular ? null : wizard.pacienteNombre,
        paciente_telefono: wizard.paraTitular ? null : wizard.pacienteTelefono,
        paciente_correo:   wizard.paraTitular ? null : wizard.pacienteCorreo,
        paciente_cedula:   wizard.paraTitular ? null : wizard.pacienteCedula,
        ...(wizard.contrato_servicio_id ? { contrato_servicio_id: wizard.contrato_servicio_id } : {}),
        ...(wizard.metodo_pago ? { metodo_pago: wizard.metodo_pago } : {}),
      };

      const res = await fetch("/api/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Error al crear la cita");
      }

      const { cita } = await res.json() as { cita: { id: string; estado_sync: string } };
      toast.success(tc("success"));

      if (wizard.metodo_pago === "transferencia") {
        onTransferenciaRequired(cita.id);
      } else {
        onSuccess();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc("error"));
    } finally {
      setLoading(false);
    }
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

      {/* Pending approval notice — only shown for miembro (empresa_admin auto-confirms) */}
      {userProfile.rol !== "empresa_admin" && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs font-roboto text-amber-700">{tc("pendingNote")}</p>
        </div>
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
