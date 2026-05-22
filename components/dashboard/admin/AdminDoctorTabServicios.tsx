"use client";

/**
 * AdminDoctorTabServicios — checkbox list of all servicios; toggles the
 * assignment for the current doctor.
 *
 * Phase 4 · Step 7 of the native citas module. Loads
 * /api/admin/servicios then PUTs the chosen ids to
 * /api/admin/doctores/[id]/servicios.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Servicio {
  id:     string;
  nombre: string;
  activo: boolean;
}

interface Props {
  doctorId:   string;
  initialIds: string[];
  onSaved:    () => void;
}

export default function AdminDoctorTabServicios({
  doctorId, initialIds, onSaved,
}: Props) {
  const t = useTranslations("Dashboard.admin.doctores.detalle.servicios");

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [asignados, setAsignados] = useState<Set<string>>(new Set(initialIds));
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/servicios", { cache: "no-store" });
        const j   = (await res.json()) as { servicios?: Servicio[] };
        if (!cancelled) setServicios((j.servicios ?? []).filter((s) => s.activo));
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function toggle(id: string) {
    setAsignados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/admin/doctores/${doctorId}/servicios`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ servicio_ids: Array.from(asignados) }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("saved"));
      onSaved();
    } else {
      toast.error(t("save_error"));
    }
  }

  if (loading) {
    return (
      <p className="text-sm font-roboto text-neutral flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("cargando")}
      </p>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4 max-w-2xl">
      <div>
        <h2 className="text-base font-poppins font-semibold text-gray-900">
          {t("title")}
        </h2>
      </div>

      <div className="space-y-2">
        {servicios.length === 0 && (
          <p className="text-sm font-roboto text-gray-400">{t("empty")}</p>
        )}
        {servicios.map((s) => (
          <label
            key={s.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={asignados.has(s.id)}
              onChange={() => toggle(s.id)}
              className="w-4 h-4 accent-secondary"
            />
            <span className="text-sm font-roboto text-gray-800">{s.nombre}</span>
          </label>
        ))}
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-roboto font-medium bg-secondary text-white hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? t("guardando") : t("guardar")}
        </button>
      </div>
    </div>
  );
}
