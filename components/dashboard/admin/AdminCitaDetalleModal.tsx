"use client";

/**
 * AdminCitaDetalleModal — Admin-side cita detail modal with state-aware actions.
 *
 * Phase 4 · Step 8 of the native citas module. Opened from the admin
 * calendario when an event is clicked. Fetches the full cita from
 * GET /api/admin/citas/[id] and exposes confirmar / rechazar / cancelar
 * depending on the current estado_sync.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTimeNI, type Loc } from "@/lib/datetime";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Ban } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type RelOne<T> = T | T[] | null;

interface CitaDetalle {
  id: string;
  fecha_hora_cita: string;
  fecha_hora_fin: string | null;
  estado_sync: string;
  motivo_cita: string | null;
  para_titular: boolean;
  paciente_nombre: string | null;
  paciente_telefono: string | null;
  paciente_cedula: string | null;
  paciente: RelOne<{
    nombre_completo: string | null;
    telefono: string | null;
    email: string | null;
  }>;
  doctor: RelOne<{ id: string; nombre: string }>;
  servicio: RelOne<{ id: string; nombre: string }>;
  ubicacion: RelOne<{ id: string; nombre: string; direccion: string | null }>;
}

function pickOne<T>(rel: RelOne<T>): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

const ESTADO_COLORS: Record<string, string> = {
  pendiente:         "bg-amber-100 text-amber-700",
  pendiente_empresa: "bg-amber-100 text-amber-700",
  pendiente_pago:    "bg-amber-100 text-amber-700",
  pendiente_admin:   "bg-amber-100 text-amber-700",
  confirmado:        "bg-emerald-100 text-emerald-700",
  completado:        "bg-gray-100 text-gray-600",
  cancelado:         "bg-red-100 text-red-700",
  rechazado:         "bg-red-100 text-red-700",
};

// ── Component ─────────────────────────────────────────────────────────────────

export interface AdminCitaDetalleModalProps {
  citaId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function AdminCitaDetalleModal({
  citaId,
  open,
  onClose,
  onChanged,
}: AdminCitaDetalleModalProps) {
  const t       = useTranslations("Dashboard.admin.citas.calendario.modal");
  const tEstado = useTranslations("Dashboard.admin.citas.calendario.estados");
  const tErr    = useTranslations();
  const locale  = useLocale() as Loc;

  const [cita,    setCita]    = useState<CitaDetalle | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy,    setBusy]    = useState<null | "confirmar" | "rechazar" | "cancelar">(null);
  const [motivo,  setMotivo]  = useState("");
  const [showRechazar, setShowRechazar] = useState(false);
  const [showCancelar, setShowCancelar] = useState(false);

  // ── Load on open ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!citaId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/citas/${citaId}`, { cache: "no-store" });
      const j   = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "load failed");
      setCita(j.cita ?? null);
    } catch {
      setCita(null);
      toast.error(t("error_cargar"));
    } finally {
      setLoading(false);
    }
  }, [citaId, t]);

  useEffect(() => {
    if (open && citaId) {
      setMotivo("");
      setShowRechazar(false);
      setShowCancelar(false);
      void load();
    } else if (!open) {
      setCita(null);
    }
  }, [open, citaId, load]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const paciente  = useMemo(() => pickOne(cita?.paciente  ?? null), [cita]);
  const doctor    = useMemo(() => pickOne(cita?.doctor    ?? null), [cita]);
  const servicio  = useMemo(() => pickOne(cita?.servicio  ?? null), [cita]);
  const ubicacion = useMemo(() => pickOne(cita?.ubicacion ?? null), [cita]);

  const fechaFmt = useMemo(() => {
    if (!cita?.fecha_hora_cita) return "—";
    const fmt = formatDateTimeNI(cita.fecha_hora_cita, locale);
    return fmt === "—" ? cita.fecha_hora_cita : fmt;
  }, [cita?.fecha_hora_cita, locale]);

  const pacienteDisplay = cita?.para_titular
    ? (paciente?.nombre_completo ?? "—")
    : (cita?.paciente_nombre ?? "—");

  const estado = cita?.estado_sync ?? "";
  const isPendiente = estado.startsWith("pendiente");
  const isConfirmado = estado === "confirmado";

  // ── Actions ────────────────────────────────────────────────────────────────
  const safeErrorMsg = (j: { i18nKey?: string; error?: string }): string => {
    if (j?.i18nKey) {
      try { return tErr(j.i18nKey); } catch { /* fall through */ }
    }
    return j?.error ?? "Error";
  };

  const handleConfirmar = async () => {
    if (!cita) return;
    setBusy("confirmar");
    try {
      const res = await fetch(`/api/admin/citas/${cita.id}/confirmar`, { method: "POST" });
      const j   = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(safeErrorMsg(j)); return; }
      toast.success(t("confirmar_ok"));
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const handleRechazar = async () => {
    if (!cita) return;
    setBusy("rechazar");
    try {
      const res = await fetch(`/api/admin/citas/${cita.id}/rechazar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ motivo: motivo.trim() || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(safeErrorMsg(j)); return; }
      toast.success(t("rechazar_ok"));
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const handleCancelar = async () => {
    if (!cita) return;
    if (!motivo.trim()) {
      toast.error(t("motivo_cancelacion"));
      return;
    }
    setBusy("cancelar");
    try {
      const res = await fetch(`/api/citas/${cita.id}/cancelar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ motivo: motivo.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(safeErrorMsg(j)); return; }
      toast.success(t("cancelar_ok"));
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const fieldCls = "text-sm font-roboto text-gray-800";
  const labelCls = "text-xs font-roboto font-medium text-gray-500 uppercase tracking-wide";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-poppins text-lg">{t("title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("title")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-sm text-gray-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("cargando")}
          </div>
        ) : !cita ? (
          <div className="py-8 text-center text-sm text-gray-400">—</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 items-start">
              <span className={labelCls}>{t("paciente")}</span>
              <span className={cn(fieldCls, "col-span-2 font-medium")}>{pacienteDisplay}</span>

              <span className={labelCls}>{t("doctor")}</span>
              <span className={cn(fieldCls, "col-span-2")}>{doctor?.nombre ?? "—"}</span>

              <span className={labelCls}>{t("servicio")}</span>
              <span className={cn(fieldCls, "col-span-2")}>{servicio?.nombre ?? "—"}</span>

              <span className={labelCls}>{t("ubicacion")}</span>
              <span className={cn(fieldCls, "col-span-2")}>{ubicacion?.nombre ?? "—"}</span>

              <span className={labelCls}>{t("fecha")}</span>
              <span className={cn(fieldCls, "col-span-2")}>{fechaFmt}</span>

              <span className={labelCls}>{t("motivo")}</span>
              <span className={cn(fieldCls, "col-span-2 break-words")}>
                {cita.motivo_cita?.trim() || "—"}
              </span>

              <span className={labelCls}>{t("estado")}</span>
              <span className="col-span-2">
                <span
                  className={cn(
                    "inline-block px-2 py-0.5 rounded-full text-xs font-medium",
                    ESTADO_COLORS[estado] ?? "bg-gray-100 text-gray-600",
                  )}
                >
                  {(() => { try { return tEstado(estado); } catch { return estado; } })()}
                </span>
              </span>
            </div>

            {/* Action area */}
            {(isPendiente || isConfirmado) && (
              <div className="pt-2 border-t border-gray-100">
                {showRechazar && (
                  <div className="space-y-2 mb-2">
                    <label className={labelCls}>{t("motivo_rechazo")}</label>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      rows={2}
                      className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    />
                  </div>
                )}

                {showCancelar && (
                  <div className="space-y-2 mb-2">
                    <label className={labelCls}>{t("motivo_cancelacion")}</label>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      rows={2}
                      placeholder={t("cancelado_por_admin")}
                      className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && cita && (isPendiente || isConfirmado) && (
          <DialogFooter>
            {isPendiente && !showRechazar && (
              <>
                <button
                  type="button"
                  onClick={() => { setShowRechazar(true); setShowCancelar(false); setMotivo(""); }}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  {t("rechazar")}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmar}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {busy === "confirmar"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCircle2 className="w-4 h-4" />}
                  {t("confirmar")}
                </button>
              </>
            )}

            {isPendiente && showRechazar && (
              <>
                <button
                  type="button"
                  onClick={() => { setShowRechazar(false); setMotivo(""); }}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {t("no_regresar")}
                </button>
                <button
                  type="button"
                  onClick={handleRechazar}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {busy === "rechazar"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <XCircle className="w-4 h-4" />}
                  {t("si_rechazar_cita")}
                </button>
              </>
            )}

            {isConfirmado && !showCancelar && (
              <button
                type="button"
                onClick={() => { setShowCancelar(true); setMotivo(""); }}
                disabled={!!busy}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
                {t("cancelar")}
              </button>
            )}

            {isConfirmado && showCancelar && (
              <>
                <button
                  type="button"
                  onClick={() => { setShowCancelar(false); setMotivo(""); }}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {t("no_regresar")}
                </button>
                <button
                  type="button"
                  onClick={handleCancelar}
                  disabled={!!busy}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {busy === "cancelar"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Ban className="w-4 h-4" />}
                  {t("si_cancelar_cita")}
                </button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
