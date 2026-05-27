"use client";

/**
 * AdminExcepcionesCalendario — global view of all schedule exceptions.
 *
 * Color coding by scope (matches AdminExcepcionesTabla badges):
 *   global         → red-600
 *   ubicacion-only → purple-600
 *   doctor-only    → green-600
 *   doctor + ubic. → blue-600
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import type {
  DatesSetArg,
  EventClickArg,
  EventInput,
  DateSelectArg,
} from "@fullcalendar/core";
import { createClient } from "@/utils/supabase/client";
import AdminExcepcionFormModal, {
  type ExcepcionFormValue,
  type ExcepcionScope,
} from "./AdminExcepcionFormModal";

interface ExcepcionRow {
  id:           string;
  doctor_id:    string | null;
  ubicacion_id: string | null;
  fecha_inicio: string;
  fecha_fin:    string;
  motivo:       string | null;
  doctor:       { id: string; nombre: string } | null | { id: string; nombre: string }[];
  ubicacion:    { id: string; nombre: string } | null | { id: string; nombre: string }[];
}

interface DoctorOption    { id: string; nombre: string; ubicacion_id: string | null }
interface UbicacionOption { id: string; nombre: string }

function pickOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function scopeOf(row: ExcepcionRow): ExcepcionScope {
  if (row.doctor_id && row.ubicacion_id) return "both";
  if (row.doctor_id)                      return "doctor";
  if (row.ubicacion_id)                   return "ubicacion";
  return "global";
}

const COLOR_BY_SCOPE: Record<ExcepcionScope, string> = {
  global:    "#dc2626",
  ubicacion: "#9333ea",
  doctor:    "#16a34a",
  both:      "#2563eb",
};

interface Props {
  doctores:    DoctorOption[];
  ubicaciones: UbicacionOption[];
  doctorFilter?:    string;
  ubicacionFilter?: string;
}

export default function AdminExcepcionesCalendario({
  doctores, ubicaciones, doctorFilter, ubicacionFilter,
}: Props) {
  const t      = useTranslations("Dashboard.admin.excepciones");
  const locale = useLocale();

  const supabase    = useMemo(() => createClient(), []);
  const calendarRef = useRef<FullCalendar>(null);

  const [range, setRange]     = useState<{ start: Date; end: Date } | null>(null);
  const [events, setEvents]   = useState<EventInput[]>([]);
  const [rows, setRows]       = useState<ExcepcionRow[]>([]);
  const [modalOpen, setModalOpen]       = useState(false);
  const [initialValue, setInitialValue] = useState<ExcepcionFormValue | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!range) return;
    const desde = range.start.toISOString().slice(0, 10);
    const hasta = range.end.toISOString().slice(0, 10);
    const sp = new URLSearchParams({ fecha_desde: desde, fecha_hasta: hasta });
    if (doctorFilter)    sp.set("doctor_id",    doctorFilter);
    if (ubicacionFilter) sp.set("ubicacion_id", ubicacionFilter);
    const res = await fetch(`/api/admin/excepciones?${sp.toString()}`, { cache: "no-store" });
    if (!res.ok) { setEvents([]); setRows([]); return; }
    const j = await res.json() as { excepciones: ExcepcionRow[] };
    const list = j.excepciones ?? [];
    setRows(list);
    setEvents(list.map((r) => {
      const sc = scopeOf(r);
      const doc = pickOne(r.doctor);
      const ubi = pickOne(r.ubicacion);
      const scopeLabel = t(`scope.${sc === "both" ? "doctorYUbicacion" : sc}`);
      const titleParts = [scopeLabel];
      if (doc) titleParts.push(doc.nombre);
      if (ubi) titleParts.push(ubi.nombre);
      const title = `${titleParts.join(" · ")}${r.motivo ? ` — ${r.motivo}` : ""}`;
      return {
        id:    r.id,
        title,
        start: r.fecha_inicio,
        end:   r.fecha_fin,
        backgroundColor: COLOR_BY_SCOPE[sc],
        borderColor:     COLOR_BY_SCOPE[sc],
        textColor:       "#ffffff",
      };
    }));
  }, [range, doctorFilter, ubicacionFilter, t]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("admin-excepciones-calendar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "excepciones_horario" },
        () => { void fetchEvents(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, fetchEvents]);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setRange({ start: arg.start, end: arg.end });
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const row = rows.find((r) => r.id === arg.event.id);
    if (!row) return;
    const sc = scopeOf(row);
    setInitialValue({
      id:           row.id,
      scope:        sc,
      doctor_id:    row.doctor_id,
      ubicacion_id: row.ubicacion_id,
      fecha_inicio: row.fecha_inicio,
      fecha_fin:    row.fecha_fin,
      motivo:       row.motivo ?? "",
    });
    setModalOpen(true);
  }, [rows]);

  const handleSelect = useCallback((arg: DateSelectArg) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const toLocal = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setInitialValue({
      scope:        "global",
      doctor_id:    null,
      ubicacion_id: null,
      fecha_inicio: toLocal(arg.start),
      fecha_fin:    toLocal(arg.end),
      motivo:       "",
    });
    setModalOpen(true);
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        timeZone="America/Managua"
        initialView="dayGridMonth"
        headerToolbar={{
          left:   "prev,next today",
          center: "title",
          right:  "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        locale={locale === "en" ? "en" : esLocale}
        events={events}
        datesSet={handleDatesSet}
        eventClick={handleEventClick}
        selectable
        select={handleSelect}
        height="auto"
        allDaySlot={false}
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
      />

      <AdminExcepcionFormModal
        open={modalOpen}
        initial={initialValue}
        doctores={doctores}
        ubicaciones={ubicaciones}
        onClose={() => setModalOpen(false)}
        onSaved={() => { void fetchEvents(); }}
      />
    </div>
  );
}
