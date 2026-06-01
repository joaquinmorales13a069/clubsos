import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import SplitPaneClient from "./_split-pane-client";

interface BeneficiosLayoutProps {
  list: React.ReactNode;
  detail: React.ReactNode;
}

export default async function BeneficiosAdminLayout({ list, detail }: BeneficiosLayoutProps) {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return <SplitPaneClient list={list} detail={detail} />;
}
