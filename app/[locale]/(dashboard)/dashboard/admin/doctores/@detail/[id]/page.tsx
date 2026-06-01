/**
 * Admin — Doctor detail (Phase 4 · Step 7)
 *
 * Server Component: role gate is handled by the parent layout.
 * Renders AdminDoctorDetalle inside the @detail parallel slot.
 */
import { getLocale } from "next-intl/server";
import AdminDoctorDetalle from "@/components/dashboard/admin/AdminDoctorDetalle";
import BackButton from "@/components/dashboard/shared/BackButton";

export default async function AdminDoctorDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale  = await getLocale();

  return (
    <>
      <BackButton href={`/${locale}/dashboard/admin/doctores`} />
      <AdminDoctorDetalle doctorId={id} locale={locale} />
    </>
  );
}
