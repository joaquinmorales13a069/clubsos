"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import PhoneInput, { isPossiblePhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { createClient } from "@/utils/supabase/client";

type NotifForm = { nombre_completo: string; telefono: string };

export default function AdminNotificacionesCitas() {
  const t = useTranslations("Dashboard.admin.sistema.notifCitas");

  const [form, setForm]       = useState<NotifForm>({ nombre_completo: "", telefono: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    void createClient()
      .from("configuracion_sistema")
      .select("valor")
      .eq("clave", "notificaciones_citas")
      .single()
      .then(({ data }) => {
        if (data?.valor) setForm(data.valor as NotifForm);
        setLoading(false);
      });
  }, []);

  async function save() {
    if (!isPossiblePhoneNumber(form.telefono)) {
      toast.error(t("toastTelefonoInvalido"));
      return;
    }
    setSaving(true);
    const { error } = await createClient()
      .from("configuracion_sistema")
      .upsert({ clave: "notificaciones_citas", valor: form, updated_at: new Date().toISOString() });
    if (error) toast.error(t("toastError"));
    else toast.success(t("toastExito"));
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral">{t("subtitle")}</p>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600">{t("labelNombre")}</label>
          <input
            value={form.nombre_completo}
            onChange={(e) => setForm((f) => ({ ...f, nombre_completo: e.target.value }))}
            placeholder={t("placeholderNombre")}
            className="w-full mt-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">{t("labelTelefono")}</label>
          <div className="mt-1 border border-gray-300 rounded-xl focus-within:ring-2 focus-within:ring-primary/30 transition-all">
            <PhoneInput
              international
              defaultCountry="NI"
              value={form.telefono}
              onChange={(v) => setForm((f) => ({ ...f, telefono: v ?? "" }))}
              className="flex h-10 w-full px-3 py-2 text-sm [&>input]:bg-transparent [&>input]:border-none [&>input]:outline-none [&>input]:w-full"
            />
          </div>
        </div>
      </div>
      <button
        onClick={() => void save()}
        disabled={saving || !form.nombre_completo || !form.telefono}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} {t("guardar")}
      </button>
    </div>
  );
}
