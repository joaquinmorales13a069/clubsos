"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardState, WizardUserProfile } from "../types";

interface PasoPacienteProps {
  userProfile: WizardUserProfile;
  onSelect: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

export default function PasoPaciente({ userProfile, onSelect, onBack }: PasoPacienteProps) {
  const t  = useTranslations("Dashboard.miembro.citas.wizard");
  const tp = useTranslations("Dashboard.miembro.citas.wizard.paciente");

  const [forSelf, setForSelf]   = useState(true);
  const [nombre, setNombre]     = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo]     = useState("");
  const [cedula, setCedula]     = useState("");

  function handleContinue() {
    if (forSelf) {
      onSelect({
        paraTitular:      true,
        pacienteNombre:   userProfile.nombre_completo ?? "",
        pacienteTelefono: userProfile.telefono ?? "",
        pacienteCorreo:   "",
        pacienteCedula:   userProfile.documento_identidad ?? "",
      });
    } else {
      if (!nombre.trim()) return;
      onSelect({
        paraTitular:      false,
        pacienteNombre:   nombre.trim(),
        pacienteTelefono: telefono.trim(),
        pacienteCorreo:   correo.trim(),
        pacienteCedula:   cedula.trim(),
      });
    }
  }

  const canContinue = forSelf || nombre.trim().length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{tp("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{tp("subtitle")}</p>
      </div>

      {/* Toggle */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { value: true,  icon: User,  label: tp("forMe")    },
          { value: false, icon: Users, label: tp("forOther") },
        ].map(({ value, icon: Icon, label }) => (
          <button
            key={String(value)}
            type="button"
            onClick={() => setForSelf(value)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all",
              forSelf === value
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-gray-200 bg-white hover:border-gray-300",
            )}
          >
            <Icon className={cn("w-6 h-6", forSelf === value ? "text-primary" : "text-neutral")} />
            <span className={cn("text-sm font-roboto font-medium", forSelf === value ? "text-primary" : "text-gray-700")}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Pre-fill summary (for self) */}
      {forSelf && (
        <div className="rounded-xl bg-gray-50 px-4 py-3 space-y-1">
          <p className="text-sm font-roboto font-medium text-gray-800">{userProfile.nombre_completo ?? "—"}</p>
          <p className="text-xs font-roboto text-neutral">{userProfile.telefono ?? "—"}</p>
        </div>
      )}

      {/* Free-form fields (for other) */}
      {!forSelf && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-roboto font-medium text-gray-700 mb-1">{tp("nameLabel")} *</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={tp("nameLabel")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-roboto focus:outline-none focus:border-secondary"
            />
          </div>
          <div>
            <label className="block text-xs font-roboto font-medium text-gray-700 mb-1">{tp("phoneLabel")}</label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+505 8888 7777"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-roboto focus:outline-none focus:border-secondary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-roboto font-medium text-gray-700 mb-1">{tp("emailLabel")}</label>
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-roboto focus:outline-none focus:border-secondary"
              />
            </div>
            <div>
              <label className="block text-xs font-roboto font-medium text-gray-700 mb-1">{tp("cedLabel")}</label>
              <input
                type="text"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="001-XXXXXX-XXXX"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-roboto focus:outline-none focus:border-secondary"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-roboto text-neutral hover:text-gray-700 transition-colors"
        >
          ← {t("backBtn")}
        </button>
        <button
          type="button"
          disabled={!canContinue}
          onClick={handleContinue}
          className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold font-roboto
                     hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t("continueBtn")} →
        </button>
      </div>
    </div>
  );
}
