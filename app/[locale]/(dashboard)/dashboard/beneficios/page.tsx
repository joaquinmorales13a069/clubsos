/**
 * BeneficiosPage — Step 5.4
 * Server Component: prefetches first page + total count, passes to BeneficiosGrid.
 */

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import BeneficiosGrid from "@/components/dashboard/miembro/beneficios/BeneficiosGrid";

const PAGE_SIZE = 12;

export default async function BeneficiosPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data, count } = await supabase
    .from("beneficios")
    .select("id, titulo, descripcion, fecha_inicio, fecha_fin, tipo_beneficio, beneficio_image_url", {
      count: "exact",
    })
    .eq("estado_beneficio", "activa")
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);

  return (
    <BeneficiosGrid
      initialData={data ?? []}
      initialCount={count ?? 0}
    />
  );
}
