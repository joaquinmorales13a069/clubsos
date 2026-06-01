"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export interface DoctorFormState { error?: string }

interface InitialValues {
  id?: string;
  nombre: string;
  correo: string;
  telefono: string;
  especialidad: string;
  activo: boolean;
  ubicacion_id: string | null;
  servicios_ids: string[];
}

interface Ubicacion { id: string; nombre: string }
interface Servicio  { id: string; nombre: string }

interface Props {
  action: (state: DoctorFormState, formData: FormData) => Promise<DoctorFormState>;
  initial: InitialValues;
  ubicaciones: Ubicacion[];
  servicios: Servicio[];
  locale: string;
  mode: "editar" | "nuevo";
}

export default function DoctorForm({ action, initial, ubicaciones, servicios, locale, mode }: Props) {
  const t = useTranslations("Dashboard.admin.doctores.form");
  const [state, formAction, pending] = useActionState<DoctorFormState, FormData>(action, {});
  useEffect(() => { if (state.error) toast.error(state.error); }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="locale" value={locale} />

      <Field label={`${t("nombre")} *`}>
        <input name="nombre" required defaultValue={initial.nombre}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("correo")}>
        <input type="email" name="correo" defaultValue={initial.correo}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("telefono")}>
        <input type="tel" name="telefono" defaultValue={initial.telefono}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("especialidad")}>
        <input name="especialidad" defaultValue={initial.especialidad}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("ubicacion")}>
        <select name="ubicacion_id" defaultValue={initial.ubicacion_id ?? ""}
          className="w-full px-3 py-2 rounded-lg border border-gray-200">
          <option value="">— {t("sinUbicacion")} —</option>
          {ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
      </Field>

      <fieldset className="border border-gray-200 rounded-lg p-3">
        <legend className="text-xs font-semibold text-gray-600 px-1">{t("servicios")}</legend>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {servicios.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" name="servicios_ids" value={s.id}
                defaultChecked={initial.servicios_ids.includes(s.id)}
                className="rounded border-gray-300" />
              <span>{s.nombre}</span>
            </label>
          ))}
          {servicios.length === 0 && (
            <p className="text-xs text-gray-400 py-1">{t("sinServicios")}</p>
          )}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" name="activo" value="true" defaultChecked={initial.activo}
          className="rounded border-gray-300" />
        <span className="text-sm text-gray-700">{t("activo")}</span>
      </label>

      <button type="submit" disabled={pending}
        className="w-full px-4 py-2 rounded-full bg-primary text-white font-semibold disabled:opacity-60">
        {pending ? t("guardando") : mode === "nuevo" ? t("crear") : t("guardar")}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
