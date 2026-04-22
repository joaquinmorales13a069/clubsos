"use client";

/**
 * Topbar — sticky header above the main content area.
 * Shows language switcher, notifications, and user quick-actions.
 * Logout is handled inline to avoid nested button issues with base-ui menus.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Bell, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { createClient } from "@/utils/supabase/client";
import type { UserRole } from "@/utils/supabase/middleware";

interface TopbarProps {
  userName: string;
  userInitials: string;
  role: UserRole;
}

function getRoleLabel(role: UserRole, t: ReturnType<typeof useTranslations>): string {
  if (role === "admin") return t("role.admin");
  if (role === "empresa_admin") return t("role.empresaAdmin");
  return t("role.miembro");
}

export default function Topbar({ userName, userInitials, role }: TopbarProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Dashboard.sidebar");

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${locale}/login`);
  };

  return (
    <header
      className={[
        "sticky top-0 z-20 h-16",
        "bg-white/80 backdrop-blur-xl",
        "border-b border-gray-200/70",
        "shadow-[0_2px_12px_rgba(0,0,0,0.04)]",
        "flex items-center px-4 pl-14 md:pl-6 gap-4",
      ].join(" ")}
    >
      {/* Flex spacer */}
      <div className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-2">
        <LanguageSwitcher />

        {/* Notification bell */}
        <button
          className="relative p-2 rounded-xl text-neutral hover:bg-gray-100 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
        </button>

        {/* User avatar dropdown — DropdownMenuTrigger renders as <button> natively */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-gray-100 transition-colors outline-none">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-secondary text-white text-xs font-semibold">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-gray-900 leading-tight max-w-[120px] truncate">
                {userName}
              </p>
              <p className="text-xs text-neutral leading-tight">{getRoleLabel(role, t)}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
              <p className="text-xs text-neutral">{getRoleLabel(role, t)}</p>
            </div>
            <DropdownMenuSeparator />
            {/* Logout item — inline handler avoids nested button issue */}
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={loggingOut}
              className="gap-2 text-neutral hover:text-primary cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              {loggingOut ? t("loggingOut") : t("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
