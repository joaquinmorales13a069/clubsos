"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import PhoneInput, { isPossiblePhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { createClient } from "@/utils/supabase/client";

type NotifForm = { nombre_completo: string; telefono: string };

export default function AdminNotificacionesCitas() {
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
      toast.error("Número de teléfono inválido");
      return;
    }
    setSaving(true);
    const { error } = await createClient()
      .from("configuracion_sistema")
      .upsert({ clave: "notificaciones_citas", valor: form, updated_at: new Date().toISOString() });
    if (error) toast.error("Error al guardar");
    else toast.success("Notificaciones internas guardadas");
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
      <p className="text-sm text-neutral">
        Se enviará una notificación WhatsApp a este número cada vez que se agende una nueva cita.
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Nombre completo</label>
          <input
            value={form.nombre_completo}
            onChange={(e) => setForm((f) => ({ ...f, nombre_completo: e.target.value }))}
            placeholder="Ej: Recepción SOSMedical"
            className="w-full mt-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Número de teléfono</label>
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
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
      </button>
    </div>
  );
}
