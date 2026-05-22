// Mapea los códigos de error que lanzan las RPCs Postgres del módulo de citas
// a status HTTP + clave i18n. Las RPCs lanzan RAISE EXCEPTION USING ERRCODE = 'P0001'
// con el código en el mensaje. Supabase JS expone el mensaje en `error.message`.

export type CitaErrorCode =
  | "SLOT_TAKEN"
  | "SLOT_OUT_OF_HOURS"
  | "SLOT_IN_EXCEPTION"
  | "QUOTA_EXCEEDED"
  | "INVALID_DOCTOR_SERVICE"
  | "CANCEL_TOO_LATE"
  | "INVALID_STATE_TRANSITION"
  | "CITA_NOT_FOUND"
  | "DOCTOR_NOT_FOUND"
  | "SERVICIO_NOT_FOUND"
  | "CONTRATO_OR_METODO_PAGO_REQUIRED"
  | "UNAUTHORIZED"
  | "FORBIDDEN";

export interface CitaErrorMapping {
  status: number;
  i18nKey: string;
}

const MAPPING: Record<CitaErrorCode, CitaErrorMapping> = {
  SLOT_TAKEN:                        { status: 409, i18nKey: "Errors.citas.slot_taken" },
  SLOT_OUT_OF_HOURS:                 { status: 422, i18nKey: "Errors.citas.slot_out_of_hours" },
  SLOT_IN_EXCEPTION:                 { status: 422, i18nKey: "Errors.citas.slot_in_exception" },
  QUOTA_EXCEEDED:                    { status: 409, i18nKey: "Errors.citas.quota_exceeded" },
  INVALID_DOCTOR_SERVICE:            { status: 422, i18nKey: "Errors.citas.invalid_doctor_service" },
  CANCEL_TOO_LATE:                   { status: 409, i18nKey: "Errors.citas.cancel_too_late" },
  INVALID_STATE_TRANSITION:          { status: 409, i18nKey: "Errors.citas.invalid_state_transition" },
  CITA_NOT_FOUND:                    { status: 404, i18nKey: "Errors.citas.cita_not_found" },
  DOCTOR_NOT_FOUND:                  { status: 404, i18nKey: "Errors.citas.doctor_not_found" },
  SERVICIO_NOT_FOUND:                { status: 404, i18nKey: "Errors.citas.servicio_not_found" },
  CONTRATO_OR_METODO_PAGO_REQUIRED:  { status: 400, i18nKey: "Errors.citas.contrato_or_metodo_pago_required" },
  UNAUTHORIZED:                      { status: 401, i18nKey: "Errors.citas.unauthorized" },
  FORBIDDEN:                         { status: 403, i18nKey: "Errors.citas.forbidden" },
};

const KNOWN_CODES = new Set(Object.keys(MAPPING));

export function parseCitaError(rawMessage: string | null | undefined): {
  code: CitaErrorCode | "UNKNOWN";
  status: number;
  i18nKey: string;
} {
  if (!rawMessage) {
    return { code: "UNKNOWN", status: 500, i18nKey: "Errors.citas.unknown" };
  }

  const trimmed = rawMessage.trim().toUpperCase();
  for (const code of KNOWN_CODES) {
    if (trimmed === code || trimmed.includes(code)) {
      const mapping = MAPPING[code as CitaErrorCode];
      return { code: code as CitaErrorCode, status: mapping.status, i18nKey: mapping.i18nKey };
    }
  }
  return { code: "UNKNOWN", status: 500, i18nKey: "Errors.citas.unknown" };
}
