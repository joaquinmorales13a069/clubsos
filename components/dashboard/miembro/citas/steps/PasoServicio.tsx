"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Stethoscope, Loader2, Clock, DollarSign } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { WizardState } from "../types";

interface Servicio {
  id: string;
  ea_service_id: number;
  nombre: string;
  duracion: number | null;
  precio: number | null;
  descripcion: string | null;
}

interface PasoServicioProps {
  categoriaId: number;
  onSelect: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

export default function PasoServicio({ categoriaId, onSelect, onBack }: PasoServicioProps) {
  const t = useTranslations("Dashboard.miembro.citas.wizard");
  const ts = useTranslations("Dashboard.miembro.citas.wizard.servicio");
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("servicios")
      .select("id, ea_service_id, nombre, duracion, precio, descripcion")
      .eq("ea_category_id", categoriaId)
      .eq("activo", true)
      .then(({ data }) => {
        setServicios(data ?? []);
        setLoading(false);
      });
  }, [categoriaId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-poppins font-bold text-gray-900">{ts("title")}</h2>
        <p className="text-sm font-roboto text-neutral mt-0.5">{ts("subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-neutral">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-roboto">{ts("loading")}</span>
        </div>
      ) : servicios.length === 0 ? (
        <div className="text-center py-10">
          <Stethoscope className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-sm font-roboto text-gray-500">{ts("noServices")}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {servicios.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect({ eaServiceId: s.ea_service_id, servicioNombre: s.nombre, servicioDuracion: s.duracion ?? 30 })}
              className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left
                         shadow-sm transition-all hover:border-secondary/40 hover:shadow-md"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-poppins font-semibold text-gray-900">{s.nombre}</p>
                {s.descripcion && (
                  <p className="mt-0.5 text-xs font-roboto text-neutral line-clamp-2">{s.descripcion}</p>
                )}
                <div className="flex gap-3 mt-1.5">
                  {s.duracion && (
                    <span className="flex items-center gap-1 text-xs text-neutral">
                      <Clock className="w-3 h-3" /> {s.duracion} {ts("duration")}
                    </span>
                  )}
                  {s.precio != null && (
                    <span className="flex items-center gap-1 text-xs text-neutral">
                      <DollarSign className="w-3 h-3" /> {ts("price")}{s.precio.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onBack}
        className="text-sm font-roboto text-neutral hover:text-gray-700 transition-colors"
      >
        ← {t("backBtn")}
      </button>
    </div>
  );
}
