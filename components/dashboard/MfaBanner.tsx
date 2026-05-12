"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import MfaSetupModal from "@/components/mfa/MfaSetupModal";

export default function MfaBanner() {
  const t = useTranslations("MFA.banner");
  const [hidden, setHidden] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  if (hidden) return null;

  return (
    <>
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-poppins font-semibold leading-snug">{t("title")}</p>
          <p className="text-xs font-roboto text-amber-700 mt-0.5">{t("description")}</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="shrink-0 text-xs font-roboto font-semibold px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 transition-colors whitespace-nowrap"
        >
          {t("cta")}
        </button>
      </div>

      <MfaSetupModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onEnrolled={() => setHidden(true)}
      />
    </>
  );
}
