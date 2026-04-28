"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";

interface DatosBancarios {
  banco:           string;
  numero_cuenta:   string;
  iban:            string;
  nombre_titular?: string;
}

interface PasoTransferenciaProps {
  citaId:         string;
  datosBancarios: DatosBancarios | null;
  onSuccess:      () => void;
}

export default function PasoTransferencia({ citaId, datosBancarios, onSuccess }: PasoTransferenciaProps) {
  const t = useTranslations("Dashboard.miembro.citas.wizard.transferencia");
  const [referencia, setReferencia] = useState("");
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);

  async function submit() {
    if (!referencia.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/citas/${citaId}/referencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referencia: referencia.trim() }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Error");
      setDone(true);
      toast.success(t("success_toast"));
      setTimeout(onSuccess, 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error_toast"));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <p className="font-semibold text-gray-900">{t("done_title")}</p>
        <p className="text-sm text-neutral">{t("done_subtitle")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{t("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      {datosBancarios && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-1 text-sm">
          <p className="font-semibold text-blue-800">{t("bank_details")}</p>
          {datosBancarios.nombre_titular && (
            <p className="text-blue-700">{t("titular")}: <span className="font-medium">{datosBancarios.nombre_titular}</span></p>
          )}
          <p className="text-blue-700">{t("banco")}: <span className="font-medium">{datosBancarios.banco}</span></p>
          <p className="text-blue-700">{t("cuenta")}: <span className="font-medium">{datosBancarios.numero_cuenta}</span></p>
          <p className="text-blue-700">IBAN: <span className="font-medium">{datosBancarios.iban}</span></p>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">{t("referencia_label")}</label>
        <input
          type="text"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          placeholder={t("referencia_placeholder")}
          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <button
        onClick={submit}
        disabled={loading || !referencia.trim()}
        className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("submit")}
      </button>
    </div>
  );
}
