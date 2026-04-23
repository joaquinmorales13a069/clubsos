"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, Loader2, CalendarX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardState } from "../types";

interface PasoHorarioProps {
  eaProviderId: number;
  eaServiceId:  number;
  fecha:        string; // YYYY-MM-DD
  onSelect: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

/** Convert "HH:MM" 24h → "H:MM AM/PM" 12h */
function to12h(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  const h12    = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${mStr} ${period}`;
}

export default function PasoHorario({ eaProviderId, eaServiceId, fecha, onSelect, onBack }: PasoHorarioProps) {
  const t  = useTranslations("Dashboard.miembro.citas.wizard");
  const th = useTranslations("Dashboard.miembro.citas.wizard.horario");
  const [slots, setSlots]         = useState<string[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<string | null>(null);
  const [error, setError]         = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setSelected(null);
    fetch(`/api/ea/disponibilidad?providerId=${eaProviderId}&serviceId=${eaServiceId}&date=${fecha}`)
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json() as Promise<string[]>;
      })
      .then((data) => setSlots(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [eaProviderId, eaServiceId, fecha]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{th("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{th("subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-neutral">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-roboto">{th("loading")}</span>
        </div>
      ) : error || slots.length === 0 ? (
        <div className="flex flex-col items-center text-center py-10 space-y-2">
          <CalendarX className="w-10 h-10 text-gray-200" />
          <p className="text-sm font-roboto font-medium text-gray-500">{th("noSlots")}</p>
          <p className="text-xs font-roboto text-neutral">{th("noSlotsSub")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => setSelected(slot)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-roboto font-medium transition-all",
                selected === slot
                  ? "bg-primary border-primary text-white shadow-md shadow-primary/20"
                  : "bg-white border-gray-200 text-gray-700 hover:border-secondary/50",
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              {to12h(slot)}
            </button>
          ))}
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
        {slots.length > 0 && (
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onSelect({ hora: selected })}
            className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold font-roboto
                       hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("continueBtn")} →
          </button>
        )}
      </div>
    </div>
  );
}
