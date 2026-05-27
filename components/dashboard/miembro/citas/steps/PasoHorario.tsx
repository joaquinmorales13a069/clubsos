"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatTime12NI, isAtLeast24hAway } from "@/lib/datetime";
import { Clock, Loader2, CalendarX } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import type { WizardState } from "../types";

interface Slot {
  hora_inicio: string;  // ISO UTC
  hora_fin:    string;  // ISO UTC
  disponible:  boolean;
}

interface PasoHorarioProps {
  doctorId:   string;
  servicioId: string;
  fecha:      string;   // YYYY-MM-DD
  onSelect: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

export default function PasoHorario({
  doctorId, servicioId, fecha, onSelect, onBack,
}: PasoHorarioProps) {
  const t  = useTranslations("Dashboard.miembro.citas.wizard");
  const th = useTranslations("Dashboard.miembro.citas.wizard.horario");
  const locale = useLocale() as "es" | "en";
  const [slots, setSlots]       = useState<Slot[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError]       = useState(false);

  const fetchSlots = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(
        `/api/citas/disponibilidad?doctor_id=${doctorId}&servicio_id=${servicioId}&fecha=${fecha}`,
      );
      if (!res.ok) throw new Error("fetch failed");
      const j = await res.json() as { slots?: Slot[] };
      setSlots(j.slots ?? []);
    } catch {
      setError(true);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [doctorId, servicioId, fecha]);

  useEffect(() => {
    setLoading(true);
    setSelected(null);
    void fetchSlots();
  }, [fetchSlots]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`citas-doctor-${doctorId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "citas", filter: `doctor_id=eq.${doctorId}` },
        () => { void fetchSlots(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [doctorId, fetchSlots]);

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
          {slots.map((slot) => {
            const isSelected  = selected === slot.hora_inicio;
            const isAvailable = slot.disponible && isAtLeast24hAway(slot.hora_inicio);
            return (
              <button
                key={slot.hora_inicio}
                type="button"
                disabled={!isAvailable}
                onClick={() => isAvailable && setSelected(slot.hora_inicio)}
                aria-label={`${formatTime12NI(slot.hora_inicio, locale)}${isAvailable ? "" : ` (${th("slotNotAvailable")})`}`}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-roboto font-medium transition-all",
                  isSelected && "bg-primary border-primary text-white shadow-md shadow-primary/20",
                  !isSelected && isAvailable && "bg-white border-gray-200 text-gray-700 hover:border-secondary/50 cursor-pointer",
                  !isAvailable && "bg-gray-100 border-gray-100 text-gray-400 line-through cursor-not-allowed",
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                {formatTime12NI(slot.hora_inicio, locale)}
              </button>
            );
          })}
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
            onClick={() => selected && onSelect({ fechaHoraCita: selected })}
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
