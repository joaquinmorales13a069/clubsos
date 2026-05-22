"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Info, Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import type { WizardState } from "../types";

interface PasoFechaProps {
  doctorId: string;
  onSelect: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const NI_OFFSET_MS = -6 * 60 * 60 * 1000;
function nicaraguaCalendarDate(dayOffset = 0): Date {
  const ni = new Date(Date.now() + NI_OFFSET_MS);
  return new Date(ni.getUTCFullYear(), ni.getUTCMonth(), ni.getUTCDate() + dayOffset);
}

export default function PasoFecha({ doctorId, onSelect, onBack }: PasoFechaProps) {
  const t  = useTranslations("Dashboard.miembro.citas.wizard");
  const tf = useTranslations("Dashboard.miembro.citas.wizard.fecha");
  const [selected, setSelected]   = useState<Date | undefined>(undefined);
  const [month, setMonth]         = useState<Date>(() => nicaraguaCalendarDate(0));
  const [diasConSlots, setDias]   = useState<Set<string> | null>(null);
  const [loadingDias, setLoading] = useState(false);

  const tomorrow = nicaraguaCalendarDate(1);
  tomorrow.setHours(0, 0, 0, 0);

  const maxDate = nicaraguaCalendarDate(0);
  maxDate.setMonth(maxDate.getMonth() + 3);
  maxDate.setHours(23, 59, 59, 999);

  // Fetch days with slots for the visible month
  useEffect(() => {
    const year  = month.getFullYear();
    const monthNum = month.getMonth() + 1;
    const start = `${year}-${String(monthNum).padStart(2, "0")}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();
    const end   = `${year}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    let cancelled = false;
    setLoading(true);
    fetch(`/api/citas/dias-disponibles?doctor_id=${doctorId}&fecha_inicio=${start}&fecha_fin=${end}`)
      .then((r) => r.json())
      .then((j: { dias?: { fecha: string; tiene_slots: boolean }[] }) => {
        if (cancelled) return;
        const set = new Set<string>(
          (j.dias ?? []).filter((d) => d.tiene_slots).map((d) => d.fecha),
        );
        setDias(set);
      })
      .catch(() => {
        if (!cancelled) setDias(new Set());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [doctorId, month]);

  function isDisabled(date: Date): boolean {
    if (date < tomorrow || date > maxDate || date.getDay() === 0) return true;
    // If we've loaded the set for this month and the date is not in it, disable.
    if (diasConSlots !== null && !diasConSlots.has(toDateStr(date))) return true;
    return false;
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

      <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 border border-blue-100 px-3.5 py-2.5">
        <Info className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
        <p className="text-xs font-roboto text-secondary leading-relaxed">{tf("constraintInfo")}</p>
      </div>

      <div className="flex justify-center relative">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={setSelected}
          disabled={isDisabled}
          fromDate={tomorrow}
          toDate={maxDate}
          month={month}
          onMonthChange={setMonth}
          className="rounded-2xl border border-gray-200 shadow-sm bg-white"
        />
        {loadingDias && (
          <div className="absolute top-2 right-2">
            <Loader2 className="w-4 h-4 animate-spin text-neutral" />
          </div>
        )}
      </div>

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
