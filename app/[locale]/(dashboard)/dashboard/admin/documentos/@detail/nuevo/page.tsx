import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import DetailPanel from "@/components/dashboard/shared/DetailPanel";
import BackButton from "@/components/dashboard/shared/BackButton";
import NuevoDocumentoForm from "./_NuevoDocumentoForm";

export default async function NuevoDocumentoPage() {
  const locale = await getLocale();
  const t = await getTranslations("Dashboard.admin.documentos.form");
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/documentos`} />
      <DetailPanel title={t("nuevoTitle")} closeHref={`/${locale}/dashboard/admin/documentos`}>
        <NuevoDocumentoForm
          uploadedBy={user?.id ?? ""}
          locale={locale}
        />
      </DetailPanel>
    </>
  );
}
