/**
 * Dashboard Layout (Server Component)
 *
 * Protects all dashboard routes: fetches the authenticated user's profile
 * from Supabase and passes role/name data down to the Sidebar and Topbar.
 * If no session is found, middleware has already redirected to /login.
 */

import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import Sidebar from "@/components/dashboard/Sidebar";
import Topbar from "@/components/dashboard/Topbar";
import LoginSuccessToast from "@/components/dashboard/LoginSuccessToast";
import type { UserRole } from "@/utils/supabase/middleware";

/** Derive 1-2 letter initials from a full name string. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = await getTranslations("Dashboard.sidebar.footer");

  // Verify session — middleware should have already redirected unauthenticated users,
  // but this is a defence-in-depth check.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Fetch full profile for display name, role, and tipo_cuenta
  const { data: profile } = await supabase
    .from("users")
    .select("nombre_completo, rol, tipo_cuenta")
    .eq("id", user.id)
    .single();

  const userName = profile?.nombre_completo ?? user.phone ?? "Usuario";
  const role = (profile?.rol as UserRole) ?? "miembro";
  const tipoCuenta = (profile?.tipo_cuenta as "titular" | "familiar") ?? "titular";
  const userInitials = getInitials(userName);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <LoginSuccessToast />
      {/* Sidebar — handles both desktop and mobile versions */}
      <Sidebar role={role} userName={userName} userInitials={userInitials} tipoCuenta={tipoCuenta} />

      {/* Main content area — offset by sidebar width on desktop */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-64">
        <Topbar />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>

        <footer className="px-4 py-6 text-center border-t border-gray-100 bg-white/40">
          <p className="text-xs text-gray-400 font-medium tracking-wide">
            © {new Date().getFullYear()} SOS Medical. {t("rightsReserved")}
          </p>
        </footer>
      </div>
    </div>
  );
}
