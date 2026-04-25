"use client";

/**
 * EditarUsuarioModal — Sheet panel for editing an empresa user (Step 6.4).
 *
 * Editable fields: nombre_completo, telefono, email (public.users mirror),
 *                  documento_identidad, estado (activo ↔ inactivo toggle).
 *
 * Save: supabase.from('users').update({...}).eq('id', userId)
 *       RLS users_empresa_admin_update enforces empresa_id = get_auth_empresa().
 *
 * Note: empresa admin cannot update auth.users.email (requires Admin SDK).
 *       Only public.users.email mirror is updated — tooltip informs the user.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Loader2,
  User,
  Mail,
  Phone,
  FileText,
  Info,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import type { UsuarioEmpresa } from "./EmpresaUsuarios";

// ── Read-only field ───────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      <span className="text-sm font-roboto text-gray-700">{value ?? "—"}</span>
    </div>
  );
}

// ── Editable input field ──────────────────────────────────────────────────────

function InputField({
  label,
  value,
  onChange,
  type = "text",
  icon: Icon,
  note,
}: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
  type?:    string;
  icon:     React.ElementType;
  note?:    string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm font-roboto text-gray-800
                     focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition"
        />
      </div>
      {note && (
        <div className="flex items-start gap-1.5 text-[11px] font-roboto text-neutral/60">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{note}</span>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open:    boolean;
  user:    UsuarioEmpresa | null;
  onClose: () => void;
  onSaved: (updated: UsuarioEmpresa) => void;
}

// Estado badge for the header display
const ESTADO_BADGE: Record<string, { cls: string; i18n: string }> = {
  activo:    { cls: "bg-emerald-100 text-emerald-700", i18n: "estadoActivo" },
  inactivo:  { cls: "bg-red-100 text-red-600",        i18n: "estadoInactivo" },
  pendiente: { cls: "bg-amber-100 text-amber-700",    i18n: "estadoPendiente" },
};

const ROL_BADGE: Record<string, string> = {
  empresa_admin: "bg-orange-100 text-orange-700",
  miembro:       "bg-gray-100 text-gray-600",
};

function initials(name: string | null) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

export default function EditarUsuarioModal({ open, user, onClose, onSaved }: Props) {
  const t = useTranslations("Dashboard.empresa.gestionarUsuarios");

  // ── Form state (synced from user prop when it changes) ───────────────────
  const [nombre,    setNombre]    = useState("");
  const [telefono,  setTelefono]  = useState("");
  const [email,     setEmail]     = useState("");
  const [documento, setDocumento] = useState("");
  const [estado,    setEstado]    = useState<"activo" | "inactivo">("activo");
  const [saving,    setSaving]    = useState(false);

  // Sync form when a different user is selected
  useEffect(() => {
    if (!user) return;
    setNombre(user.nombre_completo ?? "");
    setTelefono(user.telefono ?? "");
    setEmail(user.email ?? "");
    setDocumento(user.documento_identidad ?? "");
    // If user is pendiente, default toggle shows inactivo (cannot set pendiente via toggle)
    setEstado(user.estado === "activo" ? "activo" : "inactivo");
  }, [user]);

  if (!user) return null;

  const estadoCfg = ESTADO_BADGE[user.estado] ?? ESTADO_BADGE.inactivo;
  const rolCls    = ROL_BADGE[user.rol] ?? ROL_BADGE.miembro;

  // ── Save handler ─────────────────────────────────────────────────────────
  async function handleSave() {
    // Capture current user ref to avoid stale-closure null issues in async context
    const currentUser = user;
    if (!currentUser) return;

    setSaving(true);
    const supabase = createClient();

    const patch = {
      nombre_completo:     nombre.trim() || null,
      telefono:            telefono.trim() || null,
      email:               email.trim() || null,
      documento_identidad: documento.trim() || null,
      estado,
    };

    const { error } = await supabase
      .from("users")
      .update(patch)
      .eq("id", currentUser.id);

    if (error) {
      toast.error(t("errorActualizar"));
    } else {
      toast.success(t("successActualizado"));
      // Build updated object for optimistic UI
      const updated: UsuarioEmpresa = {
        id:          currentUser.id,
        rol:         currentUser.rol,
        tipo_cuenta: currentUser.tipo_cuenta,
        created_at:  currentUser.created_at,
        ...patch,
      };
      onSaved(updated);
    }

    setSaving(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-white flex flex-col"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="shrink-0 w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-secondary">
                {initials(user.nombre_completo)}
              </span>
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base font-poppins font-semibold text-gray-900 truncate">
                {user.nombre_completo ?? t("sinNombre")}
              </SheetTitle>
              <p className="text-xs font-roboto text-neutral/60 truncate">{user.email ?? "—"}</p>
            </div>
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full", rolCls)}>
              {t(user.rol === "empresa_admin" ? "rolEmpresaAdmin" : "rolMiembro")}
            </span>
            <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full", estadoCfg.cls)}>
              {t(estadoCfg.i18n as Parameters<typeof t>[0])}
            </span>
          </div>
        </SheetHeader>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Read-only info ────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h4 className="text-xs font-poppins font-semibold text-gray-500 uppercase tracking-wider">
              {t("sectionInfo")}
            </h4>
            <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4">
              <ReadField
                label={t("fieldTipoCuenta")}
                value={
                  <span className={cn(
                    "inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5",
                    user.tipo_cuenta === "titular"
                      ? "bg-secondary/10 text-secondary"
                      : "bg-purple-100 text-purple-700",
                  )}>
                    {t(user.tipo_cuenta === "titular" ? "tipoCuentaTitular" : "tipoCuentaFamiliar")}
                  </span>
                }
              />
              <ReadField
                label={t("fieldMiembroDesde")}
                value={new Date(user.created_at).toLocaleDateString("es-NI", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              />
            </div>
          </section>

          {/* ── Editable fields ───────────────────────────────────────────── */}
          <section className="space-y-4">
            <h4 className="text-xs font-poppins font-semibold text-gray-500 uppercase tracking-wider">
              {t("sectionEditar")}
            </h4>

            <InputField
              label={t("fieldNombre")}
              value={nombre}
              onChange={setNombre}
              icon={User}
            />

            <InputField
              label={t("fieldTelefono")}
              value={telefono}
              onChange={setTelefono}
              type="tel"
              icon={Phone}
            />

            <InputField
              label={t("fieldEmail")}
              value={email}
              onChange={setEmail}
              type="email"
              icon={Mail}
              note={t("emailNote")}
            />

            <InputField
              label={t("fieldDocumento")}
              value={documento}
              onChange={setDocumento}
              icon={FileText}
            />

            {/* ── Estado toggle (activo ↔ inactivo) ────────────────────── */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {t("fieldEstado")}
              </label>
              {/* Pill toggle */}
              <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
                <button
                  type="button"
                  onClick={() => setEstado("activo")}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold font-roboto transition-colors",
                    estado === "activo"
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50",
                  )}
                >
                  {t("estadoToggleActivo")}
                </button>
                <button
                  type="button"
                  onClick={() => setEstado("inactivo")}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold font-roboto transition-colors border-l border-gray-200",
                    estado === "inactivo"
                      ? "bg-red-500 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50",
                  )}
                >
                  {t("estadoToggleInactivo")}
                </button>
              </div>
              {/* Warning when estado was pendiente — inform admin */}
              {user.estado === "pendiente" && (
                <div className="flex items-start gap-1.5 text-[11px] font-roboto text-amber-700 bg-amber-50 px-3 py-2 rounded-xl">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{t("estadoPendienteNote")}</span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold font-roboto
                       text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {t("cancelarBtn")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !nombre.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-secondary text-white text-sm font-semibold font-roboto
                       hover:bg-secondary/90 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? t("guardandoBtn") : t("guardarBtn")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
