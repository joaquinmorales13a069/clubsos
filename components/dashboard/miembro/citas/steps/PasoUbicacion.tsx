"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { WizardState } from "../types";

interface UbicacionRow {
  id:        string;
  nombre:    string;
  direccion: string | null;
}

interface PasoUbicacionProps {
  onSelect: (patch: Partial<WizardState>) => void;
}

export default function PasoUbicacion({ onSelect }: PasoUbicacionProps) {
  const t = useTranslations("Dashboard.miembro.citas.wizard.ubicacion");
  const [ubicaciones, setUbicaciones] = useState<UbicacionRow[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("ubicaciones")
      .select("id, nombre, direccion")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        setUbicaciones((data ?? []) as UbicacionRow[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{t("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-neutral">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-roboto">{t("loading")}</span>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ubicaciones.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onSelect({ ubicacionId: u.id, ubicacionNombre: u.nombre })}
              className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left
                         shadow-sm transition-all hover:border-secondary/40 hover:shadow-md cursor-pointer"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="font-poppins font-semibold text-gray-900">{u.nombre}</p>
                {u.direccion && (
                  <p className="mt-0.5 text-sm font-roboto text-neutral">{u.direccion}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
