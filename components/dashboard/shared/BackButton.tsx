"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";

interface BackButtonProps {
  href: string;
}

export default function BackButton({ href }: BackButtonProps) {
  const t = useTranslations("Dashboard.shared");
  return (
    <Link
      href={href}
      className="lg:hidden inline-flex items-center gap-1 text-sm font-roboto text-secondary hover:text-secondary/80 mb-3"
    >
      <ChevronLeft className="w-4 h-4" />
      {t("back")}
    </Link>
  );
}
