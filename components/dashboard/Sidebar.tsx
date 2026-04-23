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
  CreditCard,
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
        <Link href={`/${locale}/dashboard`} className="flex items-center gap-3">
          <Image
            src="/logo-clubSOS.webp"
            alt="Club SOS"
            width={40}
            height={40}
            className="object-contain"
          />
          <div>
            <p className="text-sm font-poppins font-bold text-gray-900 leading-tight">ClubSOS</p>
            <p className="text-xs font-roboto text-neutral leading-tight">Medical</p>
          </div>
        </Link>
      </div>

      <Separator className="mx-4" />

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
      </nav>

      <Separator className="mx-4" />

      {/* User profile + logout */}
      <div className="px-3 py-4 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarFallback className="bg-secondary text-white text-xs font-semibold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-roboto font-medium text-gray-900 truncate leading-tight">{userName}</p>
            <Badge
              variant="secondary"
              className="text-xs px-1.5 py-0 mt-0.5 font-normal"
            >
              {getRoleBadgeLabel(role, t)}
            </Badge>
          </div>
        </div>
        <LogoutButton />
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
