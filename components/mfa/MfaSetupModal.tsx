"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

interface MfaSetupModalProps {
  open: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}

type Phase = "loading" | "scan" | "verify";

type EnrollData = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export default function MfaSetupModal({ open, onClose, onEnrolled }: MfaSetupModalProps) {
  const t = useTranslations("MFA.setup");
  const supabase = useMemo(() => createClient(), []);

  const [phase, setPhase] = useState<Phase>("loading");
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const startEnroll = useCallback(async () => {
    setPhase("loading");
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "ClubSOS",
    });
    if (error || !data) {
      toast.error(t("enrollError"));
      onClose();
      return;
    }
    setEnrollData({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setPhase("scan");
  }, [supabase, onClose, t]);

  useEffect(() => {
    if (open) {
      setCode("");
      setEnrollData(null);
      startEnroll();
    }
  }, [open, startEnroll]);

  const handleClose = useCallback(async () => {
    // enrollData is set to null on successful verification before onClose() is called,
    // so this only unenrolls factors that were never verified.
    if (enrollData) {
      await supabase.auth.mfa.unenroll({ factorId: enrollData.factorId });
    }
    setPhase("loading");
    setEnrollData(null);
    setCode("");
    onClose();
  }, [enrollData, supabase, onClose]);

  async function handleVerify() {
    if (!enrollData || code.length !== 6 || submitting) return;
    setSubmitting(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollData.factorId,
      code,
    });
    setSubmitting(false);
    if (error) {
      toast.error(t("errorToast"));
      setCode("");
      return;
    }
    toast.success(t("successToast"));
    setPhase("loading");
    setEnrollData(null);
    setCode("");
    onEnrolled();
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-secondary" />
            <h2 className="font-poppins font-semibold text-gray-900">{t("title")}</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label={t("close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-8 pt-5 space-y-5">
          {phase === "loading" && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-secondary" />
            </div>
          )}

          {phase === "scan" && enrollData && (
            <>
              <div>
                <p className="text-sm font-semibold font-poppins text-gray-900">{t("scanTitle")}</p>
                <p className="text-xs font-roboto text-neutral mt-1">{t("scanDesc")}</p>
              </div>

              <div className="flex justify-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollData.qrCode)}`}
                  alt={t("qrAlt")}
                  className="w-48 h-48"
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-400 font-roboto uppercase tracking-wide">
                  {t("manualLabel")}
                </p>
                <p className="font-mono text-xs bg-gray-50 rounded-lg px-3 py-2 text-gray-700 break-all select-all border border-gray-100">
                  {enrollData.secret}
                </p>
              </div>

              <button
                onClick={() => setPhase("verify")}
                className="w-full py-3 rounded-xl bg-secondary text-white font-roboto font-semibold text-sm hover:bg-secondary/90 transition-colors"
              >
                {t("scannedCTA")}
              </button>
            </>
          )}

          {phase === "verify" && (
            <>
              <div>
                <p className="text-sm font-semibold font-poppins text-gray-900">{t("verifyTitle")}</p>
                <p className="text-xs font-roboto text-neutral mt-1">{t("verifyDesc")}</p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={submitting}
                className="w-full text-center text-2xl font-mono tracking-[0.5em] py-4 rounded-xl border border-gray-200 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 disabled:opacity-50"
                placeholder="······"
                autoFocus
                autoComplete="one-time-code"
              />

              <button
                onClick={handleVerify}
                disabled={code.length !== 6 || submitting}
                className="w-full py-3 rounded-xl bg-primary text-white font-roboto font-semibold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("confirm")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
