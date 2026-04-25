"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { User, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { WizardState } from "../types";

interface Doctor {
  id: string;
  ea_provider_id: number;
  nombre: string;
  correo: string | null;
}

interface PasoDoctorProps {
  eaServiceId: number;
  onSelect: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

/** Derive avatar initials from a full name */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PasoDoctor({ eaServiceId, onSelect, onBack }: PasoDoctorProps) {
  const t  = useTranslations("Dashboard.miembro.citas.wizard");
  const td = useTranslations("Dashboard.miembro.citas.wizard.doctor");
  const [doctores, setDoctores] = useState<Doctor[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("doctores")
      .select("id, ea_provider_id, nombre, correo")
      .contains("ea_servicios", [eaServiceId])
      .eq("activo", true)
      .then(({ data }) => {
        setDoctores(data ?? []);
        setLoading(false);
      });
  }, [eaServiceId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{td("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{td("subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-neutral">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-roboto">{td("loading")}</span>
        </div>
      ) : doctores.length === 0 ? (
        <div className="text-center py-10">
          <User className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-sm font-roboto text-gray-500">{td("noDoctors")}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {doctores.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelect({ eaProviderId: d.ea_provider_id, doctorNombre: d.nombre })}
              className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left
                         shadow-sm transition-all hover:border-secondary/40 hover:shadow-md"
            >
              {/* Avatar */}
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-secondary to-secondary/70 text-white font-poppins font-bold text-sm">
                {getInitials(d.nombre)}
              </div>
              <div>
                <p className="font-poppins font-semibold text-gray-900">{d.nombre}</p>
                {d.correo && (
                  <p className="text-xs font-roboto text-neutral mt-0.5">{d.correo}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onBack}
        className="text-sm font-roboto text-neutral hover:text-gray-700 transition-colors"
      >
        ← {t("backBtn")}
      </button>
    </div>
  );
}
