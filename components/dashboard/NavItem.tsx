"use client";

/**
 * NavItem — single sidebar navigation link.
 * Highlights when the current pathname starts with the item's href.
 * Supports optional badge count for notifications.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  /** Called when link is clicked — used to close mobile sidebar */
  onNavigate?: () => void;
}

export default function NavItem({ href, label, icon: Icon, badge, onNavigate }: NavItemProps) {
  const pathname = usePathname();

  // Exact match for the base dashboard routes to avoid false positives
  const isActive =
    pathname === href ||
    (href !== "/" && pathname.startsWith(href + "/"));

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
        isActive
          ? "bg-primary text-white shadow-md shadow-primary/30"
          : "text-neutral hover:bg-gray-100 hover:text-gray-900"
      )}
    >
      <Icon
        className={cn(
          "w-5 h-5 shrink-0 transition-colors",
          isActive ? "text-white" : "text-neutral group-hover:text-gray-700"
        )}
      />
      <span className="truncate font-roboto">{label}</span>
      {badge != null && badge > 0 && (
        <span
          className={cn(
            "ml-auto text-xs font-semibold px-2 py-0.5 rounded-full",
            isActive
              ? "bg-white/30 text-white"
              : "bg-primary/10 text-primary"
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
