import { cn } from "@/lib/utils";
import type { CitaEstado } from "./types";

const CONFIG: Record<CitaEstado, { label: string; className: string }> = {
  pendiente:          { label: "Pendiente",            className: "bg-yellow-100 text-yellow-800" },
  pendiente_empresa:  { label: "En revisión empresa",  className: "bg-blue-100 text-blue-800"    },
  pendiente_pago:     { label: "Pago pendiente",       className: "bg-orange-100 text-orange-800"},
  pendiente_admin:    { label: "Pendiente admin",      className: "bg-purple-100 text-purple-800"},
  confirmado:         { label: "Confirmada",           className: "bg-green-100 text-green-800"  },
  completado:         { label: "Completada",           className: "bg-gray-100 text-gray-700"   },
  cancelado:          { label: "Cancelada",            className: "bg-red-100 text-red-700"      },
  rechazado:          { label: "Rechazada",            className: "bg-red-100 text-red-700"      },
};

export default function CitaEstadoBadge({ estado }: { estado: CitaEstado }) {
  const cfg = CONFIG[estado] ?? { label: estado, className: "bg-gray-100 text-gray-700" };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}
