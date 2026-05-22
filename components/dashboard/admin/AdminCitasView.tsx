"use client";

/**
 * Toggle wrapper Lista <-> Calendario para la página /admin/citas.
 * La vista activa se sincroniza con el query param ?view= y se persiste en
 * la URL sin recargar (router.replace), así el back-button del browser deja
 * al admin en la última vista que estaba usando.
 */

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { List, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import AdminCitasRegistro from "./AdminCitasRegistro";
import AdminCalendarioCitas from "./AdminCalendarioCitas";

type View = "lista" | "calendario";

function readView(v: string | null): View {
  return v === "calendario" ? "calendario" : "lista";
}

export default function AdminCitasView() {
  const t       = useTranslations("Dashboard.admin.citas.toggle");
  const router  = useRouter();
  const params  = useSearchParams();
  const view    = readView(params.get("view"));

  const setView = useCallback(
    (next: View) => {
      const url = new URLSearchParams(params.toString());
      if (next === "lista") url.delete("view");
      else                  url.set("view", next);
      const qs = url.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router],
  );

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="inline-flex items-center gap-1 rounded-2xl border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setView("lista")}
          aria-pressed={view === "lista"}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-roboto font-medium transition-colors",
            view === "lista"
              ? "bg-secondary text-white shadow-sm"
              : "text-neutral hover:text-gray-700",
          )}
        >
          <List className="w-4 h-4" />
          {t("lista")}
        </button>
        <button
          type="button"
          onClick={() => setView("calendario")}
          aria-pressed={view === "calendario"}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-roboto font-medium transition-colors",
            view === "calendario"
              ? "bg-secondary text-white shadow-sm"
              : "text-neutral hover:text-gray-700",
          )}
        >
          <CalendarRange className="w-4 h-4" />
          {t("calendario")}
        </button>
      </div>

      {/* Active view */}
      {view === "lista"      ? <AdminCitasRegistro />     : null}
      {view === "calendario" ? <AdminCalendarioCitas /> : null}
    </div>
  );
}
