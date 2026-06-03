"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

type PagoStatus = "ok" | "rechazado" | "pendiente" | "desconocido" | "error";

const STATUSES: PagoStatus[] = ["ok", "rechazado", "pendiente", "desconocido", "error"];

export default function PagoBanner() {
  const t          = useTranslations("Dashboard.miembro.citas.wizard.pagadito.retorno");
  const router     = useRouter();
  const pathname   = usePathname();
  const params     = useSearchParams();

  useEffect(() => {
    const raw = params.get("pago");
    if (!raw) return;
    const status = STATUSES.includes(raw as PagoStatus) ? (raw as PagoStatus) : "error";

    switch (status) {
      case "ok":          toast.success(t("ok")); break;
      case "rechazado":   toast.error(t("rechazado")); break;
      case "pendiente":   toast.info(t("pendiente")); break;
      case "desconocido": toast.error(t("desconocido")); break;
      case "error":       toast.error(t("error")); break;
    }

    // Strip the query param so a refresh doesn't re-fire.
    router.replace(pathname, { scroll: false });
  }, [params, router, pathname, t]);

  return null;
}
