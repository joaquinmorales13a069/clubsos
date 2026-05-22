-- Migración: hacer doctores.ubicacion_id NOT NULL.
--
-- IMPORTANTE: aplicar SOLO después de que el admin haya asignado ubicación a
-- todos los doctores existentes desde el dashboard admin/doctores. Esta migración
-- falla deliberadamente si quedan doctores sin ubicación, para evitar romper
-- queries dependientes de ubicacion_id.

BEGIN;

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.doctores WHERE ubicacion_id IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Hay % doctores sin ubicacion_id. Asignar desde el dashboard admin/doctores antes de aplicar esta migración.', v_count;
  END IF;
END;
$$;

ALTER TABLE public.doctores
  ALTER COLUMN ubicacion_id SET NOT NULL;

COMMIT;
