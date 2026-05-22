-- Migración: índices críticos para el módulo nativo de citas + habilitar Realtime.

BEGIN;

-- 1. Drop del índice viejo de double-booking (basado en ea_provider_id/ea_service_id)
DROP INDEX IF EXISTS public.citas_no_double_booking;

-- 2. Nuevo índice único parcial: dos citas activas para el mismo doctor en el mismo
--    instante son imposibles. estado_sync NOT IN ('cancelado','rechazado') libera
--    el slot cuando una cita se cancela o se rechaza.
CREATE UNIQUE INDEX citas_no_double_booking
  ON public.citas (doctor_id, fecha_hora_cita)
  WHERE estado_sync NOT IN ('cancelado', 'rechazado');

-- 3. Índices de soporte para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_citas_doctor_fecha
  ON public.citas (doctor_id, fecha_hora_cita);

CREATE INDEX IF NOT EXISTS idx_citas_ubicacion_fecha
  ON public.citas (ubicacion_id, fecha_hora_cita);

CREATE INDEX IF NOT EXISTS idx_citas_paciente_fecha
  ON public.citas (paciente_id, fecha_hora_cita DESC);

CREATE INDEX IF NOT EXISTS idx_citas_estado
  ON public.citas (estado_sync, fecha_hora_cita)
  WHERE estado_sync IN ('pendiente', 'pendiente_admin', 'pendiente_empresa', 'pendiente_pago', 'confirmado');

-- 4. Habilitar Realtime sobre citas (para PasoHorario y calendario admin)
ALTER PUBLICATION supabase_realtime ADD TABLE public.citas;

COMMIT;
