"use client";

/**
 * AdminUbicacionFormModal — Create / Edit modal for ubicaciones (clinics).
 *
 * Phase 4 · Step 3 of the native citas module. Posts to
 * /api/admin/ubicaciones (POST) or /api/admin/ubicaciones/[id] (PUT) and
 * lets the parent (AdminUbicaciones) refresh on save.
 */

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { UbicacionRow } from "./AdminUbicaciones";

interface Props {
  open:      boolean;
  ubicacion: UbicacionRow | null; // null = create mode
  onClose:   () => void;
  onSaved:   () => void;
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors disabled:opacity-50";

const labelCls =
  "block text-xs font-medium text-gray-500 mb-1 font-roboto";

export default function AdminUbicacionFormModal({
  open, ubicacion, onClose, onSaved,
}: Props) {
  const t      = useTranslations("Dashboard.admin.ubicaciones.form");
  const isEdit = !!ubicacion;

  const [nombre,      setNombre]      = useState("");
  const [direccion,   setDireccion]   = useState("");
  const [telefono,    setTelefono]    = useState("");
  const [zonaHoraria, setZonaHoraria] = useState("America/Managua");
  const [activo,      setActivo]      = useState(true);
  const [saving,      setSaving]      = useState(false);

  // Populate form on open
  useEffect(() => {
    if (open) {
      setNombre(ubicacion?.nombre ?? "");
      setDireccion(ubicacion?.direccion ?? "");
      setTelefono(ubicacion?.telefono ?? "");
      setZonaHoraria(ubicacion?.zona_horaria ?? "America/Managua");
      setActivo(ubicacion?.activo ?? true);
    }
  }, [open, ubicacion]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error(t("validNombre"));
      return;
    }
    setSaving(true);

    const body = {
      nombre:       nombre.trim(),
      direccion:    direccion.trim() || null,
      telefono:     telefono.trim() || null,
      zona_horaria: zonaHoraria.trim() || "America/Managua",
      activo,
    };

    const url    = isEdit
      ? `/api/admin/ubicaciones/${ubicacion!.id}`
      : "/api/admin/ubicaciones";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    setSaving(false);

    if (res.ok) {
      onSaved();
    } else {
      toast.error(t("errorGuardar"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent
        showCloseButton={!saving}
        className="max-w-md rounded-2xl p-0 overflow-hidden"
      >
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-poppins font-semibold text-gray-900">
            {isEdit ? t("title_edit") : t("title_new")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
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

            {/* Dirección */}
            <div>
              <label className={labelCls}>{t("direccion")}</label>
              <input
                type="text"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                maxLength={255}
                className={inputCls}
              />
            </div>

            {/* Teléfono */}
            <div>
              <label className={labelCls}>{t("telefono")}</label>
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                maxLength={32}
                className={inputCls}
              />
            </div>

            {/* Zona horaria */}
            <div>
              <label className={labelCls}>{t("zona_horaria")}</label>
              <input
                type="text"
                value={zonaHoraria}
                onChange={(e) => setZonaHoraria(e.target.value)}
                maxLength={64}
                placeholder="America/Managua"
                className={cn(inputCls, "font-mono")}
              />
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
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/60">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-roboto text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {t("cancelar")}
            </button>
            <button
              type="submit"
              disabled={saving || !nombre.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-roboto font-medium bg-secondary text-white hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? t("guardando") : t("guardar")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
