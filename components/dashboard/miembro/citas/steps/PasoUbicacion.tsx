"use client";

import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import type { WizardState } from "../types";

// Hardcoded locations — ea_category_id values map directly to Easy!Appointments category IDs
const UBICACIONES = [
  { id: 1, key: "managua", descKey: "managuaDesc" },
  { id: 2, key: "leon",    descKey: "leonDesc"    },
] as const;

interface PasoUbicacionProps {
  onSelect: (patch: Partial<WizardState>) => void;
}

export default function PasoUbicacion({ onSelect }: PasoUbicacionProps) {
  const t = useTranslations("Dashboard.miembro.citas.wizard.ubicacion");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{t("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {UBICACIONES.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => onSelect({ categoriaId: u.id, ubicacionNombre: t(u.key) })}
            className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left
                       shadow-sm transition-all hover:border-secondary/40 hover:shadow-md cursor-pointer"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <p className="font-poppins font-semibold text-gray-900">{t(u.key)}</p>
              <p className="mt-0.5 text-sm font-roboto text-neutral">{t(u.descKey)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
