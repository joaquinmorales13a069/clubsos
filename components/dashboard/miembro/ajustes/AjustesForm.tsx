"use client";

/**
 * AjustesForm — Profile & Settings client component.
 *
 * Sections:
 *  1. Información de Cuenta  — read-only (rol, tipo_cuenta, fecha_nacimiento, username)
 *  2. Datos Personales       — editable (nombre_completo, documento_identidad)
 *  3. Correo Electrónico     — supabase.auth.updateUser({ email })
 *  4. Teléfono               — WhatsApp OTP flow via supabase.auth.updateUser({ phone })
 *                              States: idle → ingresando → enviando_otp → verificando → confirmando
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import PhoneInput, { isPossiblePhoneNumber } from "react-phone-number-input";
import { updateEmailAction } from "@/app/[locale]/(dashboard)/dashboard/ajustes/actions";
import "react-phone-number-input/style.css";
import { toast } from "sonner";
import {
  User,
  FileText,
  Mail,
  Phone,
  Shield,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export type AjustesProfile = {
  id:                  string;
  nombre_completo:     string | null;
  documento_identidad: string | null;
  rol:                 string;
  tipo_cuenta:         string;
  fecha_nacimiento:    string | null;
  username:            string | null;
  telefono:            string | null;
  email:               string | null; // from auth.users
};

interface AjustesFormProps {
  profile: AjustesProfile;
}

// ── Phone OTP state machine ────────────────────────────────────────────────

type PhoneState = "idle" | "ingresando" | "enviando_otp" | "verificando" | "confirmando" | "success";

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es-NI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const ROL_BADGE: Record<string, string> = {
  admin:         "bg-primary/10 text-primary",
  empresa_admin: "bg-secondary/10 text-secondary",
  miembro:       "bg-gray-100 text-gray-600",
};

const TIPO_BADGE: Record<string, string> = {
  titular:  "bg-green-100 text-green-700",
  familiar: "bg-amber-100 text-amber-700",
};

// ── Section wrapper ───────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
        <Icon className="w-4 h-4 text-secondary" />
        <h2 className="font-poppins font-semibold text-sm text-gray-900">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Read-only field ───────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-roboto text-neutral/70 uppercase tracking-wide">{label}</p>
      <div className="text-sm font-roboto text-gray-800">{value ?? "—"}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function AjustesForm({ profile }: AjustesFormProps) {
  const t = useTranslations("Dashboard.miembro.ajustes");

  // ── Section 2: Datos personales ──────────────────────────────────────
  const [nombre,    setNombre]    = useState(profile.nombre_completo ?? "");
  const [documento, setDocumento] = useState(profile.documento_identidad ?? "");
  const [savingPersonal, setSavingPersonal] = useState(false);

  async function handleSavePersonal() {
    setSavingPersonal(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ nombre_completo: nombre.trim(), documento_identidad: documento.replace(/-/g, "").trim() })
      .eq("id", profile.id);

    error
      ? toast.error(t("errorGeneric"))
      : toast.success(t("savedSuccess"));
    setSavingPersonal(false);
  }

  // ── Section 3: Email ─────────────────────────────────────────────────
  const [email,       setEmail]       = useState(profile.email ?? "");
  const [savingEmail, setSavingEmail] = useState(false);

  async function handleSaveEmail() {
    setSavingEmail(true);
    const result = await updateEmailAction(email.trim());
    "error" in result
      ? toast.error(result.error)
      : toast.info(t("emailConfirmSent"));
    setSavingEmail(false);
  }

  // ── Section 4: Phone OTP ─────────────────────────────────────────────
  const [phoneState,   setPhoneState]   = useState<PhoneState>("idle");
  const [newPhone,     setNewPhone]     = useState<string | undefined>(undefined);
  const [otpCode,      setOtpCode]      = useState("");
  const [currentPhone, setCurrentPhone] = useState(profile.telefono ?? "");

  async function handleSendOtp() {
    if (!newPhone || !isPossiblePhoneNumber(newPhone)) return;
    setPhoneState("enviando_otp");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ phone: newPhone });
    if (error) {
      toast.error(t("errorGeneric"));
      setPhoneState("ingresando");
    } else {
      setPhoneState("verificando");
    }
  }

  async function handleVerifyOtp() {
    if (!newPhone) return;
    setPhoneState("confirmando");
    const supabase = createClient();

    // 1. Verify OTP via Supabase Auth
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: newPhone,
      token: otpCode.trim(),
      type:  "phone_change",
    });

    if (verifyError) {
      toast.error(t("otpInvalid"));
      setPhoneState("verificando");
      return;
    }

    // 2. Sync public.users.telefono
    await supabase
      .from("users")
      .update({ telefono: newPhone })
      .eq("id", profile.id);

    setCurrentPhone(newPhone);
    setPhoneState("success");
    toast.success(t("phoneUpdated"));
  }

  function resetPhoneFlow() {
    setPhoneState("idle");
    setNewPhone(undefined);
    setOtpCode("");
  }

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-poppins font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm font-roboto text-neutral mt-0.5">{t("subtitle")}</p>
      </div>

      {/* ── 1. Información de Cuenta (read-only) ── */}
      <Section icon={Shield} title={t("sectionAccount")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <ReadField
            label={t("fieldRol")}
            value={
              <span className={cn("inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold", ROL_BADGE[profile.rol] ?? ROL_BADGE.miembro)}>
                {t(`rol.${profile.rol}` as Parameters<typeof t>[0])}
              </span>
            }
          />
          <ReadField
            label={t("fieldTipoCuenta")}
            value={
              <span className={cn("inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold", TIPO_BADGE[profile.tipo_cuenta] ?? TIPO_BADGE.familiar)}>
                {t(`tipoCuenta.${profile.tipo_cuenta}` as Parameters<typeof t>[0])}
              </span>
            }
          />
          <ReadField label={t("fieldUsername")}       value={profile.username ?? "—"} />
          <ReadField label={t("fieldFechaNacimiento")} value={formatDate(profile.fecha_nacimiento)} />
        </div>
      </Section>

      {/* ── 2. Datos Personales (editable) ── */}
      <Section icon={User} title={t("sectionPersonal")}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-roboto text-neutral/70 uppercase tracking-wide">
              {t("fieldNombre")}
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-roboto text-gray-800
                         focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-roboto text-neutral/70 uppercase tracking-wide">
              {t("fieldDocumento")}
            </label>
            <input
              type="text"
              value={documento}
              onChange={(e) => setDocumento(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-roboto text-gray-800
                         focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition"
            />
          </div>

          <button
            type="button"
            onClick={handleSavePersonal}
            disabled={savingPersonal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold
                       font-roboto hover:bg-secondary/90 disabled:opacity-50 transition-colors"
          >
            {savingPersonal ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("saveBtn")}
          </button>
        </div>
      </Section>

      {/* ── 3. Correo Electrónico ── */}
      <Section icon={Mail} title={t("sectionEmail")}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-roboto text-neutral/70 uppercase tracking-wide">
              {t("fieldEmail")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-roboto text-gray-800
                         focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition"
            />
          </div>

          <button
            type="button"
            onClick={handleSaveEmail}
            disabled={savingEmail || !email.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold
                       font-roboto hover:bg-secondary/90 disabled:opacity-50 transition-colors"
          >
            {savingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("saveBtn")}
          </button>
        </div>
      </Section>

      {/* ── 4. Teléfono (WhatsApp OTP) ── */}
      <Section icon={Phone} title={t("sectionPhone")}>
        <div className="space-y-4">

          {/* idle / success — show current phone */}
          {(phoneState === "idle" || phoneState === "success") && (
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-roboto text-neutral/70 uppercase tracking-wide">{t("fieldPhoneCurrent")}</p>
                <p className="text-sm font-roboto text-gray-800 font-medium">{currentPhone || "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => setPhoneState("ingresando")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200
                           text-xs font-semibold font-roboto text-secondary hover:border-secondary/50 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                {t("changeBtn")}
              </button>
            </div>
          )}

          {/* ingresando — enter new phone */}
          {phoneState === "ingresando" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-roboto text-neutral/70 uppercase tracking-wide">
                  {t("fieldPhoneNew")}
                </label>
                <div className="border border-gray-200 bg-transparent rounded-xl focus-within:ring-2 focus-within:ring-secondary/30 focus-within:border-secondary transition-all">
                  <PhoneInput
                    international
                    defaultCountry="NI"
                    value={newPhone}
                    onChange={setNewPhone}
                    className="flex h-11 w-full px-3 py-2 text-sm [&>input]:bg-transparent [&>input]:border-none [&>input]:outline-none [&>input]:w-full [&>input]:font-roboto"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={!newPhone || !isPossiblePhoneNumber(newPhone)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold
                             font-roboto hover:bg-secondary/90 disabled:opacity-50 transition-colors"
                >
                  {t("sendOtpBtn")}
                </button>
                <button
                  type="button"
                  onClick={resetPhoneFlow}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm
                             font-roboto text-neutral hover:border-gray-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  {t("cancelBtn")}
                </button>
              </div>
            </div>
          )}

          {/* enviando_otp — loading */}
          {phoneState === "enviando_otp" && (
            <div className="flex items-center gap-2 text-sm font-roboto text-neutral py-2">
              <Loader2 className="w-4 h-4 animate-spin text-secondary" />
              {t("sendingOtp")}
            </div>
          )}

          {/* verificando — enter OTP */}
          {phoneState === "verificando" && (
            <div className="space-y-4">
              <div className="text-xs font-roboto text-neutral bg-secondary/5 px-3 py-2 rounded-xl">
                {t("otpSentTo")} <span className="font-semibold text-secondary">{newPhone ?? ""}</span>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-roboto text-neutral/70 uppercase tracking-wide">
                  {t("fieldOtp")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-roboto text-gray-800
                             tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-secondary/30
                             focus:border-secondary transition"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={otpCode.length < 6}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold
                             font-roboto hover:bg-secondary/90 disabled:opacity-50 transition-colors"
                >
                  {t("verifyBtn")}
                </button>
                <button
                  type="button"
                  onClick={resetPhoneFlow}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm
                             font-roboto text-neutral hover:border-gray-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  {t("cancelBtn")}
                </button>
              </div>
            </div>
          )}

          {/* confirmando — verifying OTP */}
          {phoneState === "confirmando" && (
            <div className="flex items-center gap-2 text-sm font-roboto text-neutral py-2">
              <Loader2 className="w-4 h-4 animate-spin text-secondary" />
              {t("verifyingOtp")}
            </div>
          )}
        </div>
      </Section>

      {/* ── Read-only note ── */}
      <div className="flex items-start gap-2 text-xs font-roboto text-neutral/60 px-1">
        <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{t("readOnlyNote")}</span>
      </div>
    </div>
  );
}
