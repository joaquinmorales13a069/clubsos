/**
 * DocumentosPage — Step 5.5
 * Server Component: prefetches first page + total count, passes to MisDocumentos.
 */

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import MisDocumentos from "@/components/dashboard/miembro/documentos/MisDocumentos";

const PAGE_SIZE = 12;

export default async function DocumentosPage() {
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data, count } = await supabase
    .from("documentos_medicos")
    .select(
      "id, nombre_documento, tipo_documento, file_path, tipo_archivo, fecha_documento, created_at, subido_por_user:users!subido_por(nombre_completo)",
      { count: "exact" },
    )
    .eq("usuario_id", user.id)
    .eq("estado_archivo", "activo")
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);

  return (
    <MisDocumentos
      userId={user.id}
      initialData={(data as unknown as Parameters<typeof MisDocumentos>[0]["initialData"]) ?? []}
      initialCount={count ?? 0}
    />
  );
}
