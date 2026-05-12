"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { useLocale } from "next-intl";

function formatNicaragua(date: Date): string {
  const parts = new Intl.DateTimeFormat("es-NI", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const period = get("dayPeriod").toUpperCase().replace(/[.\s]/g, "");

  return `${cap(get("weekday"))} ${get("day")} de ${cap(get("month"))} del ${get("year")} ${get("hour")}:${get("minute")} ${period}`;
}

function formatEnglish(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export default function DateTimeDisplay() {
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState(new Date());
  const locale = useLocale();

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, [mounted]);

  // Prevent hydration mismatch
  if (!mounted) {
    return null;
  }

  const formattedDateTime = locale === "es" ? formatNicaragua(time) : formatEnglish(time);

  return (
    <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 hover:bg-white backdrop-blur-md border border-gray-200 shadow-sm transition-all group">
      <Clock className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
      <span className="text-sm font-poppins font-medium text-gray-700 capitalize">
        {formattedDateTime}
      </span>
    </div>
  );
}
