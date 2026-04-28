"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type CitaAdminRow = {
  id: string;
  fecha_hora_cita: string;
  servicio_asociado: string | null;
  created_at: string;
  user: { nombre_completo: string | null; telefono: string | null } | null;
  pago: { metodo: string; monto: number | null } | null;
};

export default function AdminCitasPendientesAdmin() {
  const [citas, setCitas]     = useState<CitaAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState<Record<string, boolean>>({});

  const loadCitas = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("citas")
      .select(`
        id, fecha_hora_cita, servicio_asociado, created_at,
        user:users!paciente_id(nombre_completo, telefono),
        pago:pagos(metodo, monto)
      `)
      .eq("estado_sync", "pendiente_admin")
      .order("created_at", { ascending: true });
    setCitas((data ?? []) as unknown as CitaAdminRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadCitas(); }, [loadCitas]);

  useEffect(() => {
    const handler = () => { void loadCitas(); };
    window.addEventListener("citas:mutated", handler);
    return () => window.removeEventListener("citas:mutated", handler);
  }, [loadCitas]);

  async function aprobar(citaId: string) {
    setActing(a => ({ ...a, [citaId]: true }));
    try {
      const res = await fetch(`/api/admin/citas/${citaId}/aprobar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citaId }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Error");
      toast.success("Cita aprobada");
      await loadCitas();
      window.dispatchEvent(new CustomEvent("citas:mutated"));
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error"); }
    finally { setActing(a => ({ ...a, [citaId]: false })); }
  }

  async function rechazar(citaId: string) {
    if (!confirm("¿Rechazar esta cita?")) return;
    setActing(a => ({ ...a, [citaId]: true }));
    try {
      const res = await fetch(`/api/admin/citas/${citaId}/rechazar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citaId }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Error");
      toast.success("Cita rechazada");
      await loadCitas();
      window.dispatchEvent(new CustomEvent("citas:mutated"));
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error"); }
    finally { setActing(a => ({ ...a, [citaId]: false })); }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (citas.length === 0) return <p className="text-sm text-neutral py-4 text-center">No hay citas pendientes de aprobación.</p>;

  return (
    <div className="space-y-3">
      {citas.map(c => (
        <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-900">{c.user?.nombre_completo ?? "—"}</p>
            <p className="text-xs text-neutral">{c.servicio_asociado} · {new Date(c.fecha_hora_cita).toLocaleString("es-NI", { timeZone: "America/Managua" })}</p>
            <p className="text-xs text-neutral mt-0.5">Pago en clínica{c.pago?.monto ? ` · C$${c.pago.monto}` : ""}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void aprobar(c.id)}
              disabled={acting[c.id]}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-green-600 text-white text-xs font-medium disabled:opacity-50"
            >
              {acting[c.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Aprobar
            </button>
            <button
              onClick={() => void rechazar(c.id)}
              disabled={acting[c.id]}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-red-200 text-red-600 text-xs font-medium"
            >
              <XCircle className="h-3.5 w-3.5" /> Rechazar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
