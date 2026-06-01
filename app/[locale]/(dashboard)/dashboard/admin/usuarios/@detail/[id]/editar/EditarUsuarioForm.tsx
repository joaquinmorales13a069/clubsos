"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { actualizarUsuarioAction, type ActualizarUsuarioState } from "./actions";

interface Usuario {
  id: string;
  nombre_completo: string | null;
  rol: string | null;
  estado: string | null;
  empresa_id: string | null;
}
interface Empresa { id: string; nombre: string }
interface Props {
  usuario: Usuario;
  empresas: Empresa[];
  locale: string;
}

const ROLES   = ["admin", "empresa_admin", "miembro"] as const;
const ESTADOS = ["activo", "inactivo", "pendiente"] as const;

export default function EditarUsuarioForm({ usuario, empresas, locale }: Props) {
  const t = useTranslations("Dashboard.admin.usuarios.editar");
  const [state, formAction, pending] = useActionState<ActualizarUsuarioState, FormData>(
    actualizarUsuarioAction,
    {},
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id"     value={usuario.id} />
      <input type="hidden" name="locale" value={locale} />

      <Field label={t("nombre")}>
        <input
          value={usuario.nombre_completo ?? ""}
          disabled
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-500"
          readOnly
        />
      </Field>

      <Field label={t("rol")}>
        <select
          name="rol"
          defaultValue={usuario.rol ?? "miembro"}
          className="w-full px-3 py-2 rounded-lg border border-gray-200"
        >
          {ROLES.map(r => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
        </select>
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

      <Field label={t("empresa")}>
        <select
          name="empresa_id"
          defaultValue={usuario.empresa_id ?? ""}
          className="w-full px-3 py-2 rounded-lg border border-gray-200"
        >
          <option value="">— {t("sinEmpresa")} —</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
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
