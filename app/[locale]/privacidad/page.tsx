import { getTranslations, getLocale } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default async function PrivacidadPage() {
  const t  = await getTranslations("Legal.privacy");
  const tl = await getTranslations("Legal");
  const locale = await getLocale();

  const sections = [
    { title: t("s1Title"), body: t("s1Body") },
    { title: t("s2Title"), body: t("s2Body") },
    { title: t("s3Title"), body: t("s3Body") },
    { title: t("s4Title"), body: t("s4Body") },
    { title: t("s5Title"), body: t("s5Body") },
    { title: t("s6Title"), body: t("s6Body"), id: "eliminacion-de-datos" },
    { title: t("s7Title"), body: t("s7Body") },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href={`/${locale}/login`}
            className="flex items-center gap-2 text-sm font-roboto font-medium text-gray-500
                       hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {tl("backLink")}
          </Link>
          <div className="flex items-center gap-3">
            <Image
              src="/logo-SOSMedical.webp"
              alt="SOS Medical"
              width={120}
              height={30}
              className="object-contain h-8"
              style={{ width: "auto" }}
            />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Page title */}
        <div className="flex items-start gap-3 mb-8">
          <div className="mt-1 p-2 rounded-xl bg-secondary/5 shrink-0">
            <ShieldCheck className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h1 className="font-poppins font-bold text-2xl text-gray-900">
              {t("title")}
            </h1>
            <p className="text-sm font-roboto text-neutral/60 mt-1">
              {t("subtitle")}
            </p>
            <p className="text-xs font-roboto text-gray-400 mt-1">
              {tl("lastUpdated")}
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {sections.map((s) => (
            <div
              key={s.title}
              id={s.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
            >
              <h2 className="font-poppins font-semibold text-sm text-gray-900 mb-2">
                {s.title}
              </h2>
              <p className="font-roboto text-sm text-neutral/80 leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs font-roboto text-gray-400 mt-10">
          © {new Date().getFullYear()} SOS Medical. ClubSOS.
        </p>
      </main>
    </div>
  );
}
