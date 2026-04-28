"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

type UsageRow = {
  contrato_id: string;
  contrato_nombre: string;
  tipo_reset: string;
  dia_reset: number;
  cs_id: string;
  servicio_nombre: string;
  cuota_por_titular: number;
  familiares_count: number;
  used: number;
  remaining: number;
  period_start: string;
};

function daysUntilReset(tipo: string, dia: number, periodStart: string): number {
  const start = new Date(periodStart);
  let next: Date;
  if (tipo === "mensual") {
    next = new Date(start);
    next.setMonth(next.getMonth() + 1);
  } else if (tipo === "semanal") {
    next = new Date(start);
    next.setDate(next.getDate() + 7);
  } else {
    next = new Date(start);
    next.setDate(next.getDate() + dia);
  }
  return Math.ceil((next.getTime() - Date.now()) / 86400000);
}

export default function MisServiciosCubiertos({ userId }: { userId: string }) {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    void supabase
      .rpc("get_miembro_contrato_usage", { p_user_id: userId })
      .then(({ data }) => {
        setRows((data as UsageRow[]) ?? []);
        setLoading(false);
      });
  }, [userId]);

  if (loading)
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  if (rows.length === 0) return null;

  const firstRow = rows[0];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-poppins font-semibold text-gray-900">
          Mis Servicios Cubiertos
        </h3>
        <span className="text-xs text-neutral">
          Resetea en{" "}
          {daysUntilReset(firstRow.tipo_reset, firstRow.dia_reset, firstRow.period_start)}{" "}
          días
        </span>
      </div>

      {firstRow.familiares_count > 0 && (
        <p className="text-xs text-neutral">
          Cuota compartida entre tú y {firstRow.familiares_count} familiar(es) registrado(s)
        </p>
      )}

      <div className="space-y-3">
        {rows.map((r) => {
          const pct =
            r.cuota_por_titular > 0
              ? Math.min((r.used / r.cuota_por_titular) * 100, 100)
              : 0;
          const exhausted = r.remaining <= 0;
          return (
            <div key={r.cs_id} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-gray-700">{r.servicio_nombre}</span>
                <span className={cn("font-medium", exhausted ? "text-red-600" : "text-neutral")}>
                  {r.remaining > 0 ? `${r.remaining} restante(s)` : "Pago requerido"}
                </span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    pct < 50 ? "bg-green-500" : pct < 80 ? "bg-yellow-500" : "bg-red-500",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-neutral">
                {r.used}/{r.cuota_por_titular} usadas
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
