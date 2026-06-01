"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentoEditarState } from "./actions";

const TIPO_DOCUMENTO_OPTIONS = [
  "laboratorio",
  "radiologia",
  "consulta_medica",
  "especialidades",
  "receta",
  "otro",
] as const;

const ESTADO_OPTIONS = ["activo", "archivado", "eliminado"] as const;

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 " +
  "placeholder:text-gray-400 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors disabled:opacity-50";

interface InitialValues {
  id: string;
  nombre_documento: string;
  tipo_documento: string;
  fecha_documento: string;
  estado_archivo: string;
}

interface Props {
  action: (state: DocumentoEditarState, formData: FormData) => Promise<DocumentoEditarState>;
  initial: InitialValues;
  locale: string;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold font-roboto text-gray-700 uppercase tracking-wide">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 font-roboto">{error}</p>}
    </div>
  );
}

export default function DocumentoEditarForm({ action, initial, locale }: Props) {
  const t = useTranslations("Dashboard.admin.documentos.form");
  const [isPending, startTransition] = useTransition();

  const [nombre,  setNombre]  = useState(initial.nombre_documento);
  const [tipo,    setTipo]    = useState(initial.tipo_documento);
  const [fecha,   setFecha]   = useState(initial.fecha_documento);
  const [estado,  setEstado]  = useState(initial.estado_archivo);
  const [errors,  setErrors]  = useState<{ nombre?: string }>({});

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!nombre.trim()) errs.nombre = t("validNombreReq");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id",               initial.id);
      formData.set("locale",           locale);
      formData.set("nombre_documento", nombre.trim());
      formData.set("tipo_documento",   tipo);
      formData.set("fecha_documento",  fecha);
      formData.set("estado_archivo",   estado);

      const result = await action({}, formData);
      if (result?.error) {
        toast.error(t("errorGuardar"));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label={t("fieldNombre")} error={errors.nombre}>
        <input
          type="text"
          maxLength={200}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={cn(inputCls, errors.nombre && "border-red-300")}
        />
      </Field>

      <Field label={t("fieldTipo")}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
          {TIPO_DOCUMENTO_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {t(`tipo_${opt}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t("fieldFecha")}>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className={inputCls}
        />
      </Field>

      <Field label={t("fieldEstado")}>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={inputCls}>
          {ESTADO_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {t(`estado${opt.charAt(0).toUpperCase()}${opt.slice(1)}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
      </Field>

      <button
        type="submit"
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-white text-sm font-roboto font-semibold hover:bg-secondary/90 disabled:opacity-50 transition-colors"
      >
        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {isPending ? t("guardando") : t("guardar")}
      </button>
    </form>
  );
}
