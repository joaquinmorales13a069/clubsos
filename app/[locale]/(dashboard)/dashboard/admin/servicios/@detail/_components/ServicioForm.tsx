"use client";
import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export interface ServicioFormState { error?: string }

interface InitialValues {
  id?: string;
  nombre: string;
  descripcion: string;
  duracion: string;       // form values are strings
  slot_duracion: string;
  precio: string;
  activo: boolean;
}

interface Props {
  action: (state: ServicioFormState, formData: FormData) => Promise<ServicioFormState>;
  initial: InitialValues;
  locale: string;
  mode: "editar" | "nuevo";
}

export default function ServicioForm({ action, initial, locale, mode }: Props) {
  const t = useTranslations("Dashboard.admin.servicios.form");
  const [state, formAction, pending] = useActionState<ServicioFormState, FormData>(action, {});
  useEffect(() => { if (state.error) toast.error(state.error); }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="locale" value={locale} />

      <Field label={t("nombre")}>
        <input name="nombre" required defaultValue={initial.nombre}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("descripcion")}>
        <textarea name="descripcion" rows={2} defaultValue={initial.descripcion}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("duracion")}>
        <input type="number" name="duracion" min={1} defaultValue={initial.duracion}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("slotDuracion")}>
        <input type="number" name="slot_duracion" min={1} required defaultValue={initial.slot_duracion}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("precio")}>
        <input type="number" step="0.01" name="precio" min={0} defaultValue={initial.precio}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
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
