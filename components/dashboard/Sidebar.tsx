"use client";

/**
 * Sidebar — desktop persistent sidebar + mobile Sheet drawer.
 *
 * Receives `role` from the server layout component and renders
 * role-appropriate navigation items. Glassmorphism aesthetic.
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
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import NavItem from "./NavItem";
import LogoutButton from "./LogoutButton";
import type { UserRole } from "@/utils/supabase/middleware";

interface SidebarProps {
  role: UserRole;
  userName: string;
  userInitials: string;
  /** tipo_cuenta from public.users — controls Mi Familia visibility for miembro */
  tipoCuenta?: "titular" | "familiar";
}

// ── Nav config per role ─────────────────────────────────────────────────────

function useNavItems(
  role: UserRole,
  locale: string,
  t: ReturnType<typeof useTranslations>,
  tipoCuenta?: "titular" | "familiar",
) {
  const base = `/${locale}/dashboard`;

  if (role === "admin") {
    return [
      { href: `${base}/admin`, label: t("nav.dashboard"), icon: LayoutDashboard },
      { href: `${base}/admin/usuarios`, label: t("nav.usuarios"), icon: Users },
      { href: `${base}/admin/empresas`, label: t("nav.empresas"), icon: Building2 },
      { href: `${base}/admin/beneficios`, label: t("nav.beneficios"), icon: Gift },
      { href: `${base}/admin/avisos`, label: t("nav.avisos"), icon: Megaphone },
      { href: `${base}/admin/reportes`, label: t("nav.reportes"), icon: BarChart3 },
      { href: `${base}/admin/config`, label: t("nav.config"), icon: Settings },
    ];
  }

  if (role === "empresa_admin") {
    return [
      { href: `${base}/empresa`, label: t("nav.dashboard"), icon: LayoutDashboard },
      { href: `${base}/empresa/empleados`, label: t("nav.empleados"), icon: UserCheck },
      { href: `${base}/empresa/citas`, label: t("nav.citas"), icon: CalendarDays },
      { href: `${base}/empresa/beneficios`, label: t("nav.beneficios"), icon: Gift },
      { href: `${base}/empresa/reportes`, label: t("nav.reportes"), icon: BarChart3 },
    ];
  }

  // miembro (default)
  const miembroItems = [
    { href: base, label: t("nav.dashboard"), icon: LayoutDashboard, exact: true },
    { href: `${base}/citas`, label: t("nav.citas"), icon: CalendarDays },
    { href: `${base}/beneficios`, label: t("nav.beneficios"), icon: Gift },
    { href: `${base}/avisos`, label: t("nav.avisos"), icon: Megaphone },
    { href: `${base}/documentos`, label: t("nav.documentos"), icon: FileText },
    { href: `${base}/ajustes`, label: t("nav.ajustes"), icon: SlidersHorizontal },
  ] as { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[];

  // Mi Familia only visible to titulares
  if (tipoCuenta === "titular") {
    miembroItems.splice(5, 0, {
      href: `${base}/familia`,
      label: t("nav.familia"),
      icon: Users,
    });
  }

  return miembroItems;
}

function getRoleBadgeLabel(role: UserRole, t: ReturnType<typeof useTranslations>): string {
  if (role === "admin") return t("role.admin");
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
  const locale = useLocale();
  const t = useTranslations("Dashboard.sidebar");
  const navItems = useNavItems(role, locale, t, tipoCuenta);

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
            className="object-contain h-10 w-auto"
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            exact={item.exact}
            onNavigate={onNavigate}
          />
        ))}
        
        {/* Separated Logout Button */}
        <div className="pt-20">
          <LogoutButton />
        </div>
      </nav>

      {/* User profile */}
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
