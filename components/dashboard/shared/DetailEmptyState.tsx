import { getTranslations } from "next-intl/server";
import { Inbox } from "lucide-react";

export default async function DetailEmptyState() {
  const t = await getTranslations("Dashboard.shared");

  return (
    <div className="hidden md:flex flex-col items-center justify-center text-center p-8 bg-white/60 rounded-2xl border border-dashed border-gray-200 min-h-[280px]">
      <Inbox className="w-10 h-10 text-gray-300 mb-3" />
      <p className="text-sm font-roboto font-medium text-gray-600">
        {t("detailEmpty")}
      </p>
      <p className="text-xs font-roboto text-neutral mt-1">
        {t("detailEmptyHint")}
      </p>
    </div>
  );
}
