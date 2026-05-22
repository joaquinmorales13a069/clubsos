"use client";

/**
 * AdminDoctorDetalle — wrapper for the doctor detail page.
 *
 * Phase 4 · Step 7 of the native citas module. Loads
 * /api/admin/doctores/[id] once and renders three tabs:
 * Info, Servicios, Horarios+Excepciones.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AdminDoctorTabInfo from "./AdminDoctorTabInfo";
import AdminDoctorTabServicios from "./AdminDoctorTabServicios";
import AdminDoctorTabHorarios from "./AdminDoctorTabHorarios";

export interface DoctorDetail {
  doctor: {
    id:           string;
    nombre:       string;
    correo:       string | null;
    activo:       boolean;
    ubicacion_id: string | null;
    ubicacion:    { id: string; nombre: string } | null;
  };
  horarios: Array<{
    id:            string;
    dia_semana:    number;
    hora_inicio:   string;
    hora_fin:      string;
    slot_duracion: number;
    activo:        boolean;
  }>;
  excepciones: Array<{
    id:           string;
    fecha_inicio: string;
    fecha_fin:    string;
    motivo:       string | null;
  }>;
  servicios: Array<{
    servicio_id: string;
    servicio:    { id: string; nombre: string } | null;
  }>;
}

type Tab = "info" | "servicios" | "horarios";

interface Props {
  doctorId: string;
  locale:   string;
}

export default function AdminDoctorDetalle({ doctorId, locale }: Props) {
  const t = useTranslations("Dashboard.admin.doctores.detalle");

  const [tab,     setTab]     = useState<Tab>("info");
  const [data,    setData]    = useState<DoctorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/doctores/${doctorId}`, { cache: "no-store" });
      if (!res.ok) {
        toast.error(t("errorCargar"));
        return;
      }
      const j = (await res.json()) as DoctorDetail;
      setData(j);
    } catch {
      toast.error(t("errorCargar"));
    } finally {
      setLoading(false);
    }
  }, [doctorId, t]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 text-sm font-roboto text-neutral">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("cargando")}
      </div>
    );
  }

  const tabs: Tab[] = ["info", "servicios", "horarios"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/dashboard/admin/doctores`}
          className="p-2 rounded-lg text-gray-500 hover:text-secondary hover:bg-secondary/10 transition-colors"
          aria-label={t("volver")}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-poppins font-bold text-gray-900">
            {data.doctor.nombre}
          </h1>
          <p className="text-sm font-roboto text-neutral">
            {data.doctor.ubicacion?.nombre ?? "—"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "px-4 py-2 text-sm font-roboto font-medium border-b-2 transition-colors whitespace-nowrap",
              tab === k
                ? "border-secondary text-secondary"
                : "border-transparent text-neutral hover:text-gray-700",
            )}
          >
            {t(`tab_${k}`)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "info" && (
        <AdminDoctorTabInfo
          doctorId={doctorId}
          initial={data.doctor}
          onSaved={load}
        />
      )}
      {tab === "servicios" && (
        <AdminDoctorTabServicios
          doctorId={doctorId}
          initialIds={data.servicios.map((s) => s.servicio_id)}
          onSaved={load}
        />
      )}
      {tab === "horarios" && (
        <AdminDoctorTabHorarios
          doctorId={doctorId}
          horarios={data.horarios}
          excepciones={data.excepciones}
          onChanged={load}
        />
      )}
    </div>
  );
}
