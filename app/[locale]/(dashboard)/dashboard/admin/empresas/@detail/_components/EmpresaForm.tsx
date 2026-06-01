"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export interface EmpresaFormState { error?: string }

interface InitialValues {
  id?: string;
  nombre: string;
  codigo_empresa: string;
  notas: string;
  auto_confirmar_citas: boolean;
  estado: "activa" | "inactiva";
  ruc: string;
  direccion_calle: string;
  departamento: string;
}

interface Props {
  action: (state: EmpresaFormState, formData: FormData) => Promise<EmpresaFormState>;
  initial: InitialValues;
  locale: string;
  mode: "editar" | "nuevo";
}

const ESTADOS = ["activa", "inactiva"] as const;

export default function EmpresaForm({ action, initial, locale, mode }: Props) {
  const t = useTranslations("Dashboard.admin.empresas.form");
  const [state, formAction, pending] = useActionState<EmpresaFormState, FormData>(action, {});

  useEffect(() => { if (state.error) toast.error(state.error); }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="locale" value={locale} />

      <Field label={t("nombre")}>
        <input name="nombre" required defaultValue={initial.nombre}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("codigoEmpresa")}>
        <input name="codigo_empresa" defaultValue={initial.codigo_empresa}
          placeholder={t("codigoPlaceholder")}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none font-mono" />
      </Field>

      <Field label={t("ruc")}>
        <input name="ruc" defaultValue={initial.ruc}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("direccion")}>
        <input name="direccion_calle" defaultValue={initial.direccion_calle}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("departamento")}>
        <input name="departamento" defaultValue={initial.departamento}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

      <Field label={t("estado")}>
        <select name="estado" defaultValue={initial.estado}
          className="w-full px-3 py-2 rounded-lg border border-gray-200">
          {ESTADOS.map(s => <option key={s} value={s}>{t(`estados.${s}`)}</option>)}
        </select>
      </Field>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" name="auto_confirmar_citas" value="true"
          defaultChecked={initial.auto_confirmar_citas}
          className="rounded border-gray-300" />
        <span className="text-sm text-gray-700">{t("autoConfirma")}</span>
      </label>

      <Field label={t("notas")}>
        <textarea name="notas" rows={3} defaultValue={initial.notas}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none" />
      </Field>

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
