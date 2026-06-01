import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import SplitPaneClient from "./_split-pane-client";

interface CitasMiembroLayoutProps {
  list:   React.ReactNode;
  detail: React.ReactNode;
}

export default async function CitasMiembroLayout({ list, detail }: CitasMiembroLayoutProps) {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return <SplitPaneClient list={list} detail={detail} />;
}
