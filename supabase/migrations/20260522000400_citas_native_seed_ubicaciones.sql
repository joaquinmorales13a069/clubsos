-- Migración: seed inicial de ubicaciones (Clínica Managua, Clínica León).
-- Los ea_category_id históricos eran 1 (Managua) y 2 (León), conservamos el orden.

BEGIN;

INSERT INTO public.ubicaciones (nombre, direccion, zona_horaria, activo)
VALUES
  ('Clínica Managua', NULL, 'America/Managua', TRUE),
  ('Clínica León',    NULL, 'America/Managua', TRUE)
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
