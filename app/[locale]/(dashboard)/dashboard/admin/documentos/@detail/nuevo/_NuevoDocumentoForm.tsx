"use client";

/**
 * NuevoDocumentoForm — Upload medical document for any patient.
 *
 * Upload path: {usuario_id}/{crypto.randomUUID()}.{ext}
 * After successful upload → calls POST /api/admin/documentos/notificar (non-blocking)
 */

import { useState, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  Upload,
  X,
  User,
  FileText,
  Building2,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type MiembroResult = {
  id:                  string;
  nombre_completo:     string | null;
  documento_identidad: string | null;
  telefono:            string | null;
  tipo_cuenta:         string;
  empresa:             { nombre: string } | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCKET = "documentos-medicos";

const TIPO_DOCUMENTO_OPTIONS = [
  "laboratorio",
  "radiologia",
  "consulta_medica",
  "especialidades",
  "receta",
  "otro",
] as const;

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 " +
  "placeholder:text-gray-400 focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors disabled:opacity-50";

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  uploadedBy: string;
  locale: string;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold font-roboto text-gray-700 uppercase tracking-wide">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 font-roboto">{error}</p>}
    </div>
  );
}

export default function NuevoDocumentoForm({ uploadedBy, locale }: Props) {
  const t = useTranslations("Dashboard.admin.documentos.form");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── Patient search ─────────────────────────────────────────────────────────
  const [searchNombre,  setSearchNombre]  = useState("");
  const [searchCedula,  setSearchCedula]  = useState("");
  const [searching,     setSearching]     = useState(false);
  const [searchResults, setSearchResults] = useState<MiembroResult[]>([]);
  const [searchDone,    setSearchDone]    = useState(false);
  const [selectedUser,  setSelectedUser]  = useState<MiembroResult | null>(null);

  // ── Document fields ────────────────────────────────────────────────────────
  const [nombreDoc,    setNombreDoc]    = useState("");
  const [tipoDoc,      setTipoDoc]      = useState<string>("laboratorio");
  const [fechaDoc,     setFechaDoc]     = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // ── Validation ─────────────────────────────────────────────────────────────
  const [errors, setErrors] = useState<{ nombre?: string; paciente?: string; archivo?: string }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Patient search ────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchNombre.trim() && !searchCedula.trim()) return;
    setSearching(true);
    setSearchDone(false);
    setSearchResults([]);

    const supabase = createClient();
    let query = supabase
      .from("users")
      .select("id, nombre_completo, documento_identidad, telefono, tipo_cuenta, empresa:empresas!empresa_id(nombre)")
      .in("rol", ["miembro", "empresa_admin"])
      .limit(10);

    if (searchNombre.trim()) query = query.ilike("nombre_completo", `%${searchNombre.trim()}%`);
    if (searchCedula.trim()) query = query.eq("documento_identidad", searchCedula.trim());

    const { data } = await query;
    setSearchResults((data ?? []) as unknown as MiembroResult[]);
    setSearchDone(true);
    setSearching(false);
  };

  const selectUser = (u: MiembroResult) => {
    setSelectedUser(u);
    setSearchResults([]);
    setErrors((prev) => ({ ...prev, paciente: undefined }));
  };

  // ── File input ────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file) setErrors((prev) => ({ ...prev, archivo: undefined }));
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Validate ───────────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: typeof errors = {};
    if (!nombreDoc.trim()) errs.nombre = t("validNombreReq");
    if (!selectedUser)     errs.paciente = t("validPacienteReq");
    if (!selectedFile)     errs.archivo = t("validArchivoReq");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    startTransition(async () => {
      if (!selectedUser || !selectedFile) return;
      const supabase = createClient();

      // 1. Build storage path
      const ext      = selectedFile.name.split(".").pop() ?? "bin";
      const filePath = `${selectedUser.id}/${crypto.randomUUID()}.${ext}`;

      // 2. Upload to storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, selectedFile, { contentType: selectedFile.type });

      if (uploadError) {
        toast.error(t("errorSubida"));
        return;
      }

      // 3. Insert DB record
      const { data: insertedDoc, error: insertError } = await supabase
        .from("documentos_medicos")
        .insert({
          usuario_id:       selectedUser.id,
          nombre_documento: nombreDoc.trim(),
          tipo_documento:   tipoDoc,
          file_path:        filePath,
          tipo_archivo:     selectedFile.type,
          fecha_documento:  fechaDoc,
          subido_por:       uploadedBy,
          estado_archivo:   "activo",
        })
        .select("id")
        .single();

      if (insertError || !insertedDoc) {
        // Rollback storage upload
        await supabase.storage.from(BUCKET).remove([filePath]);
        toast.error(t("errorGuardar"));
        return;
      }

      // 4. Trigger WhatsApp/email notification (non-blocking)
      fetch("/api/admin/documentos/notificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentoId: insertedDoc.id }),
      }).catch(() => {
        // Notification failure is non-critical
      });

      toast.success(t("exitoCrear"));
      router.push(`/${locale}/dashboard/admin/documentos/${insertedDoc.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ── Patient search ── */}
      <div className="space-y-3">
        <h3 className="text-xs font-poppins font-semibold text-gray-500 uppercase tracking-wider">
          {t("buscarPaciente")}
        </h3>

        {errors.paciente && (
          <p className="text-xs text-red-500 font-roboto">{errors.paciente}</p>
        )}

        {selectedUser ? (
          /* Selected user card */
          <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/5 border border-secondary/20">
            <div className="shrink-0 w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-secondary" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-sm font-poppins font-semibold text-gray-900 truncate">
                {selectedUser.nombre_completo}
              </p>
              <p className="text-xs font-roboto text-neutral truncate">
                {selectedUser.documento_identidad}
              </p>
              {selectedUser.empresa && (
                <p className="text-xs font-roboto text-neutral/70 flex items-center gap-1 truncate">
                  <Building2 className="w-3 h-3 shrink-0" />
                  {selectedUser.empresa.nombre}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="shrink-0 text-xs text-secondary underline font-roboto whitespace-nowrap"
            >
              {t("cambiarPaciente")}
            </button>
          </div>
        ) : (
          /* Search form */
          <div className="space-y-2">
            <input
              type="text"
              value={searchNombre}
              onChange={(e) => setSearchNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={t("placeholderNombre")}
              className={inputCls}
            />
            <input
              type="text"
              value={searchCedula}
              onChange={(e) => setSearchCedula(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={t("placeholderCedula")}
              className={inputCls}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || (!searchNombre.trim() && !searchCedula.trim())}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary text-white text-sm font-roboto font-semibold hover:bg-secondary/90 disabled:opacity-50 transition-colors"
            >
              {searching
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Search className="w-4 h-4" />}
              {t("buscarBtn")}
            </button>

            {searchDone && searchResults.length === 0 && (
              <p className="text-xs font-roboto text-neutral text-center py-4">
                {t("sinResultados")}
              </p>
            )}
            {searchResults.length > 0 && (
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-50 max-h-52 overflow-y-auto">
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => selectUser(u)}
                    className="w-full flex items-start gap-3 px-3 py-3 hover:bg-gray-50 text-left transition-colors"
                  >
                    <div className="shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-poppins font-medium text-gray-900 truncate">
                        {u.nombre_completo}
                      </p>
                      <p className="text-xs font-roboto text-neutral truncate">
                        {u.documento_identidad} · {u.empresa?.nombre ?? "—"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Document fields ── */}
      <div className="space-y-4 border-t border-gray-100 pt-4">
        <h3 className="text-xs font-poppins font-semibold text-gray-500 uppercase tracking-wider">
          {t("fieldArchivo")}
        </h3>

        <Field label={t("fieldNombre")} error={errors.nombre}>
          <input
            type="text"
            maxLength={200}
            value={nombreDoc}
            onChange={(e) => { setNombreDoc(e.target.value); setErrors((p) => ({ ...p, nombre: undefined })); }}
            placeholder={t("fieldNombre")}
            className={cn(inputCls, errors.nombre && "border-red-300")}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("fieldTipo")}>
            <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} className={inputCls}>
              {TIPO_DOCUMENTO_OPTIONS.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {t(`tipo_${tipo}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("fieldFecha")}>
            <input
              type="date"
              value={fechaDoc}
              onChange={(e) => setFechaDoc(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label={t("fieldArchivo")} error={errors.archivo}>
          {selectedFile ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-secondary/30 bg-secondary/5">
              <FileText className="w-5 h-5 text-secondary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-roboto font-medium text-gray-800 truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs font-roboto text-neutral">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemoveFile}
                className="shrink-0 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className={cn(
              "flex flex-col items-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed cursor-pointer hover:border-secondary/40 hover:bg-secondary/5 transition-colors",
              errors.archivo ? "border-red-300" : "border-gray-200",
            )}>
              <Upload className="w-8 h-8 text-gray-300" />
              <span className="text-xs text-gray-500 font-roboto text-center">
                {t("dropzoneLabel")}
                <span className="block text-[10px] text-gray-400 mt-0.5">
                  {t("dropzoneHint")}
                </span>
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
          )}
        </Field>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-white text-sm font-roboto font-semibold hover:bg-secondary/90 disabled:opacity-50 transition-colors"
      >
        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {isPending ? t("subiendo") : t("crear")}
      </button>
    </form>
  );
}
