/** Shared types for the appointment scheduling wizard */

export type WizardStep =
  | "ubicacion"
  | "servicio"
  | "doctor"
  | "fecha"
  | "horario"
  | "paciente"
  | "confirmar";

export interface WizardState {
  step: WizardStep;
  // Step 1 — Ubicación
  categoriaId:      number | null;
  ubicacionNombre:  string;
  // Step 2 — Servicio
  eaServiceId:      number | null;
  servicioNombre:   string;
  servicioDuracion: number; // minutes — used to compute end time
  // Step 3 — Doctor
  eaProviderId:     number | null;
  doctorNombre:     string;
  // Step 4 — Fecha
  fecha:            string | null; // YYYY-MM-DD
  // Step 5 — Horario
  hora:             string | null; // HH:MM  (24h)
  // Step 6 — Paciente
  paraTitular:      boolean;
  pacienteNombre:   string;
  pacienteTelefono: string;
  pacienteCorreo:   string;
  pacienteCedula:   string;
}

export const WIZARD_STEPS: WizardStep[] = [
  "ubicacion",
  "servicio",
  "doctor",
  "fecha",
  "horario",
  "paciente",
  "confirmar",
];

export const INITIAL_WIZARD: WizardState = {
  step:             "ubicacion",
  categoriaId:      null,
  ubicacionNombre:  "",
  eaServiceId:      null,
  servicioNombre:   "",
  servicioDuracion: 30,
  eaProviderId:     null,
  doctorNombre:     "",
  fecha:            null,
  hora:             null,
  paraTitular:      true,
  pacienteNombre:   "",
  pacienteTelefono: "",
  pacienteCorreo:   "",
  pacienteCedula:   "",
};

/** Cita row returned from public.citas */
export interface CitaRow {
  id:               string;
  fecha_hora_cita:  string;
  estado_sync:      "pendiente" | "confirmado" | "completado" | "cancelado" | "rechazado";
  servicio_asociado: string | null;
  ea_appointment_id: string | null;
  paciente_nombre:  string | null;
  para_titular:     boolean;
}

/** User profile data needed by the wizard */
export interface WizardUserProfile {
  id:                 string;
  rol:                string;
  empresa_id:         string | null;
  ea_customer_id:     number | null;
  nombre_completo:    string | null;
  telefono:           string | null;
  documento_identidad: string | null;
}
