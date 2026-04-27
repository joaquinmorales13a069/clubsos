/**
 * Admin — Ajustes del Sistema (Step 7.8)
 *
 * Server Component: fetches profile, admin KPIs, and active empresas in parallel.
 * Renders three cards:
 *   A — Perfil del administrador  (AjustesForm)
 *   B — Información del sistema   (read-only display)
 *   C — Gestionar Avisos          (AvisosAdmin CRUD)
 */

import { redirect }                 from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient }             from "@/utils/supabase/server";
import AjustesForm                  from "@/components/dashboard/miembro/ajustes/AjustesForm";
import AvisosAdmin                  from "@/components/dashboard/admin/AvisosAdmin";
import {
  Settings,
  User,
  Megaphone,
  Server,
  Building2,
  Users,
  CalendarDays,
  FileText,
  Gift,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminKpis = {
  total_empresas:     number;
  empresas_activas:   number;
  total_usuarios:     number;
  usuarios_activos:   number;
  citas_pendientes:   number;
  citas_mes:          number;
  docs_total:         number;
  beneficios_activos: number;
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminSistemaPage() {
  const supabase = await createClient();
  const locale   = await getLocale();
  const t        = await getTranslations("Dashboard.admin.sistema");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Fetch all data in parallel
  const [profileResult, kpisResult, empresasResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, nombre_completo, documento_identidad, rol, tipo_cuenta, fecha_nacimiento, username, telefono, email")
      .eq("id", user.id)
      .single(),
    supabase.rpc("get_admin_kpis"),
    supabase
      .from("empresas")
      .select("id, nombre")
      .eq("estado", "activa")
      .order("nombre"),
  ]);

  // Guard: only global admin
  if (profileResult.data?.rol !== "admin") redirect(`/${locale}/dashboard`);

  const profile = profileResult.data;
  const kpis    = (kpisResult.data ?? {}) as AdminKpis;
  const empresas = (empresasResult.data ?? []) as { id: string; nombre: string }[];

  // App version & deploy date from env vars (with fallbacks)
  const appVersion  = process.env.NEXT_PUBLIC_APP_VERSION  ?? "v2.0.0";
  const deployDate  = process.env.NEXT_PUBLIC_DEPLOY_DATE  ?? "—";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <Settings className="w-5 h-5 text-gray-500" />
        </div>
        <div>
          <h1 className="text-xl font-poppins font-bold text-gray-900">{t("titulo")}</h1>
          <p className="text-sm font-roboto text-neutral">{t("subtitle")}</p>
        </div>
      </div>

      {/* ── Card A — Perfil del administrador ─────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <User className="w-4.5 h-4.5 text-secondary" />
          <h2 className="text-base font-poppins font-semibold text-gray-900">{t("perfilTitulo")}</h2>
        </div>
        <div className="px-6 py-5">
          <AjustesForm
            profile={{
              id:                  user.id,
              nombre_completo:     profile?.nombre_completo     ?? null,
              documento_identidad: profile?.documento_identidad ?? null,
              rol:                 profile?.rol                 ?? "admin",
              tipo_cuenta:         profile?.tipo_cuenta         ?? "titular",
              fecha_nacimiento:    profile?.fecha_nacimiento    ?? null,
              username:            profile?.username            ?? null,
              telefono:            profile?.telefono            ?? null,
              email:               user.email                  ?? null,
            }}
          />
        </div>
      </div>

      {/* ── Card B — Información del sistema ─────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <Server className="w-4.5 h-4.5 text-secondary" />
          <h2 className="text-base font-poppins font-semibold text-gray-900">{t("sistemaTitulo")}</h2>
        </div>
        <div className="px-6 py-5 space-y-5">
          {/* Version & deploy */}
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide font-roboto">{t("sistemaVersion")}</span>
              <span className="text-sm font-semibold font-mono text-gray-800">{appVersion}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide font-roboto">{t("sistemaDeploy")}</span>
              <span className="text-sm font-mono text-gray-700">{deployDate}</span>
            </div>
          </div>

          {/* KPI record counts */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide font-roboto mb-3">{t("sistemaRegistros")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { icon: Building2, label: t("kpiEmpresas"),    value: kpis.total_empresas     ?? "—", color: "bg-blue-50 text-blue-600" },
                { icon: Users,     label: t("kpiUsuarios"),    value: kpis.total_usuarios     ?? "—", color: "bg-emerald-50 text-emerald-600" },
                { icon: CalendarDays, label: t("kpiCitas"),   value: kpis.citas_mes          ?? "—", color: "bg-amber-50 text-amber-600" },
                { icon: FileText,  label: t("kpiDocumentos"), value: kpis.docs_total         ?? "—", color: "bg-purple-50 text-purple-600" },
                { icon: Gift,      label: t("kpiBeneficios"), value: kpis.beneficios_activos ?? "—", color: "bg-rose-50 text-rose-500" },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-roboto leading-tight">{label}</p>
                    <p className="text-base font-bold font-poppins text-gray-900">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Card C — Gestionar Avisos ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <Megaphone className="w-4.5 h-4.5 text-secondary" />
          <h2 className="text-base font-poppins font-semibold text-gray-900">{t("avisosTitulo")}</h2>
        </div>
        <div className="p-6">
          <AvisosAdmin userId={user.id} empresas={empresas} />
        </div>
      </div>
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
