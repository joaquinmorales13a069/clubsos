"use client";

/**
 * AvisoForm — Shared create/edit form for avisos.
 *
 * Image upload flow (preserved from AvisoFormModal):
 *  1. User selects file → client-side preview.
 *  2. On submit, uploads to beneficios-imagenes (path: avisos/...) BEFORE calling the server action.
 *  3. Passes the final public URL via formData to the action.
 *  4. On edit: if user replaced or removed the old image, deletes it from storage
 *     after the action succeeds.
 *
 * Uses useTransition (not useActionState) because we must await the upload
 * before calling the server action.
 */

import { useState, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Upload, X, ImageIcon, Search } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────────

const BUCKET = "beneficios-imagenes";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

function extractStoragePath(publicUrl: string): string {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  return idx >= 0 ? decodeURIComponent(publicUrl.slice(idx + marker.length)) : publicUrl;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AvisoFormState = { error?: string };

export interface EmpresaOption { id: string; nombre: string }

interface InitialValues {
  id?: string;
  titulo: string;
  descripcion: string;
  estado_aviso: "activa" | "expirada";
  fecha_inicio: string;
  fecha_fin: string;
  empresa_ids: string[];
  aviso_image_url: string | null;
}

interface Props {
  action: (state: AvisoFormState, formData: FormData) => Promise<AvisoFormState>;
  initial: InitialValues;
  empresas: EmpresaOption[];
  locale: string;
  mode: "editar" | "nuevo";
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 " +
  "placeholder:text-gray-400 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors disabled:opacity-50";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function AvisoForm({ action, initial, empresas, locale, mode }: Props) {
  const t = useTranslations("Dashboard.admin.avisos.form");
  const [isPending, startTransition] = useTransition();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [titulo,       setTitulo]       = useState(initial.titulo);
  const [descripcion,  setDescripcion]  = useState(initial.descripcion);
  const [estadoAviso,  setEstadoAviso]  = useState<"activa" | "expirada">(initial.estado_aviso);
  const [fechaInicio,  setFechaInicio]  = useState(initial.fecha_inicio);
  const [fechaFin,     setFechaFin]     = useState(initial.fecha_fin);
  const [empresaIds,   setEmpresaIds]   = useState<string[]>(initial.empresa_ids);
  const [empresaSearch, setEmpresaSearch] = useState("");

  // ── Image state ────────────────────────────────────────────────────────────
  const [imageFile,      setImageFile]      = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Validation errors ──────────────────────────────────────────────────────
  const [errors, setErrors] = useState<{ titulo?: string; fecha_fin?: string; imagen?: string }>({});

  // ── Image helpers ──────────────────────────────────────────────────────────
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

  // ── Empresa toggle ─────────────────────────────────────────────────────────
  const toggleEmpresa = (id: string) => {
    setEmpresaIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  };

  // ── Image preview URL ──────────────────────────────────────────────────────
  const previewUrl = imageFile ? URL.createObjectURL(imageFile) : null;
  const showExisting = mode === "editar" && !!initial.aviso_image_url && !removeExisting && !imageFile;

  // ── Validate ───────────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: typeof errors = {};
    if (!titulo.trim()) errs.titulo = t("validTituloReq");
    if (fechaInicio && fechaFin && fechaFin < fechaInicio) errs.fecha_fin = t("validFechas");
    if (imageFile && imageFile.size > MAX_SIZE_BYTES) errs.imagen = t("validImagenSize");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    startTransition(async () => {
      const supabase = createClient();
      let finalImageUrl = initial.aviso_image_url ?? null;

      // Delete existing image if marked for removal
      if (removeExisting && initial.aviso_image_url) {
        const path = extractStoragePath(initial.aviso_image_url);
        await supabase.storage.from(BUCKET).remove([path]);
        finalImageUrl = null;
      }

      // Upload new image if selected
      if (imageFile) {
        const ext = imageFile.name.split(".").pop() ?? "jpg";
        const path = `avisos/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, imageFile, { contentType: imageFile.type, upsert: false });

        if (uploadError) {
          toast.error(t("errorImagen"));
          return;
        }
        finalImageUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

        // Delete old image after successful upload (edit mode, not already removed)
        if (mode === "editar" && initial.aviso_image_url && !removeExisting) {
          const oldPath = extractStoragePath(initial.aviso_image_url);
          await supabase.storage.from(BUCKET).remove([oldPath]);
        }
      }

      // Build FormData and call server action
      const formData = new FormData();
      if (initial.id) formData.set("id", initial.id);
      formData.set("locale", locale);
      formData.set("titulo", titulo.trim());
      formData.set("descripcion", descripcion.trim());
      formData.set("estado_aviso", estadoAviso);
      formData.set("fecha_inicio", fechaInicio);
      formData.set("fecha_fin", fechaFin);
      if (finalImageUrl) {
        formData.set("aviso_image_url", finalImageUrl);
      }
      empresaIds.forEach((eid) => formData.append("empresa_ids", eid));

      const result = await action({}, formData);
      if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  const filteredEmpresas = empresas.filter((e) =>
    e.nombre.toLowerCase().includes(empresaSearch.toLowerCase()),
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Left/Right columns on larger screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Left column ── */}
        <div className="space-y-4">
          {/* Título */}
          <Field label={t("fieldTitulo")} error={errors.titulo}>
            <input
              type="text"
              maxLength={200}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={t("fieldTitulo")}
              className={cn(inputCls, errors.titulo && "border-red-300")}
            />
          </Field>

          {/* Descripción */}
          <Field label={t("fieldDescripcion")}>
            <div className="relative">
              <textarea
                maxLength={1000}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={4}
                className={cn(inputCls, "resize-none pr-14")}
              />
              <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 font-roboto">
                {descripcion.length}/1000
              </span>
            </div>
          </Field>

          {/* Estado */}
          <Field label={t("fieldEstado")}>
            <select
              value={estadoAviso}
              onChange={(e) => setEstadoAviso(e.target.value as "activa" | "expirada")}
              className={inputCls}
            >
              <option value="activa">{t("estadoActiva")}</option>
              <option value="expirada">{t("estadoExpirada")}</option>
            </select>
          </Field>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("fieldFechaInicio")}>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={t("fieldFechaFin")} error={errors.fecha_fin}>
              <input
                type="date"
                value={fechaFin}
                min={fechaInicio || undefined}
                onChange={(e) => setFechaFin(e.target.value)}
                className={cn(inputCls, errors.fecha_fin && "border-red-300")}
              />
            </Field>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">
          {/* Empresas multi-select */}
          <Field label={t("fieldEmpresas")}>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  type="text"
                  value={empresaSearch}
                  onChange={(e) => setEmpresaSearch(e.target.value)}
                  placeholder={t("buscarEmpresa")}
                  className="flex-1 text-xs font-roboto text-gray-700 bg-transparent outline-none placeholder:text-gray-400"
                />
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                {empresas.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400 font-roboto">{t("sinEmpresas")}</p>
                ) : filteredEmpresas.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400 font-roboto">{t("sinResultados")}</p>
                ) : (
                  filteredEmpresas.map((emp) => (
                    <label
                      key={emp.id}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={empresaIds.includes(emp.id)}
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
                  {empresaIds.length === 0
                    ? t("empresasGlobal")
                    : t("empresasSeleccionadas", { count: empresaIds.length })}
                </p>
              </div>
            </div>
          </Field>

          {/* Imagen */}
          <Field label={t("fieldImagen")} error={errors.imagen}>
            {/* Preview of newly selected file */}
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
            {showExisting && initial.aviso_image_url && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={initial.aviso_image_url}
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
          </Field>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-white text-sm font-roboto font-semibold hover:bg-secondary/90 disabled:opacity-50 transition-colors"
      >
        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {isPending ? t("guardando") : mode === "nuevo" ? t("crear") : t("guardar")}
      </button>
    </form>
  );
}
