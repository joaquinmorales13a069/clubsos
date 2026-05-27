"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateNI, formatTime12NI, calendarDateNI } from "@/lib/datetime";
import { toast } from "sonner";
import {
  MapPin, Stethoscope, User, CalendarDays, Clock,
  AlertCircle, AlertTriangle, Loader2,
} from "lucide-react";
import type { WizardState, WizardUserProfile } from "../types";

interface PasoConfirmarProps {
  wizard:      WizardState;
  userProfile: WizardUserProfile;
  onBack: () => void;
  onSuccess: () => void;
  onTransferenciaRequired: (citaId: string) => void;
  onSlotTaken: () => void;
}

interface Slot { hora_inicio: string; disponible: boolean }

/** Format "YYYY-MM-DD" to readable date with weekday */
function formatDate(dateStr: string, locale: "es" | "en"): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return formatDateNI(
    calendarDateNI(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`),
    locale,
  );
}


export default function PasoConfirmar({
  wizard, userProfile, onBack, onSuccess, onTransferenciaRequired, onSlotTaken,
}: PasoConfirmarProps) {
  const t      = useTranslations("Dashboard.miembro.citas.wizard");
  const tc     = useTranslations("Dashboard.miembro.citas.wizard.confirmar");
  const te     = useTranslations("Errors.citas");
  const locale = useLocale() as "es" | "en";
  const [loading, setLoading] = useState(false);

  const SUMMARY_ITEMS = [
    { icon: MapPin,       key: "ubicacion",  value: wizard.ubicacionNombre },
    { icon: Stethoscope,  key: "servicio",   value: wizard.servicioNombre  },
    { icon: User,         key: "doctor",     value: wizard.doctorNombre    },
    { icon: CalendarDays, key: "fecha",      value: wizard.fecha ? formatDate(wizard.fecha, locale) : "" },
    { icon: Clock,        key: "horario",    value: wizard.fechaHoraCita ? formatTime12NI(wizard.fechaHoraCita, locale) : "" },
    { icon: User,         key: "paciente",   value: wizard.paraTitular ? "Para mí" : wizard.pacienteNombre },
  ];

  async function handleConfirm() {
    if (!wizard.doctorId || !wizard.servicioId || !wizard.fechaHoraCita || !wizard.fecha) return;
    setLoading(true);

    // Capa 2: re-verifica disponibilidad antes del submit
    try {
      const checkRes = await fetch(
        `/api/citas/disponibilidad?doctor_id=${wizard.doctorId}&servicio_id=${wizard.servicioId}&fecha=${wizard.fecha}`,
      );
      if (checkRes.ok) {
        const j = await checkRes.json() as { slots?: Slot[] };
        const slot = (j.slots ?? []).find((s) => s.hora_inicio === wizard.fechaHoraCita);
        if (!slot || !slot.disponible) {
          toast.error(te("slot_taken"));
          setLoading(false);
          onSlotTaken();
          return;
        }
      }
    } catch {
      // Network glitch → seguimos al POST y dejamos que el atomic insert decida
    }

    try {
      const body = {
        doctor_id:            wizard.doctorId,
        servicio_id:          wizard.servicioId,
        fecha_hora_cita:      wizard.fechaHoraCita,
        servicio_asociado:    wizard.servicioNombre,
        para_titular:         wizard.paraTitular,
        paciente_nombre:      wizard.paraTitular ? undefined : wizard.pacienteNombre,
        paciente_telefono:    wizard.paraTitular ? undefined : wizard.pacienteTelefono,
        paciente_correo:      wizard.paraTitular ? undefined : wizard.pacienteCorreo,
        paciente_cedula:      wizard.paraTitular ? undefined : wizard.pacienteCedula,
        ...(wizard.contrato_servicio_id ? { contrato_servicio_id: wizard.contrato_servicio_id } : {}),
        ...(wizard.metodo_pago ? { metodo_pago: wizard.metodo_pago } : {}),
        ...(wizard.monto != null ? { monto: wizard.monto } : {}),
      };

      const res = await fetch("/api/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const j = await res.json().catch(() => ({})) as {
        ok?: boolean;
        cita?: { id: string; estado_sync: string };
        error?: string;
        i18nKey?: string;
      };

      if (!res.ok || !j.ok) {
        const code = j.error;
        if (code === "SLOT_TAKEN") {
          toast.error(te("slot_taken"));
          onSlotTaken();
          return;
        }
        if (code === "QUOTA_EXCEEDED") {
          toast.error(te("quota_exceeded"));
          return;
        }
        if (j.i18nKey) {
          const last = j.i18nKey.split(".").pop() ?? "unknown";
          try {
            toast.error(te(last));
          } catch {
            toast.error(te("unknown"));
          }
          return;
        }
        toast.error(te("unknown"));
        return;
      }

      toast.success(tc("success"));
      if (wizard.metodo_pago === "transferencia" && j.cita) {
        onTransferenciaRequired(j.cita.id);
      } else {
        onSuccess();
      }
    } catch {
      toast.error(te("unknown"));
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

      <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
        {SUMMARY_ITEMS.map(({ icon: Icon, key, value }) => (
          <div key={key} className="flex items-center gap-3 px-4 py-3">
            <Icon className="w-4 h-4 text-secondary shrink-0" />
            <span className="text-sm font-roboto text-gray-800 capitalize">{value}</span>
          </div>
        ))}
      </div>

      {/* Concurrency notice */}
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
        <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
        <p className="text-sm font-roboto text-amber-900">
          <strong className="font-semibold">{tc("aviso_concurrencia_titulo")}</strong>{" "}
          {tc("aviso_concurrencia_body")}
        </p>
      </div>

      {/* Pending approval notice — only shown for miembro (empresa_admin auto-confirms) */}
      {userProfile.rol !== "empresa_admin" && (
        <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs font-roboto text-blue-700">{tc("pendingNote")}</p>
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
