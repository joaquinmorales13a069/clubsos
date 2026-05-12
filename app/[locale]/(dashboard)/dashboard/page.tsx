/**
 * Miembro Dashboard — Inicio (Home Overview)
 * Server Component: fetches all home data in parallel, renders shell + cards.
 * Step 5.2
 */

import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import CredentialCard from "@/components/dashboard/miembro/CredentialCard";
import QuickActions from "@/components/dashboard/miembro/QuickActions";
import ProximaCitaCard from "@/components/dashboard/miembro/ProximaCitaCard";
import RecentBeneficiosCard from "@/components/dashboard/miembro/RecentBeneficiosCard";
import RecentDocumentosCard from "@/components/dashboard/miembro/RecentDocumentosCard";
import RecentAvisosCard from "@/components/dashboard/miembro/RecentAvisosCard";
import MisServiciosCubiertos from "@/components/dashboard/miembro/MisServiciosCubiertos";
import MfaBanner from "@/components/dashboard/MfaBanner";

export default async function MiembroDashboardPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = await getTranslations("Dashboard.miembro.inicio");

  // Defence-in-depth session check (middleware already handles redirect)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Fetch all home data in parallel.
  // RLS policies scope each query to the authenticated user automatically.
  const [profileRes, citaRes, beneficiosRes, documentosRes, avisosRes, mfaRes] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, nombre_completo, estado, sexo, fecha_nacimiento, empresas(nombre)")
        .eq("id", user.id)
        .single(),

      // Next upcoming appointment (pendiente or confirmado)
      supabase
        .from("citas")
        .select("id, fecha_hora_cita, estado_sync, servicio_asociado")
        .in("estado_sync", ["pendiente", "confirmado"])
        .order("fecha_hora_cita", { ascending: true })
        .limit(1)
        .maybeSingle(),

      // Last 3 active benefits (RLS auto-filters by empresa)
      supabase
        .from("beneficios")
        .select("id, titulo, tipo_beneficio, fecha_fin, beneficio_image_url")
        .eq("estado_beneficio", "activa")
        .order("created_at", { ascending: false })
        .limit(3),

      // Last 3 active medical documents for this user only
      supabase
        .from("documentos_medicos")
        .select("id, nombre_documento, tipo_documento, file_path, tipo_archivo, fecha_documento, created_at")
        .eq("usuario_id", user.id)
        .eq("estado_archivo", "activo")
        .order("created_at", { ascending: false })
        .limit(3),

      // Last 2 active announcements (RLS auto-filters by empresa)
      supabase
        .from("avisos")
        .select("id, titulo, descripcion, created_at")
        .eq("estado_aviso", "activa")
        .order("created_at", { ascending: false })
        .limit(2),

      supabase.auth.mfa.listFactors(),
    ]);

  const mfaEnrolled = (mfaRes.data?.totp?.length ?? 0) > 0;

  const profile = profileRes.data;
  // Extract first name for the greeting
  const firstName = profile?.nombre_completo?.split(" ")[0] ?? "Miembro";
  // Supabase returns joined table as object or array — normalize to {nombre} | null
  const empresasRaw = profile?.empresas;
  const empresas: { nombre: string } | null = Array.isArray(empresasRaw)
    ? (empresasRaw[0] as { nombre: string } | undefined) ?? null
    : empresasRaw
      ? (empresasRaw as unknown as { nombre: string })
      : null;

  return (
    <div className="space-y-6">
      {!mfaEnrolled && <MfaBanner />}

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-poppins font-bold text-gray-900">
          {t("greeting")}{" "}
          <span className="text-primary">{firstName}</span>
        </h1>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("greetingSub")}</p>
      </div>

      {/* Digital Credential Card */}
      <CredentialCard
        id={profile?.id ?? ""}
        nombreCompleto={profile?.nombre_completo ?? "—"}
        empresaNombre={empresas?.nombre ?? null}
        estado={(profile?.estado as "activo" | "inactivo" | "pendiente") ?? "pendiente"}
        sexo={(profile?.sexo as "masculino" | "femenino") ?? null}
        fechaNacimiento={profile?.fecha_nacimiento ?? null}
      />

      {/* Quick action shortcuts */}
      <QuickActions locale={locale} />

      {/* Covered services KPI — client component, renders nothing if no contract rows */}
      <MisServiciosCubiertos userId={user.id} />

      {/* 2×2 info cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ProximaCitaCard cita={citaRes.data ?? null} locale={locale} />
        <RecentBeneficiosCard beneficios={beneficiosRes.data ?? []} locale={locale} />
        <RecentDocumentosCard documentos={documentosRes.data ?? []} locale={locale} />
        <RecentAvisosCard avisos={avisosRes.data ?? []} locale={locale} />
      </div>
    </div>
  );
}
