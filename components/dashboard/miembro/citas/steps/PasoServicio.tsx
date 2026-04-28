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
  categoriaId:  number;
  empresaId:    string | null;
  titularRefId: string;
  onSelect: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

async function checkCoverage(
  servicioId: string,
  empresaId: string,
  titularRefId: string,
): Promise<{ contrato_servicio_id: string | null; cuota_disponible: number | null }> {
  const supabase = createClient();
  const { data: cs } = await supabase
    .from("contrato_servicios")
    .select("id, contrato:contratos!inner(empresa_id, activo)")
    .eq("servicio_id", servicioId)
    .eq("contrato.empresa_id", empresaId)
    .eq("contrato.activo", true)
    .limit(1)
    .single();

  if (!cs) return { contrato_servicio_id: null, cuota_disponible: null };

  const { data: quota } = await supabase.rpc("check_cuota_disponible", {
    p_contrato_servicio_id: (cs as any).id,
    p_titular_ref_id: titularRefId,
  });

  return {
    contrato_servicio_id: (cs as any).id,
    cuota_disponible: typeof quota === "number" ? quota : null,
  };
}

export default function PasoServicio({ categoriaId, empresaId, titularRefId, onSelect, onBack }: PasoServicioProps) {
  const t = useTranslations("Dashboard.miembro.citas.wizard");
  const ts = useTranslations("Dashboard.miembro.citas.wizard.servicio");
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading]     = useState(true);
  const [checking, setChecking]   = useState<string | null>(null);

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

  async function handleSelect(s: Servicio) {
    setChecking(s.id);
    let contrato_servicio_id: string | null = null;
    let cuota_disponible: number | null = null;
    let requires_payment = true;

    if (empresaId) {
      const result = await checkCoverage(s.id, empresaId, titularRefId);
      contrato_servicio_id = result.contrato_servicio_id;
      cuota_disponible     = result.cuota_disponible;
      requires_payment     = !contrato_servicio_id || cuota_disponible === null || cuota_disponible <= 0;
    }

    onSelect({
      eaServiceId:          s.ea_service_id,
      servicioId:           s.id,
      servicioNombre:       s.nombre,
      servicioDuracion:     s.duracion ?? 30,
      contrato_servicio_id,
      cuota_disponible,
      requires_payment,
    });
    setChecking(null);
  }

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
              disabled={checking !== null}
              onClick={() => handleSelect(s)}
              className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left
                         shadow-sm transition-all hover:border-secondary/40 hover:shadow-md
                         disabled:opacity-60 disabled:cursor-not-allowed"
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
                {checking === s.id && (
                  <div className="flex items-center gap-1 text-xs text-neutral mt-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Verificando cobertura…</span>
                  </div>
                )}
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
