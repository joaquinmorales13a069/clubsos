"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/utils/supabase/client";

type DatosForm = { banco: string; numero_cuenta: string; iban: string; nombre_titular: string };

export default function AdminDatosBancarios() {
  const t = useTranslations("Dashboard.admin.sistema.datosBancarios");

  const [form, setForm]       = useState<DatosForm>({ banco: "", numero_cuenta: "", iban: "", nombre_titular: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("configuracion_sistema")
      .select("valor")
      .eq("clave", "datos_bancarios")
      .single()
      .then(({ data }) => {
        if (data?.valor) setForm(data.valor as DatosForm);
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("configuracion_sistema")
      .upsert({ clave: "datos_bancarios", valor: form, updated_at: new Date().toISOString() });
    if (error) toast.error(t("toastError"));
    else toast.success(t("toastExito"));
    setSaving(false);
  }

  const FIELD_LABELS: Record<keyof DatosForm, string> = {
    nombre_titular: t("labelNombreTitular"),
    banco:          t("labelBanco"),
    numero_cuenta:  t("labelNumeroCuenta"),
    iban:           t("labelIban"),
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <h3 className="text-base font-poppins font-semibold text-gray-900">{t("titulo")}</h3>
      <p className="text-sm text-neutral">{t("subtitle")}</p>
      <div className="space-y-3">
        {(["nombre_titular", "banco", "numero_cuenta", "iban"] as const).map((field) => (
          <div key={field}>
            <label className="text-xs font-medium text-gray-600">{FIELD_LABELS[field]}</label>
            <input
              value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="w-full mt-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => void save()}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} {t("guardar")}
      </button>
    </div>
  );
}
