"use client";

/**
 * ExcepcionForm — shared create/edit form for schedule exceptions.
 *
 * Preserves the affected-citas preview from AdminExcepcionFormModal:
 * debounced fetch to /api/admin/excepciones/preview-affected while form values change.
 */

import { useEffect, useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { formatShortDateTimeNI } from "@/lib/datetime";

export type ExcepcionScope = "global" | "doctor" | "ubicacion" | "both";

export interface ExcepcionFormState { error?: string }

interface AffectedCita {
  id:                string;
  fecha_hora_cita:   string;
  paciente_nombre:   string;
  paciente_telefono: string | null;
  doctor_nombre:     string;
  ubicacion_nombre:  string;
}

interface DoctorOption    { id: string; nombre: string; ubicacion_id: string | null }
interface UbicacionOption { id: string; nombre: string }

interface InitialValues {
  id?:          string;
  scope:        ExcepcionScope;
  doctor_id:    string | null;
  ubicacion_id: string | null;
  fecha_inicio: string;
  fecha_fin:    string;
  motivo:       string;
}

interface Props {
  action: (state: ExcepcionFormState, formData: FormData) => Promise<ExcepcionFormState>;
  initial: InitialValues;
  doctores: DoctorOption[];
  ubicaciones: UbicacionOption[];
  locale: string;
  mode: "editar" | "nuevo";
}

/** Convert ISO timestamptz to YYYY-MM-DDTHH:mm (datetime-local input format). */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normaliseDate(v: string): string {
  if (!v) return v;
  if (v.includes("T") && v.length > 16) return isoToLocalInput(v);
  return v;
}

export default function ExcepcionForm({
  action, initial, doctores, ubicaciones, locale, mode,
}: Props) {
  const t = useTranslations("Dashboard.admin.excepciones.form");
  const tAff = useTranslations("Dashboard.admin.excepciones.affected");
  const localeNI = useLocale() as "es" | "en";

  const [scope,        setScope]        = useState<ExcepcionScope>(initial.scope);
  const [doctorId,     setDoctorId]     = useState<string>(initial.doctor_id ?? "");
  const [ubicacionId,  setUbicacionId]  = useState<string>(initial.ubicacion_id ?? "");
  const [fechaInicio,  setFechaInicio]  = useState<string>(normaliseDate(initial.fecha_inicio));
  const [fechaFin,     setFechaFin]     = useState<string>(normaliseDate(initial.fecha_fin));
  const [motivo,       setMotivo]       = useState<string>(initial.motivo);

  const [affected,       setAffected]       = useState<AffectedCita[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [formError,      setFormError]      = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // Debounced preview of affected citas (same logic as AdminExcepcionFormModal).
  useEffect(() => {
    if (!fechaInicio || !fechaFin) { setAffected(null); return; }
    if (new Date(fechaFin) <= new Date(fechaInicio)) { setAffected(null); return; }
    if ((scope === "doctor"    || scope === "both") && !doctorId)    { setAffected(null); return; }
    if ((scope === "ubicacion" || scope === "both") && !ubicacionId) { setAffected(null); return; }

    let cancelled = false;
    setPreviewLoading(true);
    const handle = setTimeout(async () => {
      try {
        const sp = new URLSearchParams({
          fecha_inicio: new Date(fechaInicio).toISOString(),
          fecha_fin:    new Date(fechaFin).toISOString(),
        });
        const docId = (scope === "doctor"    || scope === "both") ? doctorId    : null;
        const ubiId = (scope === "ubicacion" || scope === "both") ? ubicacionId : null;
        if (docId) sp.set("doctor_id",    docId);
        if (ubiId) sp.set("ubicacion_id", ubiId);
        const res = await fetch(`/api/admin/excepciones/preview-affected?${sp.toString()}`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) { setAffected([]); return; }
        const j = await res.json() as { affected: AffectedCita[] };
        setAffected(j.affected ?? []);
      } catch {
        if (!cancelled) setAffected([]);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 300);

    return () => { cancelled = true; clearTimeout(handle); };
  }, [scope, doctorId, ubicacionId, fechaInicio, fechaFin]);

  const needsDoctor    = scope === "doctor"    || scope === "both";
  const needsUbicacion = scope === "ubicacion" || scope === "both";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    // Client-side validation
    if (!fechaInicio || !fechaFin) {
      setFormError(t("errorFechas"));
      return;
    }
    if (new Date(fechaFin) <= new Date(fechaInicio)) {
      setFormError(t("errorFechas"));
      return;
    }

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action({}, formData);
      if (result?.error) {
        toast.error(result.error);
        setFormError(result.error);
      }
    });
  }

  const fieldCls = "w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-roboto text-gray-800 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="locale" value={locale} />

      {/* Scope */}
      <label className="block">
        <span className={labelCls}>{t("scopeLabel")}</span>
        <select
          name="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as ExcepcionScope)}
          className={fieldCls}
        >
          <option value="global">{t("scopeGlobal")}</option>
          <option value="doctor">{t("scopeDoctor")}</option>
          <option value="ubicacion">{t("scopeUbicacion")}</option>
          <option value="both">{t("scopeBoth")}</option>
        </select>
      </label>

      {/* Doctor select */}
      {needsDoctor && (
        <label className="block">
          <span className={labelCls}>{t("doctor")}</span>
          <select
            name="doctor_id"
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className={fieldCls}
          >
            <option value="">{t("selectDoctor")}</option>
            {doctores.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </label>
      )}

      {/* Ubicacion select */}
      {needsUbicacion && (
        <label className="block">
          <span className={labelCls}>{t("ubicacion")}</span>
          <select
            name="ubicacion_id"
            value={ubicacionId}
            onChange={(e) => setUbicacionId(e.target.value)}
            className={fieldCls}
          >
            <option value="">{t("selectUbicacion")}</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </select>
        </label>
      )}

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelCls}>{t("fechaInicio")}</span>
          <input
            type="datetime-local"
            name="fecha_inicio"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            required
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className={labelCls}>{t("fechaFin")}</span>
          <input
            type="datetime-local"
            name="fecha_fin"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            required
            className={fieldCls}
          />
        </label>
      </div>

      {/* Motivo */}
      <label className="block">
        <span className={labelCls}>{t("motivo")}</span>
        <textarea
          name="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value.slice(0, 280))}
          rows={2}
          placeholder={t("motivoPlaceholder")}
          className={fieldCls}
        />
      </label>

      {/* Affected citas preview */}
      {previewLoading && (
        <p className="text-xs font-roboto text-gray-400">{tAff("loading")}</p>
      )}
      {!previewLoading && affected && affected.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
          <p className="text-sm font-roboto font-semibold text-red-700">
            ⚠️ {tAff("count", { n: affected.length })}
          </p>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {affected.map((c) => (
              <li
                key={c.id}
                className="text-xs font-roboto text-red-900 grid grid-cols-[auto_1fr] gap-2"
              >
                <span className="font-medium whitespace-nowrap">
                  {formatShortDateTimeNI(c.fecha_hora_cita, localeNI)}
                </span>
                <span>
                  {c.paciente_nombre}
                  {c.paciente_telefono ? ` · ${c.paciente_telefono}` : ""}
                  {" · "}{c.doctor_nombre} — {c.ubicacion_nombre}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs font-roboto text-red-700">
            {tAff("whatsappReminder")}
          </p>
        </div>
      )}
      {!previewLoading && affected && affected.length === 0 && (
        <p className="text-xs font-roboto text-gray-500">{tAff("none")}</p>
      )}

      {formError && (
        <p className="text-xs font-roboto text-red-600">{formError}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-primary text-white font-semibold disabled:opacity-60"
      >
        {isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {isPending ? t("guardando") : mode === "nuevo" ? t("crear") : t("guardar")}
      </button>
    </form>
  );
}
