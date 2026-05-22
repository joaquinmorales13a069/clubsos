/**
 * Admin — Doctor detail (Phase 4 · Step 7)
 *
 * Server Component: verifies admin role, then renders AdminDoctorDetalle.
 */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import AdminDoctorDetalle from "@/components/dashboard/admin/AdminDoctorDetalle";

export default async function AdminDoctorDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const locale   = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("users")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "admin") redirect(`/${locale}/dashboard`);

  return <AdminDoctorDetalle doctorId={id} locale={locale} />;
}
