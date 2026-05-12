"use client";

import { useState, useMemo } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createClient } from "@/utils/supabase/client";
import MfaSetupModal from "@/components/mfa/MfaSetupModal";

interface MfaSectionProps {
  enrolled: boolean;
  factorId: string | null;
}

export default function MfaSection({ enrolled: initialEnrolled, factorId: initialFactorId }: MfaSectionProps) {
  const t = useTranslations("MFA.section");
  const supabase = useMemo(() => createClient(), []);

  const [enrolled, setEnrolled] = useState(initialEnrolled);
  const [factorId, setFactorId] = useState(initialFactorId);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disabling, setDisabling] = useState(false);

  async function handleDisable() {
    if (!factorId) return;
    setDisabling(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setDisabling(false);
    if (error) {
      toast.error(t("disableError"));
      return;
    }
    toast.success(t("disableSuccess"));
    setEnrolled(false);
    setFactorId(null);
    setConfirming(false);
  }

  async function handleEnrolled() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error(t("enrollRefreshError"));
      return;
    }
    const factor = data?.totp[0];
    setEnrolled(true);
    setFactorId(factor?.id ?? null);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
        <ShieldCheck className="w-4 h-4 text-secondary" />
        <h2 className="text-base font-poppins font-semibold text-gray-900">{t("title")}</h2>
        <span
          className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${
            enrolled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {enrolled ? t("statusActive") : t("statusInactive")}
        </span>
      </div>

      <div className="px-6 py-5 space-y-4">
        {enrolled ? (
          <>
            <p className="text-sm font-roboto text-neutral">{t("enabledDesc")}</p>

            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                className="flex items-center gap-1.5 text-sm font-roboto font-semibold text-red-600 hover:text-red-700 transition-colors"
              >
                <ShieldOff className="w-4 h-4" />
                {t("disableCTA")}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-roboto text-gray-700">{t("disableConfirm")}</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDisable}
                    disabled={disabling}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-roboto font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {disabling ? t("disabling") : t("disableConfirmCTA")}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-roboto font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-roboto text-neutral">{t("disabledDesc")}</p>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-roboto font-semibold hover:bg-secondary/90 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              {t("enableCTA")}
            </button>
          </>
        )}
      </div>

      <MfaSetupModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onEnrolled={handleEnrolled}
      />
    </div>
  );
}
