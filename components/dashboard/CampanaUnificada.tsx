"use client";

/**
 * CampanaUnificada — single bell in the Topbar that combines unread
 * notificaciones and active avisos in a single chronological list.
 *
 * Replaces the previous pair (NotificacionesCampana + TopbarAvisosPopover).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Bell, Megaphone, BellRing, ImageIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type NotifRow = {
  id:         string;
  tipo:       string;
  titulo:     string;
  mensaje:    string;
  link:       string | null;
  leida:      boolean;
  created_at: string;
};

type AvisoRow = {
  id:              string;
  titulo:          string;
  descripcion:     string | null;
  aviso_image_url: string | null;
  created_at:      string;
};

type FeedItem =
  | { kind: "notif";  data: NotifRow }
  | { kind: "aviso"; data: AvisoRow };

export default function CampanaUnificada() {
  const t      = useTranslations("Dashboard.topbar.campana");
  const locale = useLocale();
  const [open,   setOpen]   = useState(false);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [avisos, setAvisos] = useState<AvisoRow[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const [notifRes, avisoRes] = await Promise.all([
        fetch("/api/notificaciones").then((r) => r.json() as Promise<{ notificaciones?: NotifRow[] }>),
        supabase
          .from("avisos")
          .select("id, titulo, descripcion, aviso_image_url, created_at")
          .eq("estado_aviso", "activa")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      setNotifs(notifRes.notificaciones ?? []);
      setAvisos((avisoRes.data ?? []) as AvisoRow[]);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime subscriptions
  useEffect(() => {
    const supabase = createClient();
    const chNotif = supabase
      .channel("campana-notif")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones" },
        () => { void load(); },
      )
      .subscribe();
    const chAviso = supabase
      .channel("campana-aviso")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "avisos" },
        () => { void load(); },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(chNotif);
      void supabase.removeChannel(chAviso);
    };
  }, [load]);

  // Outside-click close
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unreadNotifs = notifs.filter((n) => !n.leida).length;
  const unreadAvisos = avisos.length;

  function markOne(id: string) {
    void fetch("/api/notificaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).then(() => load());
  }

  function markAllRead() {
    void fetch("/api/notificaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true }),
    }).then(() => load());
  }

  // Merge & sort
  const feed: FeedItem[] = [
    ...notifs.map((n) => ({ kind: "notif" as const, data: n })),
    ...avisos.map((a) => ({ kind: "aviso" as const, data: a })),
  ].sort((a, b) => b.data.created_at.localeCompare(a.data.created_at));

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("ariaLabel")}
        className="relative p-2 rounded-xl text-neutral hover:bg-gray-100 transition-colors"
      >
        <Bell aria-hidden="true" className="w-5 h-5" />
        {/* Two stacked badges, side by side at top-right */}
        {(unreadNotifs > 0 || unreadAvisos > 0) && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center gap-0.5">
            {unreadNotifs > 0 && (
              <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
                {unreadNotifs > 9 ? "9+" : unreadNotifs}
              </span>
            )}
            {unreadAvisos > 0 && (
              <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-secondary text-white text-[9px] font-bold flex items-center justify-center">
                {unreadAvisos > 9 ? "9+" : unreadAvisos}
              </span>
            )}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-poppins font-semibold text-gray-900">{t("title")}</span>
          </div>

          {feed.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral">{t("empty")}</p>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
              {feed.map((item) => item.kind === "notif" ? (
                <Link
                  key={`n-${item.data.id}`}
                  href={item.data.link ? `/${locale}${item.data.link}` : `/${locale}/dashboard`}
                  onClick={() => { setOpen(false); markOne(item.data.id); }}
                  className={`block px-4 py-3 hover:bg-gray-50 transition-colors ${!item.data.leida ? "bg-blue-50/30" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      <BellRing aria-hidden="true" className="w-3 h-3" />
                      {t("pillNotificacion")}
                    </span>
                    <span className="text-[10px] text-neutral">
                      {new Date(item.data.created_at).toLocaleString(locale === "en" ? "en-US" : "es-NI", { timeZone: "America/Managua" })}
                    </span>
                  </div>
                  <p className="text-sm font-semibold">{item.data.titulo}</p>
                  <p className="text-xs text-neutral line-clamp-2">{item.data.mensaje}</p>
                </Link>
              ) : (
                <Link
                  key={`a-${item.data.id}`}
                  href={`/${locale}/dashboard/avisos`}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-secondary bg-secondary/10 px-1.5 py-0.5 rounded-full">
                      <Megaphone aria-hidden="true" className="w-3 h-3" />
                      {t("pillAviso")}
                    </span>
                    <span className="text-[10px] text-neutral">
                      {new Date(item.data.created_at).toLocaleString(locale === "en" ? "en-US" : "es-NI", { timeZone: "America/Managua" })}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    {item.data.aviso_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.data.aviso_image_url}
                        alt=""
                        className="w-8 h-8 rounded-lg object-cover shrink-0 border border-gray-100"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                        <ImageIcon aria-hidden="true" className="w-4 h-4 text-rose-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{item.data.titulo}</p>
                      {item.data.descripcion && (
                        <p className="text-xs text-neutral line-clamp-2">{item.data.descripcion}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between gap-3 text-xs">
            {unreadNotifs > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="font-medium text-primary hover:text-primary/80 font-roboto transition-colors"
              >
                {t("marcarTodasLeidas")}
              </button>
            ) : <span />}
            <Link
              href={`/${locale}/dashboard/avisos`}
              onClick={() => setOpen(false)}
              className="font-medium text-secondary hover:text-secondary/80 font-roboto transition-colors"
            >
              {t("verAvisos")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
