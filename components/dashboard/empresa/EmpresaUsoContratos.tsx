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
  titulares_count: number;
  total_cuota: number;
  used: number;
  period_start: string;
};

function QuotaBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct < 50 ? "bg-green-500" : pct < 80 ? "bg-yellow-500" : "bg-red-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-neutral shrink-0">
        {used}/{total}
      </span>
    </div>
  );
}

function daysUntilReset(tipo: string, dia: number, periodStart: string): number {
  const start = new Date(periodStart);
  let nextReset: Date;
  if (tipo === "mensual") {
    nextReset = new Date(start);
    nextReset.setMonth(nextReset.getMonth() + 1);
  } else if (tipo === "semanal") {
    nextReset = new Date(start);
    nextReset.setDate(nextReset.getDate() + 7);
  } else {
    nextReset = new Date(start);
    nextReset.setDate(nextReset.getDate() + dia);
  }
  return Math.ceil((nextReset.getTime() - Date.now()) / 86400000);
}

export default function EmpresaUsoContratos({ empresaId }: { empresaId: string }) {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeContrato, setActiveContrato] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase
      .rpc("get_empresa_contrato_usage", { p_empresa_id: empresaId })
      .then(({ data }) => {
        const parsed = (data as UsageRow[]) ?? [];
        setRows(parsed);
        if (parsed.length > 0) setActiveContrato(parsed[0].contrato_id);
        setLoading(false);
      });
  }, [empresaId]);

  const contratos = [
    ...new Map(
      rows.map((r) => [
        r.contrato_id,
        { id: r.contrato_id, nombre: r.contrato_nombre },
      ]),
    ).values(),
  ];
  const activeRows = rows.filter((r) => r.contrato_id === activeContrato);
  const firstRow = activeRows[0];

  if (loading)
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  if (rows.length === 0)
    return (
      <p className="text-sm text-neutral py-4 text-center">Sin contratos activos.</p>
    );

  return (
    <div className="space-y-4">
      {contratos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {contratos.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveContrato(c.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                activeContrato === c.id
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {firstRow && (
        <p className="text-xs text-neutral">
          Reseteo en{" "}
          {daysUntilReset(firstRow.tipo_reset, firstRow.dia_reset, firstRow.period_start)}{" "}
          días
        </p>
      )}

      <div className="space-y-3">
        {activeRows.map((r) => (
          <div key={r.cs_id} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-gray-700">{r.servicio_nombre}</span>
              <span className="text-neutral">{r.cuota_por_titular} / titular / período</span>
            </div>
            <QuotaBar used={r.used} total={r.total_cuota} />
          </div>
        ))}
      </div>
    </div>
  );
}
