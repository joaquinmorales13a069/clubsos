import { redirect }   from "next/navigation";
import { getLocale }  from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import MisAvisos from "@/components/dashboard/miembro/avisos/MisAvisos";

export default async function AvisosPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return <MisAvisos />;
}
