"use client";

/**
 * AdminServicioFormModal — Create / Edit modal for servicios (catalog).
 *
 * Phase 4 · Step 4 of the native citas module. Posts to
 * /api/admin/servicios (POST) or /api/admin/servicios/[id] (PUT) and
 * lets the parent (AdminServicios) refresh on save.
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
import type { ServicioRow } from "./AdminServicios";

interface Props {
  open:     boolean;
  servicio: ServicioRow | null; // null = create mode
  onClose:  () => void;
  onSaved:  () => void;
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors disabled:opacity-50";

const labelCls =
  "block text-xs font-medium text-gray-500 mb-1 font-roboto";

const helpCls =
  "text-[11px] text-gray-400 font-roboto mt-1";

export default function AdminServicioFormModal({
  open, servicio, onClose, onSaved,
}: Props) {
  const t      = useTranslations("Dashboard.admin.servicios.form");
  const isEdit = !!servicio;

  const [nombre,       setNombre]       = useState("");
  const [descripcion,  setDescripcion]  = useState("");
  const [duracion,     setDuracion]     = useState<string>("");
  const [slotDuracion, setSlotDuracion] = useState<string>("1");
  const [precio,       setPrecio]       = useState<string>("");
  const [activo,       setActivo]       = useState(true);
  const [saving,       setSaving]       = useState(false);

  // Populate form on open
  useEffect(() => {
    if (open) {
      setNombre(servicio?.nombre ?? "");
      setDescripcion(servicio?.descripcion ?? "");
      setDuracion(servicio?.duracion != null ? String(servicio.duracion) : "");
      setSlotDuracion(servicio?.slot_duracion != null ? String(servicio.slot_duracion) : "1");
      setPrecio(servicio?.precio != null ? String(servicio.precio) : "");
      setActivo(servicio?.activo ?? true);
    }
  }, [open, servicio]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error(t("validNombre"));
      return;
    }

    const slotNum = parseInt(slotDuracion, 10);
    if (!Number.isInteger(slotNum) || slotNum < 1) {
      toast.error(t("validSlot"));
      return;
    }

    const duracionNum = duracion.trim() ? parseInt(duracion, 10) : null;
    if (duracion.trim() && (!Number.isInteger(duracionNum) || (duracionNum ?? 0) < 0)) {
      toast.error(t("validDuracion"));
      return;
    }

    const precioNum = precio.trim() ? Number(precio) : null;
    if (precio.trim() && (Number.isNaN(precioNum) || (precioNum ?? -1) < 0)) {
      toast.error(t("validPrecio"));
      return;
    }

    setSaving(true);

    const body = {
      nombre:        nombre.trim(),
      descripcion:   descripcion.trim() || null,
      duracion:      duracionNum,
      slot_duracion: slotNum,
      precio:        precioNum,
      activo,
    };

    const url    = isEdit
      ? `/api/admin/servicios/${servicio!.id}`
      : "/api/admin/servicios";
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

            {/* Descripción */}
            <div>
              <label className={labelCls}>{t("descripcion")}</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                maxLength={500}
                rows={3}
                className={cn(inputCls, "resize-none")}
              />
            </div>

            {/* Duración (informativa) */}
            <div>
              <label className={labelCls}>{t("duracion")}</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={duracion}
                onChange={(e) => setDuracion(e.target.value)}
                placeholder="30"
                className={inputCls}
              />
              <p className={helpCls}>{t("duracion_help")}</p>
            </div>

            {/* Slot duración */}
            <div>
              <label className={labelCls}>{t("slot_duracion")} *</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={slotDuracion}
                onChange={(e) => setSlotDuracion(e.target.value)}
                className={inputCls}
                required
              />
              <p className={helpCls}>{t("slot_duracion_help")}</p>
            </div>

            {/* Precio */}
            <div>
              <label className={labelCls}>{t("precio")}</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0.00"
                className={inputCls}
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
