-- Prevent double-booking: two active citas for the same provider/service/time slot.
-- Active = anything not cancelled or rejected. EA only learns about appointments on
-- admin approval, so without this index multiple users could book the same slot.
CREATE UNIQUE INDEX IF NOT EXISTS citas_no_double_booking
  ON public.citas (ea_provider_id, ea_service_id, fecha_hora_cita)
  WHERE estado_sync NOT IN ('cancelado', 'rechazado');
