"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Info, Loader2 } from "lucide-react";
import { es, enUS } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import type { WizardState } from "../types";
import { todayNI, calendarDateNI, dateToCalendarNI, dateToCalendarLocal } from "@/lib/datetime";

interface PasoFechaProps {
  doctorId: string;
  onSelect: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

export default function PasoFecha({ doctorId, onSelect, onBack }: PasoFechaProps) {
  const t      = useTranslations("Dashboard.miembro.citas.wizard");
  const tf     = useTranslations("Dashboard.miembro.citas.wizard.fecha");
  const locale = useLocale();
  const dateLocale = locale === "es" ? es : enUS;
  const [selected, setSelected]   = useState<Date | undefined>(undefined);
  const [month, setMonth]         = useState<Date>(() => calendarDateNI(todayNI()));
  const [diasConSlots, setDias]   = useState<Set<string> | null>(null);
  const [loadingDias, setLoading] = useState(false);

  // Earliest selectable day: the Nicaragua calendar day that contains
  // (now + 24h). This matches the server-side BOOKING_TOO_SOON cutoff.
  const cutoffNI = dateToCalendarNI(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const tomorrow = calendarDateNI(cutoffNI);

  // Max date: 3 months from today's NI calendar day.
  const todayNICalendar = calendarDateNI(todayNI());
  const maxDate = new Date(todayNICalendar);
  maxDate.setUTCMonth(maxDate.getUTCMonth() + 3);

  // Fetch days with slots for the visible month.
  // `month` comes from react-day-picker (browser local tz). Use
  // dateToCalendarLocal so the visible month maps to the same calendar month
  // the user sees in the calendar grid.
  useEffect(() => {
    const monthStartLocal = dateToCalendarLocal(month).slice(0, 7) + "-01";
    const [year, monthNum] = monthStartLocal.split("-").map(Number);
    const nextMonthFirst = new Date(Date.UTC(year, monthNum, 1, 12)); // month is 1-indexed → next month
    const lastDayDate = new Date(nextMonthFirst.getTime() - 24 * 60 * 60 * 1000);
    const start = monthStartLocal;
    const end   = dateToCalendarLocal(lastDayDate);

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
    // `date` comes from react-day-picker (browser local tz); use local extraction.
    if (diasConSlots !== null && !diasConSlots.has(dateToCalendarLocal(date))) return true;
    return false;
  }

  function handleContinue() {
    if (!selected) return;
    // `selected` is the Date from react-day-picker (local tz). Extract the
    // calendar day the user actually saw and clicked, not the NI tz mapping.
    onSelect({ fecha: dateToCalendarLocal(selected) });
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

      <div className="relative rounded-2xl border border-gray-200 shadow-sm bg-white p-4 sm:p-6">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={setSelected}
          disabled={isDisabled}
          fromDate={tomorrow}
          toDate={maxDate}
          month={month}
          onMonthChange={setMonth}
          locale={dateLocale}
          style={{ "--cell-size": "3rem" } as CSSProperties}
          className="w-full text-base [&_table]:w-full [&_[role=gridcell]]:text-base [&_.rdp-weekday]:text-sm [&_.rdp-month_caption]:text-base"
        />
        {loadingDias && (
          <div className="absolute top-3 right-3">
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
