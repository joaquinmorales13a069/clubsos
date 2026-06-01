"use client";

/**
 * CitaActions — State-aware action buttons for a cita detail panel.
 * Uses existing API endpoints (no direct RPC calls):
 *   POST /api/admin/citas/[id]/confirmar
 *   POST /api/admin/citas/[id]/rechazar
 *   POST /api/citas/[id]/cancelar
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Ban } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CitaForActions {
  id:              string;
  fecha_hora_cita: string;
  estado_sync:     string;
}

interface CitaActionsProps {
  cita: CitaForActions;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CitaActions({ cita }: CitaActionsProps) {
  const t      = useTranslations("Dashboard.admin.citas.calendario.modal");
  const tShared = useTranslations("Dashboard.shared");
  const tErr   = useTranslations();
  const router = useRouter();

  const [busy,         setBusy]         = useState<null | "confirmar" | "rechazar" | "cancelar">(null);
  const [motivo,       setMotivo]       = useState("");
  const [showRechazar, setShowRechazar] = useState(false);
  const [showCancelar, setShowCancelar] = useState(false);
  const nowRef = useState(() => Date.now())[0];

  // ── Derived ────────────────────────────────────────────────────────────────
  const estado      = cita.estado_sync;
  const isPendiente = estado.startsWith("pendiente");
  const isConfirmado = estado === "confirmado";
  const esPasada    = new Date(cita.fecha_hora_cita).getTime() < nowRef;

  // ── Error helper ───────────────────────────────────────────────────────────
  const safeErrorMsg = (j: { i18nKey?: string; error?: string }): string => {
    if (j?.i18nKey) {
      try { return tErr(j.i18nKey as Parameters<typeof tErr>[0]); } catch { /* fall through */ }
    }
    return j?.error ?? "Error";
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleConfirmar = async () => {
    setBusy("confirmar");
    try {
      const res = await fetch(`/api/admin/citas/${cita.id}/confirmar`, { method: "POST" });
      const j   = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(safeErrorMsg(j)); return; }
      toast.success(t("confirmar_ok"));
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleRechazar = async () => {
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
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleCancelar = async () => {
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
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  // ── Nothing to show for terminal states ────────────────────────────────────
  if (!isPendiente && !isConfirmado) return null;

  const labelCls = "text-xs font-roboto font-medium text-gray-500 uppercase tracking-wide";

  return (
    <div className="pt-4 border-t border-gray-100 space-y-3">
      {/* Motivo rechazar input */}
      {showRechazar && (
        <div className="space-y-1.5">
          <label className={labelCls}>{t("motivo_rechazo")}</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-secondary/30"
          />
        </div>
      )}

      {/* Motivo cancelar input */}
      {showCancelar && (
        <div className="space-y-1.5">
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

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {/* ── Pendiente: confirm / reject ─────────────────────────────────── */}
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

        {/* ── Confirmado: cancel or finalizada badge ──────────────────────── */}
        {isConfirmado && esPasada && (
          <span className="inline-flex items-center gap-1.5 text-xs font-roboto text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
            <Ban className="w-3.5 h-3.5" />
            {tShared("citaFinalizadaNoCancelable")}
          </span>
        )}

        {isConfirmado && !esPasada && !showCancelar && (
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

        {isConfirmado && !esPasada && showCancelar && (
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
      </div>
    </div>
  );
}

