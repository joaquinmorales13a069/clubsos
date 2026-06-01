import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import SplitPaneClient from "./_split-pane-client";

interface AvisosLayoutProps {
  list: React.ReactNode;
  detail: React.ReactNode;
}

export default async function AvisosMiembroLayout({ list, detail }: AvisosLayoutProps) {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return <SplitPaneClient list={list} detail={detail} />;
}
