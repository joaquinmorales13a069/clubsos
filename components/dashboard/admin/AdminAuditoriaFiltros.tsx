"use client";

import { useTranslations } from "next-intl";
import { X, Download, Loader2 } from "lucide-react";

const ACCIONES = [
  "cita.aprobar", "cita.rechazar", "cita.crear", "cita.cancelar",
  "empresa.crear", "empresa.actualizar", "empresa.activar", "empresa.desactivar",
  "contrato.crear", "contrato.actualizar", "contrato.eliminar",
  "documento.subir", "documento.actualizar", "documento.eliminar",
  "usuario.activar", "usuario.desactivar", "pago.verificar",
  "configuracion.notificaciones_citas", "configuracion.datos_bancarios",
];

const ENTIDADES = [
  "citas", "empresas", "contratos", "documentos_medicos", "users", "pagos",
];

export type AuditoriaFiltros = {
  accion:      string;
  entidad:     string;
  actorSearch: string;
  desde:       string;
  hasta:       string;
};

interface Props {
  filtros:       AuditoriaFiltros;
  exporting:     boolean;
  onFiltroChange: (key: keyof AuditoriaFiltros, value: string) => void;
  onLimpiar:     () => void;
  onExportCsv:   () => void;
}

const inputCls =
  "px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-roboto text-gray-800 " +
  "focus:outline-none focus:border-secondary/60 focus:ring-2 focus:ring-secondary/10 transition-colors";

export default function AdminAuditoriaFiltros({
  filtros, exporting, onFiltroChange, onLimpiar, onExportCsv,
}: Props) {
  const t = useTranslations("Dashboard.admin.auditoria.filtros");

  const hayFiltros =
    !!filtros.accion || !!filtros.entidad || !!filtros.actorSearch ||
    !!filtros.desde  || !!filtros.hasta;

  return (
    <div className="flex flex-wrap gap-3 items-end">
      {/* Acción */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <label htmlFor="audit-accion" className="text-xs font-semibold font-roboto text-gray-500 uppercase tracking-wide">
          {t("accion")}
        </label>
        <select
          id="audit-accion"
          value={filtros.accion}
          onChange={(e) => onFiltroChange("accion", e.target.value)}
          className={inputCls}
        >
          <option value="">{t("todasAcciones")}</option>
          {ACCIONES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Entidad */}
      <div className="flex flex-col gap-1 min-w-[150px]">
        <label htmlFor="audit-entidad" className="text-xs font-semibold font-roboto text-gray-500 uppercase tracking-wide">
          {t("entidad")}
        </label>
        <select
          id="audit-entidad"
          value={filtros.entidad}
          onChange={(e) => onFiltroChange("entidad", e.target.value)}
          className={inputCls}
        >
          <option value="">{t("todasEntidades")}</option>
          {ENTIDADES.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      {/* Desde */}
      <div className="flex flex-col gap-1">
        <label htmlFor="audit-desde" className="text-xs font-semibold font-roboto text-gray-500 uppercase tracking-wide">
          {t("desde")}
        </label>
        <input
          id="audit-desde"
          type="date"
          value={filtros.desde}
          onChange={(e) => onFiltroChange("desde", e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Hasta */}
      <div className="flex flex-col gap-1">
        <label htmlFor="audit-hasta" className="text-xs font-semibold font-roboto text-gray-500 uppercase tracking-wide">
          {t("hasta")}
        </label>
        <input
          id="audit-hasta"
          type="date"
          value={filtros.hasta}
          onChange={(e) => onFiltroChange("hasta", e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Actor search */}
      <div className="flex flex-col gap-1 min-w-[180px]">
        <label htmlFor="audit-actor" className="text-xs font-semibold font-roboto text-gray-500 uppercase tracking-wide">
          {t("actor")}
        </label>
        <input
          id="audit-actor"
          type="text"
          placeholder={t("actor")}
          value={filtros.actorSearch}
          onChange={(e) => onFiltroChange("actorSearch", e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pb-0.5">
        {hayFiltros && (
          <button
            type="button"
            onClick={onLimpiar}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200
                       text-sm font-roboto text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            {t("limpiar")}
          </button>
        )}
        <button
          type="button"
          onClick={onExportCsv}
          disabled={exporting}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-white
                     text-sm font-roboto font-semibold hover:bg-secondary/90 disabled:opacity-60
                     transition-colors"
        >
          {exporting
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Download className="w-3.5 h-3.5" />
          }
          {exporting ? t("exportando") : t("exportarCsv")}
        </button>
      </div>
    </div>
  );
}
