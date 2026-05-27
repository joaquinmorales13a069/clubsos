"use client";

/**
 * AdminExcepcionesView — toggle wrapper (Calendario ↔ Lista) for /admin/excepciones.
 * The view choice is synced to ?view= so the back button preserves the user's tab.
 * Pre-applies doctor_id from the query string (so the per-doctor UI can deep-link here).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { List, CalendarRange, Plus, CalendarX } from "lucide-react";
import { cn } from "@/lib/utils";
import AdminExcepcionesCalendario from "./AdminExcepcionesCalendario";
import AdminExcepcionesTabla from "./AdminExcepcionesTabla";
import AdminExcepcionFormModal, {
  type ExcepcionFormValue,
} from "./AdminExcepcionFormModal";

interface DoctorOption    { id: string; nombre: string; ubicacion_id: string | null }
interface UbicacionOption { id: string; nombre: string }

type View = "calendario" | "tabla";
function readView(v: string | null): View { return v === "tabla" ? "tabla" : "calendario"; }

export default function AdminExcepcionesView() {
  const t       = useTranslations("Dashboard.admin.excepciones");
  const router  = useRouter();
  const params  = useSearchParams();
  const view    = readView(params.get("view"));

  const doctorFilter    = params.get("doctor_id")    ?? undefined;
  const ubicacionFilter = params.get("ubicacion_id") ?? undefined;

  const [doctores,    setDoctores]    = useState<DoctorOption[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbicacionOption[]>([]);

  const [modalOpen, setModalOpen]       = useState(false);
  const [initialValue, setInitialValue] = useState<ExcepcionFormValue | null>(null);
  const [refreshKey, setRefreshKey]     = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [dRes, uRes] = await Promise.all([
        fetch("/api/admin/doctores",    { cache: "no-store" }),
        fetch("/api/admin/ubicaciones", { cache: "no-store" }),
      ]);
      const [dJ, uJ] = await Promise.all([dRes.json(), uRes.json()]);
      if (cancelled) return;
      setDoctores((dJ.doctores ?? []).map((d: DoctorOption) => ({
        id: d.id, nombre: d.nombre, ubicacion_id: d.ubicacion_id,
      })));
      setUbicaciones((uJ.ubicaciones ?? []).map((u: UbicacionOption) => ({ id: u.id, nombre: u.nombre })));
    })();
    return () => { cancelled = true; };
  }, []);

  const setView = useCallback((next: View) => {
    const url = new URLSearchParams(params.toString());
    if (next === "calendario") url.delete("view");
    else                       url.set("view", next);
    const qs = url.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [params, router]);

  const handleNew = useCallback(() => {
    setInitialValue(null);
    setModalOpen(true);
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
            <CalendarX className="w-5 h-5 text-secondary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-poppins font-bold text-gray-900">{t("title")}</h1>
            <p className="text-sm font-roboto text-neutral">{t("subtitle")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold font-roboto hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {t("newBtn")}
        </button>
      </div>

      {/* Toggle */}
      <div className="inline-flex items-center gap-1 rounded-2xl border border-gray-200 bg-white p-1">
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
          {t("view.calendario")}
        </button>
        <button
          type="button"
          onClick={() => setView("tabla")}
          aria-pressed={view === "tabla"}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-roboto font-medium transition-colors",
            view === "tabla"
              ? "bg-secondary text-white shadow-sm"
              : "text-neutral hover:text-gray-700",
          )}
        >
          <List className="w-4 h-4" />
          {t("view.tabla")}
        </button>
      </div>

      {/* Active view (key forces remount on refresh, so the child fetches anew) */}
      {view === "calendario" ? (
        <AdminExcepcionesCalendario
          key={`cal-${refreshKey}`}
          doctores={doctores}
          ubicaciones={ubicaciones}
          doctorFilter={doctorFilter}
          ubicacionFilter={ubicacionFilter}
        />
      ) : (
        <AdminExcepcionesTabla
          key={`tab-${refreshKey}`}
          doctores={doctores}
          ubicaciones={ubicaciones}
          doctorFilter={doctorFilter}
          ubicacionFilter={ubicacionFilter}
        />
      )}

      <AdminExcepcionFormModal
        open={modalOpen}
        initial={initialValue}
        doctores={doctores}
        ubicaciones={ubicaciones}
        onClose={() => setModalOpen(false)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
