"use client";

/**
 * EmpresaAjustes — Company Settings for empresa admin (Step 6.5).
 *
 * Receives initial empresa data from the Server Component (no client waterfall).
 *
 * Editable fields:
 *   - nombre          (max 120 chars, required)
 *   - codigo_empresa  (max 32 chars, min 4, required)
 *                     → Copy button (clipboard + 1.8 s "Copiado" feedback)
 *                     → Regenerar button (Dialog confirmation → random 8-char code)
 *   - notas           (textarea, max 1000 chars, live character counter)
 *
 * Dirty-state tracking: "Descartar cambios" visible only when form is dirty.
 * Save: supabase.from('empresas').update({...}).eq('id', empresaId)
 *       RLS empresas_empresa_admin_update allows (empresa_id = get_auth_empresa()).
 */

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Building2,
  Copy,
  Check,
  RefreshCcw,
  Save,
  Undo2,
  AlertTriangle,
  Loader2,
  Hash,
  FileText,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmpresaData = {
  id:              string;
  nombre:          string;
  codigo_empresa:  string;
  notas:           string | null;
  created_at:      string;
};

interface Props {
  empresa: EmpresaData;
}

// ── Character set for random code generation (no ambiguous chars) ─────────────
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(length = 8): string {
  return Array.from({ length }, () =>
    CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
  ).join("");
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon:      React.ElementType;
  title:     string;
  subtitle?: string;
  children:  React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-50">
        <div className="mt-0.5 p-1.5 rounded-lg bg-secondary/5">
          <Icon className="w-4 h-4 text-secondary" />
        </div>
        <div>
          <h2 className="font-poppins font-semibold text-sm text-gray-900">{title}</h2>
          {subtitle && (
            <p className="text-xs font-roboto text-neutral/60 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Read-only field ───────────────────────────────────────────────────────────

function ReadField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className={cn(
        "text-sm font-roboto text-gray-700",
        mono && "font-mono text-xs tracking-wider bg-gray-50 px-2 py-1 rounded-lg inline-block",
      )}>
        {value}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmpresaAjustes({ empresa }: Props) {
  const t = useTranslations("Dashboard.empresa.ajustesEmpresa");

  // ── Form state ───────────────────────────────────────────────────────────
  const [nombre,   setNombre]   = useState(empresa.nombre);
  const [codigo,   setCodigo]   = useState(empresa.codigo_empresa);
  const [notas,    setNotas]    = useState(empresa.notas ?? "");
  const [saving,   setSaving]   = useState(false);

  // Copy button feedback state
  const [copied,   setCopied]   = useState(false);

  // Regenerar confirmation dialog
  const [regenOpen, setRegenOpen] = useState(false);

  // ── Dirty-state detection ─────────────────────────────────────────────────
  const isDirty = useMemo(
    () =>
      nombre.trim()  !== empresa.nombre ||
      codigo.trim()  !== empresa.codigo_empresa ||
      notas.trim()   !== (empresa.notas ?? ""),
    [nombre, codigo, notas, empresa],
  );

  // ── Validation ────────────────────────────────────────────────────────────
  const nombreError  = nombre.trim().length  === 0;
  const codigoError  = codigo.trim().length   < 4;
  const canSave      = isDirty && !nombreError && !codigoError && !saving;

  // ── Discard changes ───────────────────────────────────────────────────────
  function handleDiscard() {
    setNombre(empresa.nombre);
    setCodigo(empresa.codigo_empresa);
    setNotas(empresa.notas ?? "");
  }

  // ── Copy codigo to clipboard ──────────────────────────────────────────────
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("errorCopiar"));
    }
  }

  // ── Regenerar codigo (after Dialog confirmation) ──────────────────────────
  function handleConfirmRegen() {
    setCodigo(generateCode());
    setRegenOpen(false);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("empresas")
      .update({
        nombre:         nombre.trim(),
        codigo_empresa: codigo.trim().toUpperCase(),
        notas:          notas.trim() || null,
      })
      .eq("id", empresa.id);

    if (error) {
      toast.error(t("errorGuardar"));
    } else {
      toast.success(t("successGuardado"));
      // Update the baseline so isDirty resets to false
      empresa.nombre         = nombre.trim();
      empresa.codigo_empresa = codigo.trim().toUpperCase();
      empresa.notas          = notas.trim() || null;
      // Sync controlled fields after normalization
      setNombre(empresa.nombre);
      setCodigo(empresa.codigo_empresa);
      setNotas(empresa.notas ?? "");
    }

    setSaving(false);
  }

  // ── Derived display values ────────────────────────────────────────────────
  const idShort = `${empresa.id.slice(0, 10)}…`;
  const creadoEn = new Date(empresa.created_at).toLocaleDateString("es-NI", {
    day: "numeric", month: "long", year: "numeric",
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("titulo")}</h1>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      {/* ── 1. Información general (read-only) ─────────────────────────────── */}
      <Section icon={Building2} title={t("sectionInfo")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <ReadField label={t("fieldId")}       value={idShort}  mono />
          <ReadField label={t("fieldCreadoEn")} value={creadoEn} />
        </div>
      </Section>

      {/* ── 2. Nombre de la empresa ─────────────────────────────────────────── */}
      <Section icon={Building2} title={t("sectionNombre")}>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            {t("fieldNombre")}
          </label>
          <input
            type="text"
            value={nombre}
            maxLength={120}
            onChange={(e) => setNombre(e.target.value)}
            className={cn(
              "w-full px-3 py-2.5 rounded-xl border text-sm font-roboto text-gray-800",
              "focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition",
              nombreError && nombre.length > 0
                ? "border-red-300"
                : "border-gray-200",
            )}
          />
          {nombreError && nombre.length === 0 && (
            <p className="text-xs font-roboto text-red-500">{t("validacionNombreRequerido")}</p>
          )}
          <p className="text-[11px] font-roboto text-neutral/50 text-right">
            {nombre.length} / 120
          </p>
        </div>
      </Section>

      {/* ── 3. Código de membresía ──────────────────────────────────────────── */}
      <Section
        icon={Hash}
        title={t("sectionCodigo")}
        subtitle={t("sectionCodigoSubtitle")}
      >
        <div className="space-y-3">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            {t("fieldCodigo")}
          </label>

          {/* Code display + copy + regenerar */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={codigo}
              maxLength={32}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              className={cn(
                "flex-1 px-3 py-2.5 rounded-xl border text-sm font-mono tracking-widest text-gray-800",
                "focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition uppercase",
                codigoError && codigo.trim().length > 0
                  ? "border-red-300"
                  : "border-gray-200",
              )}
            />

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold font-roboto transition-colors whitespace-nowrap",
                copied
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100",
              )}
            >
              {copied
                ? <Check className="w-3.5 h-3.5" />
                : <Copy className="w-3.5 h-3.5" />
              }
              {copied ? t("copiadoBtn") : t("copiarBtn")}
            </button>

            {/* Regenerar button */}
            <button
              type="button"
              onClick={() => setRegenOpen(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-amber-200
                         bg-amber-50 text-amber-700 text-xs font-semibold font-roboto
                         hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              {t("regenerarBtn")}
            </button>
          </div>

          {codigoError && codigo.trim().length > 0 && (
            <p className="text-xs font-roboto text-red-500">{t("validacionCodigoRequerido")}</p>
          )}
          {codigo.trim().length === 0 && (
            <p className="text-xs font-roboto text-red-500">{t("validacionCodigoRequerido")}</p>
          )}

          {/* Info note */}
          <div className="flex items-start gap-1.5 text-[11px] font-roboto text-neutral/60">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{t("codigoNote")}</span>
          </div>
        </div>
      </Section>

      {/* ── 4. Notas internas ──────────────────────────────────────────────── */}
      <Section icon={FileText} title={t("sectionNotas")} subtitle={t("sectionNotasSubtitle")}>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            {t("fieldNotas")}
          </label>
          <textarea
            value={notas}
            maxLength={1000}
            rows={5}
            onChange={(e) => setNotas(e.target.value)}
            placeholder={t("notasPlaceholder")}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-roboto text-gray-800
                       placeholder:text-gray-400 resize-none
                       focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition"
          />
          <p className={cn(
            "text-[11px] font-roboto text-right",
            notas.length > 950 ? "text-amber-600" : "text-neutral/50",
          )}>
            {t("charCount", { count: notas.length })}
          </p>
        </div>
      </Section>

      {/* ── Action bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 pb-8">
        {/* Descartar — only visible when dirty */}
        {isDirty && (
          <button
            type="button"
            onClick={handleDiscard}
            disabled={saving}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
                       border border-gray-200 text-sm font-semibold font-roboto text-gray-600
                       hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Undo2 className="w-4 h-4" />
            {t("descartarBtn")}
          </button>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
                     bg-secondary text-white text-sm font-semibold font-roboto
                     hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Save className="w-4 h-4" />
          }
          {saving ? t("guardandoBtn") : t("guardarBtn")}
        </button>
      </div>

      {/* ── Regenerar confirmation Dialog ────────────────────────────────────── */}
      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-sm bg-white rounded-2xl border border-gray-100 shadow-xl p-0 gap-0 overflow-hidden"
        >
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 rounded-xl bg-amber-100">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <DialogTitle className="text-base font-poppins font-semibold text-gray-900">
                {t("confirmRegenarTitulo")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm font-roboto text-neutral leading-relaxed">
              {t("confirmRegenerarDesc")}
            </DialogDescription>
          </DialogHeader>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex-row gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() => setRegenOpen(false)}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-gray-200
                         text-sm font-semibold font-roboto text-gray-600
                         hover:bg-white transition-colors"
            >
              {t("confirmRegenerarCancelar")}
            </button>
            <button
              type="button"
              onClick={handleConfirmRegen}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                         bg-amber-500 text-white text-sm font-semibold font-roboto
                         hover:bg-amber-600 transition-colors"
            >
              <RefreshCcw className="w-4 h-4" />
              {t("confirmRegenerarAceptar")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
