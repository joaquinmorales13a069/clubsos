"use client";

/**
 * Topbar — sticky header above the main content area.
 * Shows language switcher and notification bell only.
 * User identity and logout live in the Sidebar.
 */

import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function Topbar() {
  const t = useTranslations("Dashboard.topbar");

  return (
    <header
      className={[
        "sticky top-0 z-20 h-16",
        "bg-white/80 backdrop-blur-xl",
        "border-b border-gray-200/70",
        "shadow-[0_2px_12px_rgba(0,0,0,0.04)]",
        // Leave room on the left for the mobile hamburger button
        "flex items-center px-4 pl-14 md:pl-6 gap-4",
      ].join(" ")}
    >
      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <LanguageSwitcher />

        <button
          className="relative p-2 rounded-xl text-neutral hover:bg-gray-100 transition-colors"
          aria-label={t("notifications")}
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
        </button>
      </div>
    </header>
  );
}
