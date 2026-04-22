import { useTranslations } from "next-intl";

/**
 * Dashboard — Miembro view (placeholder)
 * Full implementation comes in Step 5 (feature/dashboard-miembro).
 */
export default function MiembroDashboardPage() {
  return <MiembroPlaceholder />;
}

function MiembroPlaceholder() {
  const t = useTranslations("Dashboard.miembro");
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <span className="text-3xl">🏥</span>
      </div>
      <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("title")}</h1>
      <p className="text-neutral max-w-sm font-roboto">{t("subtitle")}</p>
      <span className="text-xs text-neutral/60 bg-gray-100 px-3 py-1 rounded-full">
        {t("comingSoon")}
      </span>
    </div>
  );
}
