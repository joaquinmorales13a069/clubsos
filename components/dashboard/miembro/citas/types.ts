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
  // Step 1
  categoriaId:      number | null;
  ubicacionNombre:  string;
  // Step 2
  eaServiceId:      number | null;
  servicioId:       string | null;
  servicioNombre:   string;
  servicioDuracion: number;
  // Step 3
  eaProviderId:     number | null;
  doctorNombre:     string;
  // Step 4
  fecha:            string | null;
  // Step 5
  hora:             string | null;
  // Step 6
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
  categoriaId:          null,
  ubicacionNombre:      "",
  eaServiceId:          null,
  servicioId:           null,
  servicioNombre:       "",
  servicioDuracion:     30,
  eaProviderId:         null,
  doctorNombre:         "",
  fecha:                null,
  hora:                 null,
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
  estado_sync:       CitaEstado;
  servicio_asociado: string | null;
  ea_appointment_id: string | null;
  paciente_nombre:   string | null;
  para_titular:      boolean;
}

export interface WizardUserProfile {
  id:                  string;
  rol:                 string;
  empresa_id:          string | null;
  titular_id:          string | null;
  ea_customer_id:      number | null;
  nombre_completo:     string | null;
  telefono:            string | null;
  documento_identidad: string | null;
}
