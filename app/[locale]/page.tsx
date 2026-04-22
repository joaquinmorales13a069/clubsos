import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("Index");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="bg-white/50 backdrop-blur-md rounded-2xl shadow-md p-8 text-center max-w-md border border-neutral/10">
        <h1 className="text-3xl font-poppins text-primary font-bold mb-4">{t("title")}</h1>
        <p className="text-neutral font-inter">{t("description")}</p>
      </div>
    </div>
  );
}
