/**
 * CredentialCard — Digital member card styled like a credit card.
 * Displays member name, company, DOB, sex, status, and truncated member ID.
 * Server Component — no interactivity needed.
 */

import { getTranslations } from "next-intl/server";
import { Shield } from "lucide-react";

interface CredentialCardProps {
  id: string;
  nombreCompleto: string;
  empresaNombre: string | null;
  estado: "activo" | "inactivo" | "pendiente";
  sexo: "masculino" | "femenino" | null;
  fechaNacimiento: string | null;
}

/** Format DATE string "YYYY-MM-DD" → "DD/MM/YYYY" */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

/** Show last 8 chars of UUID as membership number */
function formatMemberId(id: string): string {
  return id.slice(-8).toUpperCase();
}

const ESTADO_BADGE: Record<string, string> = {
  activo:    "bg-green-500/25 text-green-100 border border-green-400/30",
  inactivo:  "bg-red-500/25 text-red-100 border border-red-400/30",
  pendiente: "bg-yellow-400/25 text-yellow-100 border border-yellow-400/30",
};

export default async function CredentialCard({
  id,
  nombreCompleto,
  empresaNombre,
  estado,
  sexo,
  fechaNacimiento,
}: CredentialCardProps) {
  const t = await getTranslations("Dashboard.miembro.inicio.credential");

  const estadoLabel = {
    activo:    t("statusActive"),
    inactivo:  t("statusInactive"),
    pendiente: t("statusPending"),
  }[estado] ?? estado;

  const sexoLabel = sexo === "masculino" ? "M" : sexo === "femenino" ? "F" : "—";

  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl p-5 sm:p-6 text-white shadow-lg",
        "bg-gradient-to-br from-primary via-[#A41B22] to-secondary",
        "min-h-[176px] w-full md:max-w-[480px]",
      ].join(" ")}
    >
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 w-64 h-64 rounded-full bg-white/5" />

      {/* Top row: chip + status */}
      <div className="relative flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs font-poppins font-semibold tracking-wide opacity-90">
            Club SOS Medical
          </span>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ESTADO_BADGE[estado]}`}>
          {estadoLabel}
        </span>
      </div>

      {/* Member name + company */}
      <div className="relative mb-4">
        <p className="text-[10px] uppercase tracking-widest opacity-60 font-roboto mb-0.5">
          {t("title")}
        </p>
        <p className="text-xl font-poppins font-bold leading-tight truncate">
          {nombreCompleto}
        </p>
        {empresaNombre && (
          <p className="text-sm opacity-75 font-roboto mt-0.5 truncate">{empresaNombre}</p>
        )}
      </div>

      {/* Bottom row: DOB, sex, member ID */}
      <div className="relative flex items-end justify-between pt-3 border-t border-white/20">
        <div className="flex gap-5">
          <div>
            <p className="text-[10px] uppercase tracking-wider opacity-60 font-roboto">{t("dob")}</p>
            <p className="text-sm font-roboto font-semibold">{formatDate(fechaNacimiento)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider opacity-60 font-roboto">Sexo</p>
            <p className="text-sm font-roboto font-semibold">{sexoLabel}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider opacity-60 font-roboto">{t("memberId")}</p>
          <p className="text-sm font-mono font-bold tracking-[0.2em]">
            {id ? formatMemberId(id) : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
