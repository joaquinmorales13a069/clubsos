-- Prevent double-booking: two active citas for the same provider/service/time slot.
-- Active = anything not cancelled or rejected. EA only learns about appointments on
-- admin approval, so without this index multiple users could book the same slot.

-- Step 1: cancel duplicate active citas, keeping the earliest one per slot.
-- "Earliest" = smallest id (i.e. the first booking that arrived).
WITH dupes AS (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY ea_provider_id, ea_service_id, fecha_hora_cita
        ORDER BY id
      ) AS rn
    FROM public.citas
    WHERE estado_sync NOT IN ('cancelado', 'rechazado')
      AND ea_provider_id IS NOT NULL
      AND ea_service_id  IS NOT NULL
  ) ranked
  WHERE rn > 1
)
UPDATE public.citas
SET estado_sync = 'cancelado'
WHERE id IN (SELECT id FROM dupes);

-- Step 2: now that duplicates are resolved, create the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS citas_no_double_booking
  ON public.citas (ea_provider_id, ea_service_id, fecha_hora_cita)
  WHERE estado_sync NOT IN ('cancelado', 'rechazado');
