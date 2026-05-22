/**
 * Legacy redirect — la vista calendario ahora vive en
 * /admin/citas?view=calendario (toggle Lista/Calendario en la misma página).
 * Cualquier link viejo a /admin/citas/calendario sigue funcionando.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function CalendarioRedirect() {
  const locale = await getLocale();
  redirect(`/${locale}/dashboard/admin/citas?view=calendario`);
}
