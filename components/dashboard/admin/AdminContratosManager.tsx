"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Servicio = { id: string; nombre: string; ea_category_id: number | null };

const CATEGORY_LABEL: Record<number, string> = { 1: "Managua", 2: "León" };

function servicioLabel(s: Servicio): string {
  const suffix = s.ea_category_id != null ? CATEGORY_LABEL[s.ea_category_id] : undefined;
  return suffix ? `${s.nombre} - ${suffix}` : s.nombre;
}
type ContratoServicio = { id: string; cuota_por_titular: number; servicio: { id: string; nombre: string } | null };
type Contrato = {
  id: string; nombre: string; fecha_inicio: string; fecha_fin: string | null;
  tipo_reset: string; dia_reset: number; activo: boolean; empresa_id: string;
  empresa: { nombre: string } | null;
  contrato_servicios: ContratoServicio[];
};
type EmpresaOption = { id: string; nombre: string };

interface Props { empresaId?: string; }

export default function AdminContratosManager({ empresaId }: Props) {
  const [contratos, setContratos]   = useState<Contrato[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState<Contrato | null>(null);
  const [empresas, setEmpresas]     = useState<EmpresaOption[]>([]);
  const [servicios, setServicios]   = useState<Servicio[]>([]);
  const [form, setForm]             = useState({ nombre: "", empresa_id: empresaId ?? "", fecha_inicio: "", fecha_fin: "", tipo_reset: "mensual", dia_reset: 1 });
  const [saving, setSaving]         = useState(false);

  const loadContratos = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/admin/contratos");
    const json = await res.json() as { contratos: Contrato[] };
    setContratos(empresaId ? json.contratos.filter(c => c.empresa_id === empresaId) : json.contratos);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { void loadContratos(); }, [loadContratos]);

  // Load servicios and empresas on mount — servicios are needed when
  // expanding a contract card, not just when the create/edit modal opens.
  useEffect(() => {
    import("@/utils/supabase/client").then(({ createClient }) => {
      const sb = createClient();
      void sb.from("empresas").select("id, nombre").order("nombre").then(({ data }) => setEmpresas(data ?? []));
      void sb.from("servicios").select("id, nombre, ea_category_id").eq("activo", true).order("nombre").then(({ data }) => setServicios(data ?? []));
    });
  }, []);

  async function saveContrato() {
    setSaving(true);
    try {
      const method = editing ? "PATCH" : "POST";
      const url    = editing ? `/api/admin/contratos/${editing.id}` : "/api/admin/contratos";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dia_reset: Number(form.dia_reset), fecha_fin: form.fecha_fin || null }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Error");
      toast.success(editing ? "Contrato actualizado" : "Contrato creado");
      setShowModal(false);
      setEditing(null);
      await loadContratos();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error"); }
    finally { setSaving(false); }
  }

  async function deleteContrato(id: string) {
    if (!confirm("¿Eliminar este contrato? Esta acción no se puede deshacer.")) return;
    const res = await fetch(`/api/admin/contratos/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Contrato eliminado"); await loadContratos(); }
    else toast.error("Error al eliminar");
  }

  async function addServicio(contratoId: string, servicioId: string, cuota: number) {
    const res = await fetch(`/api/admin/contratos/${contratoId}/servicios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servicio_id: servicioId, cuota_por_titular: cuota }),
    });
    if (res.ok) { toast.success("Servicio agregado"); await loadContratos(); }
    else toast.error("Error al agregar servicio");
  }

  async function removeServicio(contratoId: string, csId: string) {
    const res = await fetch(`/api/admin/contratos/${contratoId}/servicios`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrato_servicio_id: csId }),
    });
    if (res.ok) { toast.success("Servicio eliminado"); await loadContratos(); }
    else toast.error("Error al eliminar servicio");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-poppins font-semibold text-gray-900">Contratos</h3>
        <button
          onClick={() => {
            setEditing(null);
            setForm({ nombre: "", empresa_id: empresaId ?? "", fecha_inicio: "", fecha_fin: "", tipo_reset: "mensual", dia_reset: 1 });
            setShowModal(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Nuevo contrato
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : contratos.length === 0 ? (
        <p className="text-sm text-neutral py-4 text-center">No hay contratos configurados.</p>
      ) : (
        <div className="space-y-2">
          {contratos.map(c => (
            <div key={c.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="w-full flex items-center justify-between p-4 hover:bg-gray-50">
                <button
                  onClick={() => setExpandedId(id => id === c.id ? null : c.id)}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="font-semibold text-sm text-gray-900">{c.nombre}</p>
                  <p className="text-xs text-neutral mt-0.5">
                    {c.empresa?.nombre} · {c.tipo_reset} · {c.contrato_servicios.length} servicio(s)
                    {!c.activo && <span className="ml-2 text-red-500">Inactivo</span>}
                  </p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditing(c);
                      setForm({ nombre: c.nombre, empresa_id: c.empresa_id, fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin ?? "", tipo_reset: c.tipo_reset, dia_reset: c.dia_reset });
                      setShowModal(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-gray-100"
                  >
                    <Pencil className="h-3.5 w-3.5 text-neutral" />
                  </button>
                  <button
                    onClick={() => void deleteContrato(c.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                  <button
                    onClick={() => setExpandedId(id => id === c.id ? null : c.id)}
                    className="p-1"
                  >
                    <ChevronDown className={cn("h-4 w-4 text-neutral transition-transform", expandedId === c.id && "rotate-180")} />
                  </button>
                </div>
              </div>

              {expandedId === c.id && (
                <AddServicioRow
                  contratoId={c.id}
                  existing={c.contrato_servicios}
                  servicios={servicios}
                  onAdd={addServicio}
                  onRemove={(csId) => void removeServicio(c.id, csId)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-poppins font-semibold">{editing ? "Editar contrato" : "Nuevo contrato"}</h3>
            <div className="space-y-3">
              {!empresaId && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Empresa</label>
                  <select
                    value={form.empresa_id}
                    onChange={e => setForm(f => ({ ...f, empresa_id: e.target.value }))}
                    className="w-full mt-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Selecciona empresa</option>
                    {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </div>
              )}
              <FormField label="Nombre" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} />
              <FormField label="Fecha inicio" type="date" value={form.fecha_inicio} onChange={v => setForm(f => ({ ...f, fecha_inicio: v }))} />
              <FormField label="Fecha fin (opcional)" type="date" value={form.fecha_fin} onChange={v => setForm(f => ({ ...f, fecha_fin: v }))} />
              <div>
                <label className="text-xs font-medium text-gray-600">Tipo de reset</label>
                <select
                  value={form.tipo_reset}
                  onChange={e => setForm(f => ({ ...f, tipo_reset: e.target.value }))}
                  className="w-full mt-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="mensual">Mensual</option>
                  <option value="semanal">Semanal</option>
                  <option value="personalizado">Personalizado</option>
                </select>
              </div>
              <FormField
                label={form.tipo_reset === "personalizado" ? "Días por periodo" : form.tipo_reset === "mensual" ? "Día del mes (1-31)" : "Día de semana (1=Lun, 7=Dom)"}
                type="number"
                value={String(form.dia_reset)}
                onChange={v => setForm(f => ({ ...f, dia_reset: Number(v) }))}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">Cancelar</button>
              <button
                onClick={() => void saveContrato()}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Guardar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full mt-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

function AddServicioRow({ contratoId, existing, servicios, onAdd, onRemove }: {
  contratoId: string; existing: ContratoServicio[]; servicios: Servicio[];
  onAdd: (contratoId: string, servicioId: string, cuota: number) => void;
  onRemove: (csId: string) => void;
}) {
  const [showForm, setShowForm]           = useState(false);
  const [newServicioId, setNewServicioId] = useState("");
  const [newCuota, setNewCuota]           = useState(1);
  const [adding, setAdding]               = useState(false);
  const existingIds = new Set(existing.map(cs => cs.servicio?.id));
  const available   = servicios.filter(s => !existingIds.has(s.id));

  async function handleAdd() {
    if (!newServicioId) return;
    setAdding(true);
    await onAdd(contratoId, newServicioId, newCuota);
    setNewServicioId("");
    setNewCuota(1);
    setShowForm(false);
    setAdding(false);
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50/70 px-4 pt-3 pb-4 space-y-2">
      {/* Existing services list */}
      {existing.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {existing.map(cs => (
            <div key={cs.id} className="flex items-center justify-between rounded-lg bg-white border border-gray-100 px-3 py-2">
              <span className="text-sm font-medium text-gray-800">{cs.servicio?.nombre ?? "?"}</span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-roboto text-neutral/70 bg-gray-100 px-2 py-0.5 rounded-full">
                  {cs.cuota_por_titular} / titular / período
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(cs.id)}
                  className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form — shown inline when button is pressed */}
      {showForm ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-secondary/30 bg-white px-3 py-2.5">
          <select
            value={newServicioId}
            onChange={e => setNewServicioId(e.target.value)}
            className="w-52 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800
                       focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10"
            autoFocus
          >
            <option value="">Selecciona un servicio…</option>
            {available.map(s => <option key={s.id} value={s.id}>{servicioLabel(s)}</option>)}
          </select>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-neutral/70 whitespace-nowrap">Cuota / titular:</label>
            <input
              type="number" min="1" value={newCuota}
              onChange={e => setNewCuota(Math.max(1, Number(e.target.value)))}
              className="w-14 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center
                         focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10"
            />
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => { setShowForm(false); setNewServicioId(""); setNewCuota(1); }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!newServicioId || adding}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-white
                         text-xs font-semibold disabled:opacity-50 transition-colors hover:bg-secondary/90"
            >
              {adding && <Loader2 className="h-3 w-3 animate-spin" />}
              Agregar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          disabled={available.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-secondary/40
                     text-xs font-medium text-secondary hover:bg-secondary/5 disabled:opacity-40
                     disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {available.length === 0 ? "Todos los servicios ya están agregados" : "Agregar servicio"}
        </button>
      )}
    </div>
  );
}
