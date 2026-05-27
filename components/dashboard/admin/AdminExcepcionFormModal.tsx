"use client";

/**
 * AdminExcepcionFormModal — create / edit a schedule exception.
 *
 * Edit-in-place is implemented as DELETE-then-POST (no PUT endpoint, by design).
 * This keeps the audit log clear (both actions are logged) and avoids adding a
 * new HTTP verb for an admin-only feature used at low frequency.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export type ExcepcionScope = "global" | "doctor" | "ubicacion" | "both";

export interface ExcepcionFormValue {
  id?:           string;
  scope:         ExcepcionScope;
  doctor_id:     string | null;
  ubicacion_id:  string | null;
  fecha_inicio:  string;  // YYYY-MM-DDTHH:mm (datetime-local) or ISO
  fecha_fin:     string;
  motivo:        string;
}

interface DoctorOption     { id: string; nombre: string; ubicacion_id: string | null }
interface UbicacionOption  { id: string; nombre: string }

interface Props {
  open:        boolean;
  initial:     ExcepcionFormValue | null;       // null = create new
  doctores:    DoctorOption[];
  ubicaciones: UbicacionOption[];
  onClose:     () => void;
  onSaved:     () => void;
}

const EMPTY: ExcepcionFormValue = {
  scope:        "global",
  doctor_id:    null,
  ubicacion_id: null,
  fecha_inicio: "",
  fecha_fin:    "",
  motivo:       "",
};

/** Convert ISO timestamptz to YYYY-MM-DDTHH:mm (datetime-local input format). */
function isoToLocalInput(iso: string): string {
  // Display directly via slicing — datetime-local doesn't carry tz, so we use
  // the user's local interpretation. Acceptable for admin tooling.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminExcepcionFormModal({
  open, initial, doctores, ubicaciones, onClose, onSaved,
}: Props) {
  const t = useTranslations("Dashboard.admin.excepciones");

  const [value, setValue] = useState<ExcepcionFormValue>(EMPTY);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setValue({
        ...initial,
        fecha_inicio: initial.fecha_inicio.includes("T") && initial.fecha_inicio.length > 16
          ? isoToLocalInput(initial.fecha_inicio)
          : initial.fecha_inicio,
        fecha_fin:    initial.fecha_fin.includes("T") && initial.fecha_fin.length > 16
          ? isoToLocalInput(initial.fecha_fin)
          : initial.fecha_fin,
      });
    } else {
      setValue(EMPTY);
    }
    setErr(null);
  }, [open, initial]);

  const isEdit = Boolean(initial?.id);

  function validate(v: ExcepcionFormValue): string | null {
    if (!v.fecha_inicio || !v.fecha_fin) return t("form.validation.missingFields");
    if (new Date(v.fecha_fin) <= new Date(v.fecha_inicio)) return t("form.validation.endBeforeStart");
    if ((v.scope === "doctor" || v.scope === "both") && !v.doctor_id) return t("form.validation.missingDoctor");
    if ((v.scope === "ubicacion" || v.scope === "both") && !v.ubicacion_id) return t("form.validation.missingUbicacion");
    return null;
  }

  async function handleSubmit() {
    const v = value;
    const validationErr = validate(v);
    if (validationErr) { setErr(validationErr); return; }

    setBusy(true);
    setErr(null);
    try {
      const payload = {
        fecha_inicio: new Date(v.fecha_inicio).toISOString(),
        fecha_fin:    new Date(v.fecha_fin).toISOString(),
        motivo:       v.motivo.trim() || null,
        doctor_id:    (v.scope === "doctor" || v.scope === "both") ? v.doctor_id : null,
        ubicacion_id: (v.scope === "ubicacion" || v.scope === "both") ? v.ubicacion_id : null,
      };

      // Edit-in-place: delete the old one first, then create the new one.
      if (isEdit && initial?.id) {
        const delRes = await fetch(`/api/admin/excepciones/${initial.id}`, { method: "DELETE" });
        if (!delRes.ok) {
          const j = await delRes.json().catch(() => ({})) as { error?: string };
          throw new Error(j.error ?? "delete failed");
        }
      }

      const res = await fetch("/api/admin/excepciones", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? "create failed");
      }

      toast.success(t(isEdit ? "toast.actualizado" : "toast.creado"));
      onSaved();
      onClose();
    } catch {
      toast.error(t(isEdit ? "toast.errorActualizar" : "toast.errorCrear"));
    } finally {
      setBusy(false);
    }
  }

  const fieldCls = "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1 font-roboto";

  const needsDoctor    = value.scope === "doctor"    || value.scope === "both";
  const needsUbicacion = value.scope === "ubicacion" || value.scope === "both";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("form.title_edit") : t("form.title_create")}</DialogTitle>
          <DialogDescription className="sr-only">{t("form.title_create")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>{t("form.scopeLabel")}</label>
            <select
              value={value.scope}
              onChange={(e) => setValue((s) => ({ ...s, scope: e.target.value as ExcepcionScope }))}
              className={fieldCls}
            >
              <option value="global">{t("scope.global")}</option>
              <option value="doctor">{t("scope.doctor")}</option>
              <option value="ubicacion">{t("scope.ubicacion")}</option>
              <option value="both">{t("scope.doctorYUbicacion")}</option>
            </select>
          </div>

          {needsDoctor && (
            <div>
              <label className={labelCls}>{t("form.doctorLabel")}</label>
              <select
                value={value.doctor_id ?? ""}
                onChange={(e) => setValue((s) => ({ ...s, doctor_id: e.target.value || null }))}
                className={fieldCls}
              >
                <option value="">{t("form.selectDoctor")}</option>
                {doctores.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {needsUbicacion && (
            <div>
              <label className={labelCls}>{t("form.ubicacionLabel")}</label>
              <select
                value={value.ubicacion_id ?? ""}
                onChange={(e) => setValue((s) => ({ ...s, ubicacion_id: e.target.value || null }))}
                className={fieldCls}
              >
                <option value="">{t("form.selectUbicacion")}</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("form.fechaInicio")}</label>
              <input
                type="datetime-local"
                value={value.fecha_inicio}
                onChange={(e) => setValue((s) => ({ ...s, fecha_inicio: e.target.value }))}
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t("form.fechaFin")}</label>
              <input
                type="datetime-local"
                value={value.fecha_fin}
                onChange={(e) => setValue((s) => ({ ...s, fecha_fin: e.target.value }))}
                className={fieldCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("form.motivo")}</label>
            <textarea
              value={value.motivo}
              onChange={(e) => setValue((s) => ({ ...s, motivo: e.target.value.slice(0, 280) }))}
              rows={2}
              placeholder={t("form.motivoPlaceholder")}
              className={fieldCls}
            />
          </div>

          {err && (
            <p className="text-xs font-roboto text-red-600">{err}</p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {t("form.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {isEdit ? t("form.submitEdit") : t("form.submitCreate")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
