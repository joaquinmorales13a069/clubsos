"use client";

/**
 * AdminDoctorTabInfo — edit form for nombre / correo / ubicacion / activo.
 *
 * Phase 4 · Step 7 of the native citas module. PUTs to
 * /api/admin/doctores/[id].
 */

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Initial {
  id:           string;
  nombre:       string;
  correo:       string | null;
  activo:       boolean;
  ubicacion_id: string | null;
}

interface UbicacionMini { id: string; nombre: string }

interface Props {
  doctorId: string;
  initial:  Initial;
  onSaved:  () => void;
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors disabled:opacity-50";

const labelCls =
  "block text-xs font-medium text-gray-500 mb-1 font-roboto";

export default function AdminDoctorTabInfo({ doctorId, initial, onSaved }: Props) {
  const t = useTranslations("Dashboard.admin.doctores.detalle.info");

  const [nombre,      setNombre]      = useState(initial.nombre);
  const [correo,      setCorreo]      = useState(initial.correo ?? "");
  const [ubicacionId, setUbicacionId] = useState(initial.ubicacion_id ?? "");
  const [activo,      setActivo]      = useState(initial.activo);
  const [saving,      setSaving]      = useState(false);

  const [ubicaciones,         setUbicaciones]         = useState<UbicacionMini[]>([]);
  const [loadingUbicaciones,  setLoadingUbicaciones]  = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/ubicaciones", { cache: "no-store" });
        const j   = (await res.json()) as { ubicaciones?: UbicacionMini[] };
        if (!cancelled) setUbicaciones(j.ubicaciones ?? []);
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoadingUbicaciones(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error(t("validNombre"));
      return;
    }
    if (!ubicacionId) {
      toast.error(t("validUbicacion"));
      return;
    }
    setSaving(true);

    const body = {
      nombre:       nombre.trim(),
      correo:       correo.trim() || null,
      ubicacion_id: ubicacionId,
      activo,
    };

    const res = await fetch(`/api/admin/doctores/${doctorId}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    setSaving(false);

    if (res.ok) {
      toast.success(t("saved"));
      onSaved();
    } else {
      toast.error(t("save_error"));
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4 max-w-2xl"
    >
      {/* Nombre */}
      <div>
        <label className={labelCls}>{t("nombre")} *</label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={120}
          className={inputCls}
          required
        />
      </div>

      {/* Correo */}
      <div>
        <label className={labelCls}>{t("correo")}</label>
        <input
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          maxLength={255}
          className={inputCls}
        />
      </div>

      {/* Ubicación */}
      <div>
        <label className={labelCls}>{t("ubicacion")} *</label>
        <select
          value={ubicacionId}
          onChange={(e) => setUbicacionId(e.target.value)}
          className={inputCls}
          disabled={loadingUbicaciones}
          required
        >
          <option value="" disabled>—</option>
          {ubicaciones.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>
      </div>

      {/* Activo */}
      <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          className="w-4 h-4 mt-0.5 accent-secondary"
        />
        <div>
          <p className="text-sm font-medium text-gray-800 font-roboto">{t("activo")}</p>
          <p className="text-xs text-gray-500 font-roboto mt-0.5">{t("activoDesc")}</p>
        </div>
      </label>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving || !nombre.trim() || !ubicacionId}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-roboto font-medium bg-secondary text-white hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? t("guardando") : t("guardar")}
        </button>
      </div>
    </form>
  );
}
