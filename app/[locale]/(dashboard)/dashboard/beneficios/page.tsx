import { getTranslations } from "next-intl/server";
import { Gift } from "lucide-react";

// Placeholder — full implementation in Step 5.4

export default async function BeneficiosPage() {
  const t = await getTranslations("Dashboard.miembro.beneficios");
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center">
        <Gift className="w-8 h-8 text-secondary" />
      </div>
      <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("title")}</h1>
      <p className="text-neutral max-w-sm font-roboto">{t("subtitle")}</p>
      <span className="text-xs text-neutral/60 bg-gray-100 px-3 py-1 rounded-full">{t("comingSoon")}</span>
    </div>
  );
}
