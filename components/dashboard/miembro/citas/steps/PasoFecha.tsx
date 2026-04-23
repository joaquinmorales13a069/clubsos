"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import type { WizardState } from "../types";

interface PasoFechaProps {
  onSelect: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

/**
 * Format Date to "YYYY-MM-DD" using local date parts (avoids UTC shift from toISOString).
 */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function PasoFecha({ onSelect, onBack }: PasoFechaProps) {
  const t  = useTranslations("Dashboard.miembro.citas.wizard");
  const tf = useTranslations("Dashboard.miembro.citas.wizard.fecha");
  const [selected, setSelected] = useState<Date | undefined>(undefined);

  // Minimum: tomorrow (no same-day booking)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  // Maximum: 3 months from today
  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 3);
  maxDate.setHours(23, 59, 59, 999);

  function isDisabled(date: Date): boolean {
    return (
      date < tomorrow ||
      date > maxDate ||
      date.getDay() === 0 // Sundays
    );
  }

  function handleContinue() {
    if (!selected) return;
    onSelect({ fecha: toDateStr(selected) });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{tf("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{tf("subtitle")}</p>
      </div>

      {/* Constraint info banner */}
      <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 border border-blue-100 px-3.5 py-2.5">
        <Info className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
        <p className="text-xs font-roboto text-secondary leading-relaxed">{tf("constraintInfo")}</p>
      </div>

      {/* Calendar */}
      <div className="flex justify-center">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={setSelected}
          disabled={isDisabled}
          fromDate={tomorrow}
          toDate={maxDate}
          className="rounded-2xl border border-gray-200 shadow-sm bg-white"
        />
      </div>

      {/* Navigation buttons */}
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
          onClick={handleContinue}
          disabled={!selected}
          className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold font-roboto
                     hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t("continueBtn")} →
        </button>
      </div>
    </div>
  );
}
