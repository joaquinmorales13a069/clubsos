/** Shared types for the appointment scheduling wizard */

export type WizardStep =
  | "ubicacion"
  | "servicio"
  | "doctor"
  | "fecha"
  | "horario"
  | "paciente"
  | "pago"
  | "transferencia"
  | "confirmar";

export interface WizardState {
  step: WizardStep;
  // Step 1 — ubicación
  ubicacionId:      string | null;
  ubicacionNombre:  string;
  // Step 2 — servicio
  servicioId:       string | null;
  servicioNombre:   string;
  servicioDuracion: number;  // duración total estimada en minutos (informativa)
  // Step 3 — doctor
  doctorId:         string | null;
  doctorNombre:     string;
  // Step 4 — fecha (YYYY-MM-DD)
  fecha:            string | null;
  // Step 5 — horario (ISO UTC del slot inicial elegido)
  fechaHoraCita:    string | null;
  // Step 6 — paciente
  paraTitular:      boolean;
  pacienteNombre:   string;
  pacienteTelefono: string;
  pacienteCorreo:   string;
  pacienteCedula:   string;
  // Contract coverage (resolved in PasoServicio)
  contrato_servicio_id: string | null;
  cuota_disponible:     number | null;
  requires_payment:     boolean;
  // Payment method (resolved in PasoPago)
  metodo_pago: "link_pago" | "transferencia" | "pago_clinica" | null;
  monto:       number | null;
  // Created cita (set after confirmar succeeds)
  cita_id: string | null;
}

export const WIZARD_STEPS_BASE: WizardStep[] = [
  "ubicacion", "servicio", "doctor", "fecha", "horario", "paciente", "confirmar",
];

export const WIZARD_STEPS_WITH_PAGO: WizardStep[] = [
  "ubicacion", "servicio", "doctor", "fecha", "horario", "paciente", "pago", "confirmar",
];

export const WIZARD_STEPS = WIZARD_STEPS_BASE;

export const INITIAL_WIZARD: WizardState = {
  step:                 "ubicacion",
  ubicacionId:          null,
  ubicacionNombre:      "",
  servicioId:           null,
  servicioNombre:       "",
  servicioDuracion:     30,
  doctorId:             null,
  doctorNombre:         "",
  fecha:                null,
  fechaHoraCita:        null,
  paraTitular:          true,
  pacienteNombre:       "",
  pacienteTelefono:     "",
  pacienteCorreo:       "",
  pacienteCedula:       "",
  contrato_servicio_id: null,
  cuota_disponible:     null,
  requires_payment:     false,
  metodo_pago:          null,
  monto:                null,
  cita_id:              null,
};

export type CitaEstado =
  | "pendiente"
  | "pendiente_empresa"
  | "pendiente_pago"
  | "pendiente_admin"
  | "confirmado"
  | "completado"
  | "cancelado"
  | "rechazado";

export interface CitaRow {
  id:                string;
  fecha_hora_cita:   string;
  fecha_hora_fin:    string | null;
  estado_sync:       CitaEstado;
  servicio_asociado: string | null;
  paciente_nombre:   string | null;
  para_titular:      boolean;
  doctor:            { nombre: string } | null;
  ubicacion:         { nombre: string; direccion: string | null } | null;
}

export interface WizardUserProfile {
  id:                  string;
  rol:                 string;
  empresa_id:          string | null;
  titular_id:          string | null;
  nombre_completo:     string | null;
  telefono:            string | null;
  documento_identidad: string | null;
}
