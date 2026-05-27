"use client";

/**
 * AdminDoctorTabHorarios — weekly schedule + excepciones (blocks) editor.
 *
 * Phase 4 · Step 7 of the native citas module.
 * - Section A: weekly grid (Sun..Sat) with bloques per day. Each day has
 *   "+ Add bloque" → modal with hora_inicio / hora_fin / slot_duracion.
 *   Existing bloques can be deleted.
 * - Section B: future excepciones list with "+ Add excepcion" modal.
 *
 * All mutations call the dedicated REST endpoints under
 * /api/admin/doctores/[id]/horarios and …/excepciones.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Loader2, Plus, Trash2, CalendarX } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Horario {
  id:            string;
  dia_semana:    number;
  hora_inicio:   string;
  hora_fin:      string;
  slot_duracion: number;
  activo:        boolean;
}

interface Excepcion {
  id:           string;
  fecha_inicio: string;
  fecha_fin:    string;
  motivo:       string | null;
}

interface Props {
  doctorId:    string;
  horarios:    Horario[];
  excepciones: Excepcion[];
  onChanged:   () => void;
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors disabled:opacity-50";

const labelCls =
  "block text-xs font-medium text-gray-500 mb-1 font-roboto";

// Display weekdays in Mon..Sun order (Lun..Dom). Backend uses 0=Sun..6=Sat.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

// HH:MM:SS → HH:MM for display.
function trimTime(t: string): string {
  return /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : t;
}

// "2026-05-22T14:30:00Z" or "2026-05-22T14:30:00" → "2026-05-22 14:30"
function formatExcepcion(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convert <input type="datetime-local"> value (no TZ) → ISO with local TZ offset.
function localInputToISO(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function AdminDoctorTabHorarios({
  doctorId, horarios, excepciones, onChanged,
}: Props) {
  const t    = useTranslations("Dashboard.admin.doctores.detalle.horarios");
  const tEx  = useTranslations("Dashboard.admin.excepciones");
  const locale = useLocale();

  // Modal state
  const [bloqueOpenForDay, setBloqueOpenForDay] = useState<number | null>(null);
  const [excepcionOpen,    setExcepcionOpen]    = useState(false);
  const [busy,             setBusy]             = useState(false);
  const [deletingId,       setDeletingId]       = useState<string | null>(null);

  // Group horarios by day for quick lookup
  const horariosByDay = useMemo(() => {
    const map = new Map<number, Horario[]>();
    for (const h of horarios) {
      const list = map.get(h.dia_semana) ?? [];
      list.push(h);
      map.set(h.dia_semana, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    }
    return map;
  }, [horarios]);

  // Excepciones already sorted server-side; keep defensive sort.
  const sortedExcepciones = useMemo(
    () => [...excepciones].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)),
    [excepciones],
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  async function deleteHorario(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/admin/doctores/${doctorId}/horarios/${id}`, {
      method: "DELETE",
    });
    setDeletingId(null);
    if (res.ok) {
      toast.success(t("saved"));
      onChanged();
    } else {
      toast.error(t("delete_error"));
    }
  }

  async function deleteExcepcion(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/admin/doctores/${doctorId}/excepciones/${id}`, {
      method: "DELETE",
    });
    setDeletingId(null);
    if (res.ok) {
      toast.success(t("saved"));
      onChanged();
    } else {
      toast.error(t("delete_error"));
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Section A — Weekly schedule */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-base font-poppins font-semibold text-gray-900">
          {t("title")}
        </h2>

        <div className="divide-y divide-gray-100">
          {DAY_ORDER.map((dia) => {
            const bloques = horariosByDay.get(dia) ?? [];
            return (
              <div key={dia} className="py-3 flex flex-col md:flex-row md:items-start gap-3">
                <div className="w-32 shrink-0">
                  <p className="text-sm font-poppins font-semibold text-gray-800">
                    {t(`dia_${dia}`)}
                  </p>
                </div>
                <div className="flex-1 space-y-2">
                  {bloques.length === 0 && (
                    <p className="text-sm font-roboto text-gray-400">{t("noBloques")}</p>
                  )}
                  {bloques.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-100 bg-gray-50/60"
                    >
                      <span className="text-sm font-roboto text-gray-800">
                        {t("bloqueLabel", {
                          inicio: trimTime(b.hora_inicio),
                          fin:    trimTime(b.hora_fin),
                          slot:   b.slot_duracion,
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteHorario(b.id)}
                        disabled={deletingId === b.id}
                        title={t("removeBloque")}
                        aria-label={t("removeBloque")}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {deletingId === b.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setBloqueOpenForDay(dia)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-roboto font-medium text-secondary border border-secondary/30 hover:bg-secondary/10 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t("addBloque")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section B — Excepciones */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-poppins font-semibold text-gray-900 inline-flex items-center gap-2">
            <CalendarX className="w-4 h-4 text-secondary" />
            {t("excepcionesTitle")}
          </h2>
          <button
            type="button"
            onClick={() => setExcepcionOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-roboto font-medium text-secondary border border-secondary/30 hover:bg-secondary/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("addExcepcion")}
          </button>
        </div>

        <Link
          href={`/${locale}/dashboard/admin/excepciones?doctor_id=${doctorId}`}
          className="block text-xs font-roboto text-secondary hover:underline"
        >
          {tEx("seeGlobalLink")}
        </Link>

        <div className="space-y-2">
          {sortedExcepciones.length === 0 && (
            <p className="text-sm font-roboto text-gray-400">{t("noExcepciones")}</p>
          )}
          {sortedExcepciones.map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/60"
            >
              <div className="min-w-0">
                <p className="text-sm font-roboto text-gray-800">
                  {formatExcepcion(e.fecha_inicio)} → {formatExcepcion(e.fecha_fin)}
                </p>
                {e.motivo && (
                  <p className="text-xs font-roboto text-gray-500 mt-0.5 truncate">
                    {e.motivo}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteExcepcion(e.id)}
                disabled={deletingId === e.id}
                title={t("removeExcepcion")}
                aria-label={t("removeExcepcion")}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
              >
                {deletingId === e.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Modal — add bloque */}
      <AddBloqueModal
        open={bloqueOpenForDay !== null}
        dia={bloqueOpenForDay}
        busy={busy}
        onClose={() => setBloqueOpenForDay(null)}
        onSubmit={async ({ hora_inicio, hora_fin, slot_duracion }) => {
          if (bloqueOpenForDay === null) return;
          setBusy(true);
          const res = await fetch(`/api/admin/doctores/${doctorId}/horarios`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              dia_semana:    bloqueOpenForDay,
              hora_inicio,
              hora_fin,
              slot_duracion,
              activo:        true,
            }),
          });
          setBusy(false);
          if (res.ok) {
            toast.success(t("saved"));
            setBloqueOpenForDay(null);
            onChanged();
          } else {
            toast.error(t("save_error"));
          }
        }}
      />

      {/* Modal — add excepcion */}
      <AddExcepcionModal
        open={excepcionOpen}
        busy={busy}
        onClose={() => setExcepcionOpen(false)}
        onSubmit={async ({ fecha_inicio, fecha_fin, motivo }) => {
          setBusy(true);
          const res = await fetch(`/api/admin/doctores/${doctorId}/excepciones`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ fecha_inicio, fecha_fin, motivo }),
          });
          setBusy(false);
          if (res.ok) {
            toast.success(t("saved"));
            setExcepcionOpen(false);
            onChanged();
          } else {
            toast.error(t("save_error"));
          }
        }}
      />
    </div>
  );
}

// ── Add Bloque modal ────────────────────────────────────────────────────────

function AddBloqueModal({
  open, dia, busy, onClose, onSubmit,
}: {
  open:     boolean;
  dia:      number | null;
  busy:     boolean;
  onClose:  () => void;
  onSubmit: (v: { hora_inicio: string; hora_fin: string; slot_duracion: number }) => Promise<void> | void;
}) {
  const t = useTranslations("Dashboard.admin.doctores.detalle.horarios");

  const [horaInicio,    setHoraInicio]    = useState("08:00");
  const [horaFin,       setHoraFin]       = useState("12:00");
  const [slotDuracion,  setSlotDuracion]  = useState(30);

  // Reset form when reopening
  useEffect(() => {
    if (open) {
      setHoraInicio("08:00");
      setHoraFin("12:00");
      setSlotDuracion(30);
    }
  }, [open]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!horaInicio || !horaFin) {
      toast.error(t("validHoras"));
      return;
    }
    if (horaInicio >= horaFin) {
      toast.error(t("validRango"));
      return;
    }
    if (!Number.isFinite(slotDuracion) || slotDuracion < 5) {
      toast.error(t("validSlot"));
      return;
    }
    void onSubmit({
      hora_inicio:   horaInicio,
      hora_fin:      horaFin,
      slot_duracion: slotDuracion,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent showCloseButton={!busy} className="max-w-sm rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-poppins font-semibold text-gray-900">
            {t("addBloqueTitle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="px-6 py-5 space-y-4">
            {dia !== null && (
              <div>
                <p className={labelCls}>{t("addBloqueDay")}</p>
                <p className="text-sm font-roboto text-gray-800 font-medium">
                  {t(`dia_${dia}`)}
                </p>
              </div>
            )}
            <div>
              <label className={labelCls}>{t("hora_inicio")} *</label>
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{t("hora_fin")} *</label>
              <input
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{t("slot_duracion")} *</label>
              <input
                type="number"
                min={5}
                step={5}
                value={slotDuracion}
                onChange={(e) => setSlotDuracion(Number(e.target.value))}
                className={inputCls}
                required
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/60">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-roboto text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {t("cancelar")}
            </button>
            <button
              type="submit"
              disabled={busy}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-roboto font-medium bg-secondary text-white",
                "hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
              )}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("saveBloque")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Excepcion modal ─────────────────────────────────────────────────────

function AddExcepcionModal({
  open, busy, onClose, onSubmit,
}: {
  open:     boolean;
  busy:     boolean;
  onClose:  () => void;
  onSubmit: (v: { fecha_inicio: string; fecha_fin: string; motivo: string | null }) => Promise<void> | void;
}) {
  const t = useTranslations("Dashboard.admin.doctores.detalle.horarios");

  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin,    setFechaFin]    = useState("");
  const [motivo,      setMotivo]      = useState("");

  useEffect(() => {
    if (open) {
      setFechaInicio("");
      setFechaFin("");
      setMotivo("");
    }
  }, [open]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const isoInicio = localInputToISO(fechaInicio);
    const isoFin    = localInputToISO(fechaFin);
    if (!isoInicio || !isoFin) {
      toast.error(t("validFechas"));
      return;
    }
    if (fechaInicio >= fechaFin) {
      toast.error(t("validRangoFechas"));
      return;
    }
    void onSubmit({
      fecha_inicio: isoInicio,
      fecha_fin:    isoFin,
      motivo:       motivo.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent showCloseButton={!busy} className="max-w-md rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-poppins font-semibold text-gray-900">
            {t("addExcepcionTitle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className={labelCls}>{t("fecha_inicio")} *</label>
              <input
                type="datetime-local"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{t("fecha_fin")} *</label>
              <input
                type="datetime-local"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{t("motivo")}</label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={500}
                className={inputCls}
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/60">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-roboto text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {t("cancelar")}
            </button>
            <button
              type="submit"
              disabled={busy}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-roboto font-medium bg-secondary text-white",
                "hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
              )}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("guardar")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
