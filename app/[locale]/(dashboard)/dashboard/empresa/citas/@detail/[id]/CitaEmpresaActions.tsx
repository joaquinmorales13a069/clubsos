"use client";

/**
 * CitaEmpresaActions — State-aware action buttons for empresa_admin cita detail.
 * The empresa_admin can confirm/reject pendiente_empresa citas and cancel
 * confirmed ones (before the appointment time).
 *
 * Uses:
 *   POST /api/admin/citas/[id]/confirmar  — also works for empresa_admin (RLS guards company scope)
 *   POST /api/admin/citas/[id]/rechazar   — same
 *   POST /api/citas/[id]/cancelar         — member-facing cancel (auth only)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

interface CitaForActions {
  id:              string;
  fecha_hora_cita: string;
  estado_sync:     string;
}

interface CitaEmpresaActionsProps {
  cita: CitaForActions;
}

export default function CitaEmpresaActions({ cita }: CitaEmpresaActionsProps) {
  const t       = useTranslations("Dashboard.empresa.registroCitas");
  const tModal  = useTranslations("Dashboard.admin.citas.calendario.modal");
  const tShared = useTranslations("Dashboard.shared");
  const tErr    = useTranslations();
  const router  = useRouter();

  const [busy,         setBusy]         = useState<null | "confirmar" | "rechazar" | "cancelar">(null);
  const [motivo,       setMotivo]       = useState("");
  const [showRechazar, setShowRechazar] = useState(false);
  const [showCancelar, setShowCancelar] = useState(false);
  const nowRef = useState(() => Date.now())[0];

  const estado      = cita.estado_sync;
  const isPendiente = estado.startsWith("pendiente");
  const isConfirmado = estado === "confirmado";
  const esPasada    = new Date(cita.fecha_hora_cita).getTime() < nowRef;

  const safeErrorMsg = (j: { i18nKey?: string; error?: string }): string => {
    if (j?.i18nKey) {
      try { return tErr(j.i18nKey as Parameters<typeof tErr>[0]); } catch { /* fall through */ }
    }
    return j?.error ?? "Error";
  };

  const handleConfirmar = async () => {
    setBusy("confirmar");
    try {
      const res = await fetch(`/api/admin/citas/${cita.id}/confirmar`, { method: "POST" });
      const j   = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(safeErrorMsg(j)); return; }
      toast.success(tModal("confirmar_ok"));
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
      toast.success(tModal("rechazar_ok"));
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleCancelar = async () => {
    if (!motivo.trim()) {
      toast.error(tModal("motivo_cancelacion"));
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
      toast.success(tModal("cancelar_ok"));
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  if (!isPendiente && !isConfirmado) return null;

  const labelCls = "text-xs font-roboto font-medium text-gray-500 uppercase tracking-wide";

  return (
    <div className="pt-4 border-t border-gray-100 space-y-3">
      {showRechazar && (
        <div className="space-y-1.5">
          <label className={labelCls}>{tModal("motivo_rechazo")}</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-secondary/30"
          />
        </div>
      )}

      {showCancelar && (
        <div className="space-y-1.5">
          <label className={labelCls}>{tModal("motivo_cancelacion")}</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder={tModal("cancelado_por_admin")}
            className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-secondary/30"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isPendiente && !showRechazar && (
          <>
            <button
              type="button"
              onClick={() => { setShowRechazar(true); setShowCancelar(false); setMotivo(""); }}
              disabled={!!busy}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              {t("rechazarBtn")}
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
              {t("aprobarBtn")}
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
              {tModal("no_regresar")}
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
              {tModal("si_rechazar_cita")}
            </button>
          </>
        )}

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
            {tModal("cancelar")}
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
              {tModal("no_regresar")}
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
              {tModal("si_cancelar_cita")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function badgeCls(estado: string): string {
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
  return cn(
    "inline-block px-2 py-0.5 rounded-full text-xs font-medium",
    ESTADO_COLORS[estado] ?? "bg-gray-100 text-gray-600",
  );
}
