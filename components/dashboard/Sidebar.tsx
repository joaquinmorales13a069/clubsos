"use client";

/**
 * Sidebar — desktop persistent sidebar + mobile Sheet drawer.
 *
 * Receives `role` from the server layout component and renders
 * role-appropriate navigation items.
 *
 * - miembro / admin: flat nav list (single group, no label)
 * - empresa_admin:   two labeled groups:
 *     "Mi Perfil"         → shared miembro routes (RLS scopes data automatically)
 *     "Administrar Empresa" → empresa-specific routes
 *
 * Glassmorphism aesthetic consistent with design system.
 */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  LayoutDashboard,
  CalendarDays,
  Gift,
  Megaphone,
  FileText,
  Users,
  Building2,
  BarChart3,
  Settings,
  Menu,
  X,
  UserCheck,
  SlidersHorizontal,
  CalendarCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import NavItem from "./NavItem";
import LogoutButton from "./LogoutButton";
import type { UserRole } from "@/utils/supabase/middleware";

// ── Types ───────────────────────────────────────────────────────────────────

interface NavItemConfig {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

/**
 * A navigation group. When `label` is provided, a section header is rendered
 * above the items. Groups are separated by a thin Separator.
 */
interface NavGroup {
  label?: string;
  items: NavItemConfig[];
}

interface SidebarProps {
  role: UserRole;
  userName: string;
  userInitials: string;
  /** tipo_cuenta from public.users — controls Mi Familia visibility */
  tipoCuenta?: "titular" | "familiar";
}

// ── Nav config builders ──────────────────────────────────────────────────────

function buildAdminNav(
  base: string,
  t: ReturnType<typeof useTranslations>,
  tipoCuenta?: "titular" | "familiar",
): NavGroup[] {
  // "Mi Perfil" — shared miembro routes; RLS policies scope data automatically
  const miPerfilItems: NavItemConfig[] = [
    { href: `${base}/citas`,      label: t("nav.citas"),      icon: CalendarDays },
    { href: `${base}/beneficios`, label: t("nav.beneficios"), icon: Gift },
    { href: `${base}/avisos`,     label: t("nav.avisos"),     icon: Megaphone },
    { href: `${base}/documentos`, label: t("nav.documentos"), icon: FileText },
    { href: `${base}/ajustes`,    label: t("nav.ajustes"),    icon: SlidersHorizontal },
  ];

  // Mi Familia only for titulares
  if (tipoCuenta === "titular") {
    miPerfilItems.splice(4, 0, {
      href: `${base}/familia`,
      label: t("nav.familia"),
      icon: Users,
    });
  }

  // "Administrar" — global admin management sections
  const administrarItems: NavItemConfig[] = [
    { href: `${base}/admin/citas`,      label: t("nav.gestionarCitas"),      icon: CalendarCheck },
    { href: `${base}/admin/beneficios`, label: t("nav.gestionarBeneficios"), icon: Gift },
    { href: `${base}/admin/documentos`, label: t("nav.gestionarDocumentos"), icon: FileText },
    { href: `${base}/admin/usuarios`,   label: t("nav.gestionarUsuarios"),   icon: UserCog },
    { href: `${base}/admin/empresas`,   label: t("nav.gestionarEmpresas"),   icon: Building2 },
    { href: `${base}/admin/reportes`,   label: t("nav.generarReportes"),     icon: BarChart3 },
    { href: `${base}/admin/sistema`,    label: t("nav.ajustesSistema"),      icon: Settings },
  ];

  return [
    {
      items: [
        { href: `${base}/admin`, label: t("nav.dashboard"), icon: LayoutDashboard, exact: true },
      ],
    },
    { label: t("groupMiPerfil"),         items: miPerfilItems },
    { label: t("groupAdministrarAdmin"), items: administrarItems },
  ];
}

function buildEmpresaAdminNav(
  base: string,
  t: ReturnType<typeof useTranslations>,
  tipoCuenta?: "titular" | "familiar",
): NavGroup[] {
  // "Mi Perfil" — reuses the same miembro routes; RLS policies scope data automatically.
  const dashboardItems: NavItemConfig[] = [
    { href: `${base}/empresa`, label: t("nav.dashboard"), icon: LayoutDashboard, exact: true },
  ];

  const miPerfilItems: NavItemConfig[] = [
    { href: `${base}/citas`,      label: t("nav.citas"),      icon: CalendarDays },
    { href: `${base}/beneficios`, label: t("nav.beneficios"), icon: Gift },
    { href: `${base}/avisos`,     label: t("nav.avisos"),     icon: Megaphone },
    { href: `${base}/documentos`, label: t("nav.documentos"), icon: FileText },
    { href: `${base}/ajustes`,    label: t("nav.ajustes"),    icon: SlidersHorizontal },
  ];

  // Mi Familia only visible to titulares (same rule as miembro)
  if (tipoCuenta === "titular") {
    miPerfilItems.splice(4, 0, {
      href: `${base}/familia`,
      label: t("nav.familia"),
      icon: Users,
    });
  }

  // "Administrar Empresa" — empresa-specific management routes
  const administrarItems: NavItemConfig[] = [
    { href: `${base}/empresa/citas`,     label: t("nav.registroCitas"),     icon: CalendarCheck },
    { href: `${base}/empresa/usuarios`,  label: t("nav.gestionarUsuarios"), icon: UserCog },
    { href: `${base}/empresa/reportes`,  label: t("nav.generarReportes"),   icon: BarChart3 },
    { href: `${base}/empresa/ajustes`,   label: t("nav.ajustesEmpresa"),    icon: UserCheck },
  ];

  return [
    { items: dashboardItems },
    { label: t("groupMiPerfil"),    items: miPerfilItems },
    { label: t("groupAdministrar"), items: administrarItems },
  ];
}

function buildMiembroNav(
  base: string,
  t: ReturnType<typeof useTranslations>,
  tipoCuenta?: "titular" | "familiar",
): NavGroup[] {
  const dashboardItems: NavItemConfig[] = [
    { href: base,                 label: t("nav.dashboard"),  icon: LayoutDashboard, exact: true },
  ];

  const items: NavItemConfig[] = [
    { href: `${base}/citas`,      label: t("nav.citas"),      icon: CalendarDays },
    { href: `${base}/beneficios`, label: t("nav.beneficios"), icon: Gift },
    { href: `${base}/avisos`,     label: t("nav.avisos"),     icon: Megaphone },
    { href: `${base}/documentos`, label: t("nav.documentos"), icon: FileText },
    { href: `${base}/ajustes`,    label: t("nav.ajustes"),    icon: SlidersHorizontal },
  ];

  if (tipoCuenta === "titular") {
    items.splice(4, 0, {
      href: `${base}/familia`,
      label: t("nav.familia"),
      icon: Users,
    });
  }

  return [
    { items: dashboardItems },
    { label: t("groupMiPerfil"), items }
  ];
}

function useNavGroups(
  role: UserRole,
  locale: string,
  t: ReturnType<typeof useTranslations>,
  tipoCuenta?: "titular" | "familiar",
): NavGroup[] {
  const base = `/${locale}/dashboard`;

  if (role === "admin")         return buildAdminNav(base, t, tipoCuenta);
  if (role === "empresa_admin") return buildEmpresaAdminNav(base, t, tipoCuenta);
  return buildMiembroNav(base, t, tipoCuenta);
}

function getRoleBadgeLabel(role: UserRole, t: ReturnType<typeof useTranslations>): string {
  if (role === "admin")         return t("role.admin");
  if (role === "empresa_admin") return t("role.empresaAdmin");
  return t("role.miembro");
}

// ── Sidebar inner content (shared desktop + mobile) ─────────────────────────

function SidebarContent({
  role,
  userName,
  userInitials,
  tipoCuenta,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const locale     = useLocale();
  const t          = useTranslations("Dashboard.sidebar");
  const navGroups  = useNavGroups(role, locale, t, tipoCuenta);

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5">
        <Link href={`/${locale}/dashboard`} className="flex items-center">
          <Image
            src="/logo-SOSMedical.webp"
            alt="SOS Medical"
            width={160}
            height={40}
            className="object-contain h-10"
            style={{ width: "auto" }}
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx}>
            {/* Optional group label header */}
            {group.label && (
              <p className="px-3 mb-1 mt-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                {group.label}
              </p>
            )}

            {/* Nav items in this group */}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  exact={item.exact}
                  onNavigate={onNavigate}
                />
              ))}
            </div>

            {/* Separator between groups (not after the last one) */}
            {groupIdx < navGroups.length - 1 && (
              <Separator className="my-3 bg-gray-100" />
            )}
          </div>
        ))}

        {/* Logout — always at the bottom of the nav area */}
        <div className="pt-20">
          <LogoutButton />
        </div>
      </nav>

      {/* User profile footer */}
      <div className="px-6 py-6 border-t border-gray-100 bg-gray-50/30">
        <div className="flex flex-col items-center text-center gap-3">
          <Avatar className="w-12 h-12 shrink-0 border-2 border-white shadow-sm">
            <AvatarFallback className="bg-secondary text-white text-base font-semibold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1.5 flex flex-col items-center">
            <p className="text-sm font-roboto font-semibold text-gray-900 leading-tight">
              {userName}
            </p>
            <Badge
              variant="secondary"
              className="text-[10px] px-2 py-0.5 font-medium text-white w-fit uppercase tracking-wider"
            >
              {getRoleBadgeLabel(role, t)}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main exported Sidebar component ─────────────────────────────────────────

export default function Sidebar({ role, userName, userInitials, tipoCuenta }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside
        className={[
          "hidden md:flex flex-col w-64 shrink-0",
          "bg-white/80 backdrop-blur-xl",
          "border-r border-gray-200/70",
          "shadow-[2px_0_20px_rgba(0,0,0,0.04)]",
          "fixed inset-y-0 left-0 z-30",
        ].join(" ")}
      >
        <SidebarContent
          role={role}
          userName={userName}
          userInitials={userInitials}
          tipoCuenta={tipoCuenta}
        />
      </aside>

      {/* Mobile sidebar — Sheet drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          className="md:hidden fixed top-4 left-4 z-40 p-2 rounded-xl bg-white/90 backdrop-blur-md shadow-md border border-gray-200/60"
          aria-label="Open menu"
        >
          {mobileOpen ? (
            <X className="w-5 h-5 text-gray-700" />
          ) : (
            <Menu className="w-5 h-5 text-gray-700" />
          )}
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-64 p-0 bg-white/90 backdrop-blur-xl border-r border-gray-200/70"
        >
          <SidebarContent
            role={role}
            userName={userName}
            userInitials={userInitials}
            tipoCuenta={tipoCuenta}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
