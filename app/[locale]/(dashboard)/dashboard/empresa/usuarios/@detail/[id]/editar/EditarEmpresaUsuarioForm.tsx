"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { actualizarEmpresaUsuarioAction, type EmpresaUsuarioFormState } from "./actions";

interface Usuario {
  id: string;
  nombre_completo: string | null;
  telefono: string | null;
  email: string | null;
  documento_identidad: string | null;
  estado: string | null;
}

interface Props { usuario: Usuario; locale: string }

const ESTADOS = ["activo", "inactivo"] as const;

export default function EditarEmpresaUsuarioForm({ usuario, locale }: Props) {
  const t = useTranslations("Dashboard.empresa.usuarios.editar");
  const [state, formAction, pending] = useActionState<EmpresaUsuarioFormState, FormData>(
    actualizarEmpresaUsuarioAction,
    {},
  );

  useEffect(() => { if (state.error) toast.error(state.error); }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id"     value={usuario.id} />
      <input type="hidden" name="locale" value={locale} />

      <Field label={t("nombre")}>
        <input
          name="nombre_completo"
          required
          defaultValue={usuario.nombre_completo ?? ""}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
        />
      </Field>

      <Field label={t("telefono")}>
        <input
          name="telefono"
          type="tel"
          defaultValue={usuario.telefono ?? ""}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
        />
      </Field>

      <Field label={t("email")}>
        <input
          name="email"
          type="email"
          defaultValue={usuario.email ?? ""}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
        />
      </Field>

      <Field label={t("documento")}>
        <input
          name="documento_identidad"
          defaultValue={usuario.documento_identidad ?? ""}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
        />
      </Field>

      <Field label={t("estado")}>
        <select
          name="estado"
          defaultValue={usuario.estado ?? "activo"}
          className="w-full px-3 py-2 rounded-lg border border-gray-200"
        >
          {ESTADOS.map(s => <option key={s} value={s}>{t(`estados.${s}`)}</option>)}
        </select>
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2 rounded-full bg-primary text-white font-semibold disabled:opacity-60"
      >
        {pending ? t("guardando") : t("guardar")}
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
