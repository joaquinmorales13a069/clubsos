"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Link2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type PagoRow = {
  id: string;
  metodo: "link_pago" | "transferencia" | "pago_clinica";
  estado: string;
  monto: number | null;
  link_url: string | null;
  referencia: string | null;
  notas: string | null;
};

type CitaConPago = {
  id: string;
  estado_sync: string;
  fecha_hora_cita: string;
  servicio_asociado: string | null;
  created_at: string;
  user: { nombre_completo: string | null; telefono: string | null } | null;
  pago: PagoRow | null;
};

export default function AdminPagoVerificacion() {
  const [citas, setCitas]     = useState<CitaConPago[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState<Record<string, boolean>>({});
  const [linkInputs, setLinkInputs] = useState<Record<string, string>>({});

  const loadQueue = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/admin/citas/pagos");
    const json = await res.json() as { citas: CitaConPago[] };
    setCitas(json.citas ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  async function act(citaId: string, action: string, extra?: Record<string, unknown>) {
    setActing(a => ({ ...a, [citaId]: true }));
    try {
      const res = await fetch(`/api/admin/citas/${citaId}/pago`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Error");
      toast.success(action === "paste_link" ? "Link enviado" : "Pago verificado");
      await loadQueue();
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
      await loadQueue();
      window.dispatchEvent(new CustomEvent("citas:mutated"));
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error"); }
    finally { setActing(a => ({ ...a, [citaId]: false })); }
  }

  const linkPagoCitas      = citas.filter(c => c.pago?.metodo === "link_pago");
  const transferenciaCitas = citas.filter(c => c.pago?.metodo === "transferencia");

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (citas.length === 0) return <p className="text-sm text-neutral py-4 text-center">No hay pagos pendientes de verificación.</p>;

  return (
    <div className="space-y-6">
      {linkPagoCitas.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Link de pago ({linkPagoCitas.length})
          </h4>
          <div className="space-y-3">
            {linkPagoCitas.map(c => (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.user?.nombre_completo ?? "—"}</p>
                    <p className="text-xs text-neutral">{c.servicio_asociado} · {new Date(c.fecha_hora_cita).toLocaleString("es-NI", { timeZone: "America/Managua" })}</p>
                  </div>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                    c.pago?.link_url ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700")}>
                    {c.pago?.link_url ? "Link enviado" : "Sin link"}
                  </span>
                </div>
                {!c.pago?.link_url ? (
                  <div className="flex gap-2">
                    <input
                      type="url" placeholder="https://..."
                      value={linkInputs[c.id] ?? ""}
                      onChange={e => setLinkInputs(l => ({ ...l, [c.id]: e.target.value }))}
                      className="flex-1 rounded-xl border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      disabled={!linkInputs[c.id] || acting[c.id]}
                      onClick={() => void act(c.id, "paste_link", { link_url: linkInputs[c.id] })}
                      className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-medium disabled:opacity-50 flex items-center gap-1"
                    >
                      {acting[c.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Enviar
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => void act(c.id, "verify")}
                      disabled={acting[c.id]}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-green-600 text-white text-xs font-medium disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Verificar pago
                    </button>
                    <button
                      onClick={() => void rechazar(c.id)}
                      disabled={acting[c.id]}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-red-200 text-red-600 text-xs font-medium disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Rechazar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {transferenciaCitas.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-secondary" /> Transferencia bancaria ({transferenciaCitas.length})
          </h4>
          <div className="space-y-3">
            {transferenciaCitas.map(c => (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.user?.nombre_completo ?? "—"}</p>
                    <p className="text-xs text-neutral">{c.servicio_asociado}</p>
                  </div>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                    c.pago?.referencia ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")}>
                    {c.pago?.referencia ? "Referencia recibida" : "Sin referencia"}
                  </span>
                </div>
                {c.pago?.referencia && (
                  <p className="text-xs bg-gray-50 rounded-lg px-3 py-2 font-mono">Ref: {c.pago.referencia}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => void act(c.id, "verify")}
                    disabled={acting[c.id] || !c.pago?.referencia}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-green-600 text-white text-xs font-medium disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verificar transferencia
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
        </section>
      )}
    </div>
  );
}
