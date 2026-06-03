"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, AlertCircle } from "lucide-react";

interface PasoPagaditoRedirectProps {
  citaId:           string;
  onChangeMetodo:   () => void;  // back to PasoPago
}

type Status = "generando_link" | "redirigiendo" | "error";

export default function PasoPagaditoRedirect({ citaId, onChangeMetodo }: PasoPagaditoRedirectProps) {
  const t = useTranslations("Dashboard.miembro.citas.wizard.pagadito");
  const [status, setStatus]     = useState<Status>("generando_link");
  const [errorMsg, setErrorMsg] = useState<string>("");
  // Guard against React StrictMode dev double-mount: each init call creates a
  // real Pagadito transaction (different ERN per second) and only the second
  // would be persisted to pagos.pagadito_token; the first would orphan until
  // Pagadito EXPIREs it. Ref persists across the StrictMode unmount/remount.
  const firedRef = useRef(false);

  async function generate(): Promise<void> {
    setStatus("generando_link");
    setErrorMsg("");

    const res = await fetch(`/api/citas/${citaId}/pagadito/init`, { method: "POST" });
    const body = await res.json().catch(() => ({}));

    if (!res.ok || !body.redirect_url) {
      const key = (body.i18nKey as string | undefined) ?? "generic";
      let msg: string;
      try { msg = t(`errors.${key}`); } catch { msg = t("errors.generic"); }
      setErrorMsg(msg);
      setStatus("error");
      return;
    }

    setStatus("redirigiendo");
    // Brief delay so the user sees the redirect state before navigating away.
    setTimeout(() => {
      window.location.href = body.redirect_url as string;
    }, 800);
  }

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void generate();
    // citaId is set once when this step mounts; no need to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "error") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
          <p className="text-sm font-roboto text-red-900">{errorMsg}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onChangeMetodo}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("cambiar_metodo")}
          </button>
          <button
            type="button"
            onClick={() => void generate()}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90"
          >
            {t("reintentar")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-base font-poppins font-semibold text-gray-900">
        {status === "generando_link" ? t("generando_link") : t("redirigiendo")}
      </p>
    </div>
  );
}
