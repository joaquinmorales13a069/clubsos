/**
 * FamiliaPage — Step 5.7
 * Server Component: only accessible by titulares.
 * Fetches first page of familiares + total count.
 */

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { ShieldOff } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import MiFamilia from "@/components/dashboard/miembro/familia/MiFamilia";

const PAGE_SIZE = 10;

export default async function FamiliaPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Fetch profile to check tipo_cuenta
  const { data: profile } = await supabase
    .from("users")
    .select("id, tipo_cuenta")
    .eq("id", user.id)
    .single();

  // If not titular, show access denied (defence-in-depth — sidebar already hides the link)
  if (profile?.tipo_cuenta !== "titular") {
    const t = await getTranslations("Dashboard.miembro.familia");
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
          <ShieldOff className="w-8 h-8 text-gray-400" />
        </div>
        <h1 className="text-xl font-poppins font-bold text-gray-700">{t("accessDeniedTitle")}</h1>
        <p className="text-sm font-roboto text-neutral max-w-xs">{t("accessDeniedSub")}</p>
      </div>
    );
  }

  const { data, count } = await supabase
    .from("users")
    .select("id, nombre_completo, tipo_cuenta, telefono, estado", { count: "exact" })
    .eq("titular_id", user.id)
    .order("nombre_completo", { ascending: true })
    .range(0, PAGE_SIZE - 1);

  return (
    <MiFamilia
      initialData={(data as Parameters<typeof MiFamilia>[0]["initialData"]) ?? []}
      initialCount={count ?? 0}
      titularId={user.id}
    />
  );
}
