"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

interface MfaVerifyFormProps {
  factorId: string;
}

export default function MfaVerifyForm({ factorId }: MfaVerifyFormProps) {
  const t = useTranslations("MFA.verify");
  const router = useRouter();
  const locale = useLocale();
  const supabase = createClient();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVerify(value: string) {
    if (value.length !== 6 || loading) return;
    setLoading(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: value });
    setLoading(false);
    if (error) {
      toast.error(t("errorInvalid"));
      setCode("");
      return;
    }
    router.replace(`/${locale}/dashboard`);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) handleVerify(digits);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-poppins font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm font-roboto text-neutral">{t("description")}</p>
      </div>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={code}
        onChange={handleChange}
        disabled={loading}
        className="w-full text-center text-2xl font-mono tracking-[0.5em] py-4 rounded-xl border border-gray-200 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 disabled:opacity-50"
        placeholder="······"
        autoFocus
        autoComplete="one-time-code"
      />

      <button
        onClick={() => handleVerify(code)}
        disabled={code.length !== 6 || loading}
        className="w-full py-3 rounded-xl bg-primary text-white font-roboto font-semibold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("submit")}
      </button>

      <p className="text-center text-xs font-roboto text-neutral/60">{t("support")}</p>
    </div>
  );
}
