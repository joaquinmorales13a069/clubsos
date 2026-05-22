"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar, Download } from "lucide-react";
import {
  googleCalendarUrl,
  outlookCalendarUrl,
  type CalendarEventInput,
} from "@/lib/calendar/links";

interface Props {
  citaId:      string;
  title:       string;
  start:       Date;
  end:         Date;
  description?: string;
  location?:   string;
}

export default function AgregarACalendario(props: Props) {
  const t = useTranslations("Dashboard.miembro.citas.agregar_calendario");
  const [open, setOpen] = useState(false);

  const ev: CalendarEventInput = {
    title:       props.title,
    start:       props.start,
    end:         props.end,
    description: props.description,
    location:    props.location,
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-roboto font-medium text-gray-700 hover:border-secondary/40 transition-colors"
      >
        <Calendar className="w-3.5 h-3.5" />
        {t("button")}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="cerrar"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute z-20 right-0 mt-1 w-52 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
            <a
              href={googleCalendarUrl(ev)}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2 text-sm hover:bg-gray-50"
            >
              {t("google")}
            </a>
            <a
              href={outlookCalendarUrl(ev)}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2 text-sm hover:bg-gray-50"
            >
              {t("outlook")}
            </a>
            <a
              href={`/api/citas/${props.citaId}/ics`}
              className="block px-4 py-2 text-sm hover:bg-gray-50"
            >
              {t("apple")}
            </a>
            <a
              href={`/api/citas/${props.citaId}/ics`}
              download
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 border-t border-gray-100"
            >
              <Download className="w-3.5 h-3.5" /> {t("ics")}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
