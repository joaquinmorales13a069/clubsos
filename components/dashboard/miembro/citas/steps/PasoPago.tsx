"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CreditCard, Building2, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardState } from "../types";

interface PasoPagoProps {
  onSelect: (patch: Partial<WizardState>) => void;
  onBack:   () => void;
}

type MetodoPago = "link_pago" | "transferencia" | "pago_clinica";

const METODOS: { value: MetodoPago; labelKey: string; descKey: string; Icon: React.ElementType }[] = [
  { value: "link_pago",     labelKey: "link",          descKey: "link_desc",          Icon: CreditCard  },
  { value: "transferencia", labelKey: "transferencia",  descKey: "transferencia_desc", Icon: Building2   },
  { value: "pago_clinica",  labelKey: "clinica",        descKey: "clinica_desc",       Icon: Stethoscope },
];

export default function PasoPago({ onSelect, onBack }: PasoPagoProps) {
  const t = useTranslations("Dashboard.miembro.citas.wizard.pago");
  const [selected, setSelected] = useState<MetodoPago | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{t("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      <div className="space-y-3">
        {METODOS.map(({ value, labelKey, descKey, Icon }) => (
          <button
            key={value}
            onClick={() => setSelected(value)}
            className={cn(
              "w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all",
              selected === value
                ? "border-primary bg-primary/5"
                : "border-gray-200 hover:border-primary/40",
            )}
          >
            <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", selected === value ? "text-primary" : "text-neutral")} />
            <div>
              <p className="font-semibold text-sm text-gray-900">{t(labelKey)}</p>
              <p className="text-xs text-neutral mt-0.5">{t(descKey)}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t("back")}
        </button>
        <button
          disabled={!selected}
          onClick={() => selected && onSelect({ metodo_pago: selected })}
          className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
        >
          {t("continue")}
        </button>
      </div>
    </div>
  );
}
