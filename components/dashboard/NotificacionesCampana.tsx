"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Bell } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

interface NotifRow {
  id:         string;
  tipo:       string;
  titulo:     string;
  mensaje:    string;
  link:       string | null;
  leida:      boolean;
  created_at: string;
}

export default function NotificacionesCampana() {
  const t = useTranslations("Notificaciones");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notificaciones");
      const j = await res.json() as { notificaciones?: NotifRow[] };
      setItems(j.notificaciones ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notif-campana")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones" },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const unread = items.filter((n) => !n.leida).length;

  async function markAll() {
    await fetch("/api/notificaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true }),
    });
    void load();
  }

  function markOne(id: string) {
    void fetch("/api/notificaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).then(() => load());
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label={t("aria_label")}
      >
        <Bell className="w-5 h-5 text-gray-700" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            aria-label="cerrar"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 mt-2 w-80 z-20 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <h3 className="text-sm font-semibold">{t("titulo")}</h3>
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-secondary hover:underline">
                  {t("marcar_todas")}
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="p-6 text-center text-sm text-neutral">{t("vacio")}</p>
              ) : items.map((n) => {
                const href = n.link ? `/${locale}${n.link}` : `/${locale}/dashboard`;
                return (
                  <Link
                    key={n.id}
                    href={href}
                    onClick={() => { setOpen(false); markOne(n.id); }}
                    className={`block px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${!n.leida ? "bg-blue-50/30" : ""}`}
                  >
                    <p className="text-sm font-semibold">{n.titulo}</p>
                    <p className="text-xs text-neutral line-clamp-2">{n.mensaje}</p>
                    <p className="text-[10px] text-neutral mt-1">
                      {new Date(n.created_at).toLocaleString("es-NI", { timeZone: "America/Managua" })}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
