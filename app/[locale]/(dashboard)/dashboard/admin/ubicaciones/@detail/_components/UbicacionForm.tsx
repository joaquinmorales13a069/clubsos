"use client";
import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export interface UbicacionFormState { error?: string }

interface InitialValues {
  id?: string;
  nombre: string;
  direccion: string;
  telefono: string;
  zona_horaria: string;
  activo: boolean;
}

interface Props {
  action: (state: UbicacionFormState, formData: FormData) => Promise<UbicacionFormState>;
  initial: InitialValues;
  locale: string;
  mode: "editar" | "nuevo";
}

export default function UbicacionForm({ action, initial, locale, mode }: Props) {
  const t = useTranslations("Dashboard.admin.ubicaciones.form");
  const [state, formAction, pending] = useActionState<UbicacionFormState, FormData>(action, {});
  useEffect(() => { if (state.error) toast.error(state.error); }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="locale" value={locale} />

      <Field label={`${t("nombre")} *`}>
        <input name="nombre" required defaultValue={initial.nombre}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("direccion")}>
        <input name="direccion" defaultValue={initial.direccion}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("telefono")}>
        <input name="telefono" defaultValue={initial.telefono}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("zonaHoraria")}>
        <input name="zona_horaria" defaultValue={initial.zona_horaria} placeholder="America/Managua"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none font-mono" />
      </Field>

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
