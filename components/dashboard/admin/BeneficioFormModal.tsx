"use client";

/**
 * BeneficioFormModal — Create / Edit modal for beneficios (Step 7.4).
 *
 * Image flow:
 *  - New file selected    → upload to beneficios-imagenes, store public URL.
 *  - Existing image kept  → pass through unchanged.
 *  - Existing image removed → delete from storage, set URL to null.
 */

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Upload, X, ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import type { BeneficioRow, EmpresaOption } from "./AdminBeneficios";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BUCKET = "beneficios-imagenes";

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function extractStoragePath(publicUrl: string): string {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  return idx >= 0 ? decodeURIComponent(publicUrl.slice(idx + marker.length)) : publicUrl;
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold font-roboto text-gray-700 uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 font-roboto">{error}</p>}
    </div>
  );
}

// ── Input / Textarea base styles ──────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors disabled:opacity-50";

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open:       boolean;
  mode:       "crear" | "editar";
  beneficio:  BeneficioRow | null;
  empresas:   EmpresaOption[];
  createdBy:  string;
  onClose:    () => void;
  onSaved:    (saved: BeneficioRow, isNew: boolean) => void;
}

type FormState = {
  titulo:            string;
  descripcion:       string;
  tipo_beneficio:    "descuento" | "promocion";
  estado_beneficio:  "activa" | "expirada";
  fecha_inicio:      string;
  fecha_fin:         string;
  empresa_ids:       string[];
};

const DEFAULT_FORM: FormState = {
  titulo:           "",
  descripcion:      "",
  tipo_beneficio:   "descuento",
  estado_beneficio: "activa",
  fecha_inicio:     "",
  fecha_fin:        "",
  empresa_ids:      [],
};

export default function BeneficioFormModal({
  open, mode, beneficio, empresas, createdBy, onClose, onSaved,
}: Props) {
  const t = useTranslations("Dashboard.admin.beneficios.modal");

  const [form,           setForm]           = useState<FormState>(DEFAULT_FORM);
  const [imageFile,      setImageFile]      = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [errors,         setErrors]         = useState<Partial<Record<keyof FormState, string>>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync form state when modal opens / beneficio changes
  useEffect(() => {
    if (open) {
      if (beneficio) {
        setForm({
          titulo:           beneficio.titulo,
          descripcion:      beneficio.descripcion ?? "",
          tipo_beneficio:   beneficio.tipo_beneficio,
          estado_beneficio: beneficio.estado_beneficio,
          fecha_inicio:     toDateInput(beneficio.fecha_inicio),
          fecha_fin:        toDateInput(beneficio.fecha_fin),
          empresa_ids:      beneficio.empresa_id ?? [],
        });
      } else {
        setForm(DEFAULT_FORM);
      }
      setImageFile(null);
      setRemoveExisting(false);
      setErrors({});
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open, beneficio]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: typeof errors = {};
    if (!form.titulo.trim())                              errs.titulo     = t("validTituloReq");
    if (form.fecha_inicio && form.fecha_fin && form.fecha_fin < form.fecha_inicio)
                                                          errs.fecha_fin  = t("validFechas");
    if (imageFile && imageFile.size > 5 * 1024 * 1024)  errs.titulo     = t("validImagenSize");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Image helpers ─────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) setRemoveExisting(false);
  };

  const handleRemoveFile = () => {
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveExisting = () => {
    setRemoveExisting(true);
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    const supabase = createClient();

    try {
      let finalImageUrl = beneficio?.beneficio_image_url ?? null;

      // Delete existing image if marked for removal
      if (removeExisting && beneficio?.beneficio_image_url) {
        const path = extractStoragePath(beneficio.beneficio_image_url);
        await supabase.storage.from(BUCKET).remove([path]);
        finalImageUrl = null;
      }

      // Upload new image if selected
      if (imageFile) {
        const ext  = imageFile.name.split(".").pop() ?? "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, imageFile, { contentType: imageFile.type, upsert: false });

        if (uploadError) {
          toast.error(t("errorImagen"));
          setSaving(false);
          return;
        }
        finalImageUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

        // Delete old image after successful upload (edit mode)
        if (mode === "editar" && beneficio?.beneficio_image_url && !removeExisting) {
          const oldPath = extractStoragePath(beneficio.beneficio_image_url);
          await supabase.storage.from(BUCKET).remove([oldPath]);
        }
      }

      const payload = {
        titulo:             form.titulo.trim(),
        descripcion:        form.descripcion.trim() || null,
        tipo_beneficio:     form.tipo_beneficio,
        estado_beneficio:   form.estado_beneficio,
        fecha_inicio:       form.fecha_inicio   || null,
        fecha_fin:          form.fecha_fin       || null,
        empresa_id:         form.empresa_ids.length > 0 ? form.empresa_ids : null,
        beneficio_image_url: finalImageUrl,
      };

      if (mode === "crear") {
        const { data, error } = await supabase
          .from("beneficios")
          .insert({ ...payload, creado_por: createdBy })
          .select("*, creado_por_user:users!creado_por(nombre_completo)")
          .single();

        if (error || !data) throw error;
        toast.success(t("creadoOk"));
        onSaved(data as BeneficioRow, true);
      } else {
        const { data, error } = await supabase
          .from("beneficios")
          .update(payload)
          .eq("id", beneficio!.id)
          .select("*, creado_por_user:users!creado_por(nombre_completo)")
          .single();

        if (error || !data) throw error;
        toast.success(t("editadoOk"));
        onSaved(data as BeneficioRow, false);
      }
    } catch {
      toast.error(t("errorGuardar"));
    } finally {
      setSaving(false);
    }
  };

  // ── Empresa checkbox toggle ────────────────────────────────────────────────
  const toggleEmpresa = (id: string) => {
    setForm((prev) => ({
      ...prev,
      empresa_ids: prev.empresa_ids.includes(id)
        ? prev.empresa_ids.filter((e) => e !== id)
        : [...prev.empresa_ids, id],
    }));
  };

  // ── Image preview URL ─────────────────────────────────────────────────────
  const previewUrl = imageFile ? URL.createObjectURL(imageFile) : null;
  const showExisting = mode === "editar" && !!beneficio?.beneficio_image_url && !removeExisting && !imageFile;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !saving) onClose(); }}>
      <DialogContent
        showCloseButton={!saving}
        className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <DialogTitle className="text-lg font-poppins font-bold text-gray-900">
            {mode === "crear" ? t("tituloCrear") : t("tituloEditar")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* ── Left column ── */}
              <div className="space-y-4">
                {/* Título */}
                <FormField label={t("fieldTitulo")} error={errors.titulo}>
                  <input
                    type="text"
                    maxLength={200}
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    placeholder={t("fieldTitulo")}
                    className={cn(inputCls, errors.titulo && "border-red-300")}
                  />
                </FormField>

                {/* Descripción */}
                <FormField label={t("fieldDescripcion")}>
                  <div className="relative">
                    <textarea
                      maxLength={1000}
                      value={form.descripcion}
                      onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                      rows={4}
                      className={cn(inputCls, "resize-none pr-14")}
                    />
                    <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 font-roboto">
                      {form.descripcion.length}/1000
                    </span>
                  </div>
                </FormField>

                {/* Tipo + Estado */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t("fieldTipo")}>
                    <select
                      value={form.tipo_beneficio}
                      onChange={(e) => setForm({ ...form, tipo_beneficio: e.target.value as "descuento" | "promocion" })}
                      className={inputCls}
                    >
                      <option value="descuento">{t("tipoDescuento")}</option>
                      <option value="promocion">{t("tipoPromocion")}</option>
                    </select>
                  </FormField>

                  <FormField label={t("fieldEstado")}>
                    <select
                      value={form.estado_beneficio}
                      onChange={(e) => setForm({ ...form, estado_beneficio: e.target.value as "activa" | "expirada" })}
                      className={inputCls}
                    >
                      <option value="activa">{t("estadoActiva")}</option>
                      <option value="expirada">{t("estadoExpirada")}</option>
                    </select>
                  </FormField>
                </div>

                {/* Fechas */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t("fieldFechaInicio")}>
                    <input
                      type="date"
                      value={form.fecha_inicio}
                      onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label={t("fieldFechaFin")} error={errors.fecha_fin}>
                    <input
                      type="date"
                      value={form.fecha_fin}
                      min={form.fecha_inicio || undefined}
                      onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                      className={cn(inputCls, errors.fecha_fin && "border-red-300")}
                    />
                  </FormField>
                </div>
              </div>

              {/* ── Right column ── */}
              <div className="space-y-4">
                {/* Empresas multi-select */}
                <FormField label={t("fieldEmpresas")}>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                      {empresas.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400 font-roboto">{t("sinEmpresas")}</p>
                      ) : (
                        empresas.map((emp) => (
                          <label
                            key={emp.id}
                            className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={form.empresa_ids.includes(emp.id)}
                              onChange={() => toggleEmpresa(emp.id)}
                              className="w-3.5 h-3.5 rounded accent-secondary"
                            />
                            <span className="text-sm font-roboto text-gray-700 truncate">{emp.nombre}</span>
                          </label>
                        ))
                      )}
                    </div>
                    <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100">
                      <p className="text-[10px] text-gray-400 font-roboto">
                        {form.empresa_ids.length === 0 ? t("empresasGlobal") : t("empresasSeleccionadas", { count: form.empresa_ids.length })}
                      </p>
                    </div>
                  </div>
                </FormField>

                {/* Imagen */}
                <FormField label={t("fieldImagen")}>
                  {/* Preview of new file */}
                  {previewUrl && (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="preview"
                        className="w-full h-28 object-cover rounded-xl border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Existing image (edit mode) */}
                  {showExisting && beneficio?.beneficio_image_url && (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={beneficio.beneficio_image_url}
                        alt={t("imagenActual")}
                        className="w-full h-28 object-cover rounded-xl border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveExisting}
                        className="absolute top-1.5 right-1.5 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/50 text-white text-[10px] font-semibold hover:bg-black/70 transition-colors"
                      >
                        <X className="w-3 h-3" />
                        {t("eliminarImagen")}
                      </button>
                    </div>
                  )}

                  {/* File input — hidden when previewing */}
                  {!previewUrl && !showExisting && (
                    <label className="flex flex-col items-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-secondary/40 hover:bg-secondary/5 transition-colors">
                      {removeExisting ? (
                        <>
                          <ImageIcon className="w-8 h-8 text-gray-300" />
                          <span className="text-xs text-gray-400 font-roboto">{t("imagenEliminada")}</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-gray-300" />
                          <span className="text-xs text-gray-500 font-roboto text-center">
                            {t("subirImagen")}
                            <span className="block text-[10px] text-gray-400 mt-0.5">{t("subirImagenHint")}</span>
                          </span>
                        </>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </label>
                  )}
                  {removeExisting && (
                    <button
                      type="button"
                      onClick={() => setRemoveExisting(false)}
                      className="text-xs text-secondary underline font-roboto mt-0.5 self-start"
                    >
                      {t("deshacer")}
                    </button>
                  )}
                </FormField>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0 bg-gray-50/60">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-roboto font-medium
                         text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {t("cancelarBtn")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-white
                         text-sm font-roboto font-semibold hover:bg-secondary/90
                         disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? t("guardando") : t("guardarBtn")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
