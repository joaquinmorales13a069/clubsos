"use client";

/**
 * PendingActivationScreen — Shown when the authenticated user's
 * `estado` is 'pendiente'. Blocks dashboard access entirely.
 *
 * - `titular`  → activated by empresa_admin or admin
 * - `familiar` → activated by their linked titular
 *
 * Provides two actions:
 *   1. "Verificar estado" — calls checkActivationStatusAction; redirects
 *      automatically on activation, or shows a toast if still pending.
 *   2. "Cerrar sesión" — delegates to LogoutButton (existing component).
 */

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clock, ShieldCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import LogoutButton from "@/components/dashboard/LogoutButton";
import { checkActivationStatusAction } from "@/app/[locale]/(dashboard)/pending-actions";

interface PendingActivationScreenProps {
  tipoCuenta: "titular" | "familiar";
}

export default function PendingActivationScreen({ tipoCuenta }: PendingActivationScreenProps) {
  const t = useTranslations("Dashboard.pendiente");
  const [isPending, startTransition] = useTransition();

  const handleVerificar = () => {
    startTransition(async () => {
      const result = await checkActivationStatusAction();
      // redirect() throws internally — if we reach here, the account is still pending
      if (result?.stillPending) {
        toast.info(t("aunPendiente"));
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-gray-100 p-8 space-y-6 text-center">

          {/* Icon */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
                <Clock className="w-10 h-10 text-amber-500" />
              </div>
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-secondary flex items-center justify-center shadow-sm">
                <ShieldCheck className="w-4 h-4 text-white" />
              </span>
            </div>
          </div>

          {/* Copy */}
          <div className="space-y-2">
            <h1 className="text-xl font-poppins font-bold text-gray-900">
              {t("titulo")}
            </h1>
            <p className="text-sm font-roboto text-neutral leading-relaxed">
              {tipoCuenta === "familiar" ? t("subtituloFamiliar") : t("subtituloTitular")}
            </p>
          </div>

          {/* Info pill */}
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-4 py-2 rounded-full">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            {t("estadoBadge")}
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-2">
            {/* Verificar estado */}
            <button
              onClick={handleVerificar}
              disabled={isPending}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl",
                "bg-secondary text-white font-semibold text-sm font-roboto",
                "hover:bg-secondary/90 transition-colors duration-200",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-4 h-4", isPending && "animate-spin")} />
              {isPending ? t("verificando") : t("verificarBtn")}
            </button>

            {/* Logout */}
            <div className="border-t border-gray-100 pt-3">
              <LogoutButton />
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs font-roboto text-gray-400">
          © {new Date().getFullYear()} SOS Medical. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
