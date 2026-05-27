"use client";

/**
 * AdminCalendarioCitas — Admin global calendar view of all citas.
 *
 * Phase 4 · Step 8 of the native citas module. Wraps FullCalendar with:
 * - week/day/month views
 * - Realtime subscription to public.citas (any change → refetch)
 * - Filters: ubicacion / doctor / servicio / estado
 * - Click on an event opens AdminCitaDetalleModal
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import type {
  EventClickArg,
  EventInput,
  DatesSetArg,
} from "@fullcalendar/core";
import { CalendarDays } from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import AdminCitaDetalleModal from "./AdminCitaDetalleModal";

// ── Constants ─────────────────────────────────────────────────────────────────

const COLOR_BY_ESTADO: Record<string, string> = {
  pendiente:         "#f59e0b",
  pendiente_empresa: "#f59e0b",
  pendiente_pago:    "#f59e0b",
  pendiente_admin:   "#f59e0b",
  confirmado:        "#10b981",
  completado:        "#6b7280",
  cancelado:         "#ef4444",
  rechazado:         "#ef4444",
};

const ESTADOS = [
  "pendiente",
  "pendiente_empresa",
  "pendiente_pago",
  "pendiente_admin",
  "confirmado",
  "completado",
  "cancelado",
  "rechazado",
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type RelOne<T> = T | T[] | null;
function pickOne<T>(rel: RelOne<T>): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

interface CitaRow {
  id: string;
  fecha_hora_cita: string;
  fecha_hora_fin: string | null;
  estado_sync: string;
  paciente:  RelOne<{ nombre_completo: string | null }>;
  doctor:    RelOne<{ nombre: string | null }>;
  servicio:  RelOne<{ nombre: string | null }>;
  ubicacion: RelOne<{ nombre: string | null }>;
}

interface FilterOption { id: string; nombre: string }

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminCalendarioCitas() {
  const t       = useTranslations("Dashboard.admin.citas.calendario");
  const tF      = useTranslations("Dashboard.admin.citas.calendario.filtros");
  const tEstado = useTranslations("Dashboard.admin.citas.calendario.estados");
  const locale  = useLocale();

  const supabase    = useMemo(() => createClient(), []);
  const calendarRef = useRef<FullCalendar>(null);

  // Visible range tracking (updated by FullCalendar via datesSet)
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);

  // Events
  const [events, setEvents] = useState<EventInput[]>([]);

  // Filters
  const [filtroUbicacion, setFiltroUbicacion] = useState<string>("");
  const [filtroDoctor,    setFiltroDoctor]    = useState<string>("");
  const [filtroServicio,  setFiltroServicio]  = useState<string>("");
  const [filtroEstado,    setFiltroEstado]    = useState<string>("");

  // Filter options
  const [ubicaciones, setUbicaciones] = useState<FilterOption[]>([]);
  const [doctores,    setDoctores]    = useState<FilterOption[]>([]);
  const [servicios,   setServicios]   = useState<FilterOption[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCitaId, setModalCitaId] = useState<string | null>(null);

  // ── Load filter options once ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [uRes, dRes, sRes] = await Promise.all([
          fetch("/api/admin/ubicaciones", { cache: "no-store" }),
          fetch("/api/admin/doctores",    { cache: "no-store" }),
          fetch("/api/admin/servicios",   { cache: "no-store" }),
        ]);
        const [uJ, dJ, sJ] = await Promise.all([uRes.json(), dRes.json(), sRes.json()]);
        if (cancelled) return;
        setUbicaciones((uJ.ubicaciones ?? []).map((u: { id: string; nombre: string }) => ({ id: u.id, nombre: u.nombre })));
        setDoctores   ((dJ.doctores    ?? []).map((d: { id: string; nombre: string }) => ({ id: d.id, nombre: d.nombre })));
        setServicios  ((sJ.servicios   ?? []).map((s: { id: string; nombre: string }) => ({ id: s.id, nombre: s.nombre })));
      } catch {
        /* options stay empty; calendar still works */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch events for current range + filters ──────────────────────────────
  const fetchEvents = useCallback(async () => {
    if (!range) return;

    let q = supabase
      .from("citas")
      .select(`
        id, fecha_hora_cita, fecha_hora_fin, estado_sync,
        paciente:users!paciente_id(nombre_completo),
        doctor:doctores(nombre),
        servicio:servicios(nombre),
        ubicacion:ubicaciones(nombre)
      `)
      .gte("fecha_hora_cita", range.start.toISOString())
      .lte("fecha_hora_cita", range.end.toISOString());

    if (filtroUbicacion) q = q.eq("ubicacion_id", filtroUbicacion);
    if (filtroDoctor)    q = q.eq("doctor_id",    filtroDoctor);
    if (filtroServicio)  q = q.eq("servicio_id",  filtroServicio);
    if (filtroEstado)    q = q.eq("estado_sync",  filtroEstado);

    const { data, error } = await q;
    if (error || !data) {
      setEvents([]);
      return;
    }

    const mapped: EventInput[] = (data as unknown as CitaRow[]).map((c) => {
      const servicioNombre = pickOne(c.servicio)?.nombre ?? "—";
      const pacienteNombre = pickOne(c.paciente)?.nombre_completo ?? "—";
      const color = COLOR_BY_ESTADO[c.estado_sync] ?? "#6b7280";
      return {
        id:    c.id,
        title: `${servicioNombre} · ${pacienteNombre}`,
        start: c.fecha_hora_cita,
        end:   c.fecha_hora_fin ?? undefined,
        backgroundColor: color,
        borderColor:     color,
        textColor:       "#ffffff",
      };
    });
    setEvents(mapped);
  }, [supabase, range, filtroUbicacion, filtroDoctor, filtroServicio, filtroEstado]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("admin-calendario-citas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "citas" },
        () => { void fetchEvents(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, fetchEvents]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setRange({ start: arg.start, end: arg.end });
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    setModalCitaId(arg.event.id);
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setModalCitaId(null);
  }, []);

  const handleModalChanged = useCallback(() => {
    setModalOpen(false);
    setModalCitaId(null);
    void fetchEvents();
  }, [fetchEvents]);

  // ── Render ────────────────────────────────────────────────────────────────
  const selectCls =
    "px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto " +
    "text-gray-700 focus:outline-none focus:ring-2 focus:ring-secondary/30";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
          <CalendarDays className="w-5 h-5 text-secondary" />
        </div>
        <div>
          <h1 className="text-xl font-poppins font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm font-roboto text-neutral">{t("subtitle")}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{tF("ubicacion")}</span>
          <select
            className={selectCls}
            value={filtroUbicacion}
            onChange={(e) => setFiltroUbicacion(e.target.value)}
          >
            <option value="">{tF("todas")}</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{tF("doctor")}</span>
          <select
            className={selectCls}
            value={filtroDoctor}
            onChange={(e) => setFiltroDoctor(e.target.value)}
          >
            <option value="">{tF("todos")}</option>
            {doctores.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{tF("servicio")}</span>
          <select
            className={selectCls}
            value={filtroServicio}
            onChange={(e) => setFiltroServicio(e.target.value)}
          >
            <option value="">{tF("todos")}</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{tF("estado")}</span>
          <select
            className={selectCls}
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          >
            <option value="">{tF("todos")}</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {(() => { try { return tEstado(e); } catch { return e; } })()}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          timeZone="America/Managua"
          initialView="timeGridWeek"
          headerToolbar={{
            left:   "prev,next today",
            center: "title",
            right:  "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          locale={locale === "en" ? "en" : esLocale}
          events={events}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          height="auto"
          nowIndicator
          allDaySlot={false}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
        />
      </div>

      <AdminCitaDetalleModal
        citaId={modalCitaId}
        open={modalOpen}
        onClose={handleModalClose}
        onChanged={handleModalChanged}
      />
    </div>
  );
}
