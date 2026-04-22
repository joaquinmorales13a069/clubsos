"use client";

/**
 * LogoutButton — client component that calls Supabase signOut
 * and redirects to the login page for the current locale.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface LogoutButtonProps {
  compact?: boolean;
}

export default function LogoutButton({ compact = false }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Dashboard.sidebar");

  const handleLogout = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${locale}/login`);
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-roboto font-medium",
        "text-neutral hover:bg-red-50 hover:text-primary transition-all duration-200",
        "disabled:opacity-60 disabled:cursor-not-allowed"
      )}
    >
      <LogOut className="w-5 h-5 shrink-0" />
      {!compact && <span>{loading ? t("loggingOut") : t("logout")}</span>}
    </button>
  );
}
