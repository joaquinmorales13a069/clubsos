-- Add RUC, direccion_calle, and departamento columns to public.empresas.
-- ruc is UNIQUE but nullable (PostgreSQL UNIQUE allows multiple NULLs).

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS ruc              TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS direccion_calle  TEXT,
  ADD COLUMN IF NOT EXISTS departamento     TEXT;

-- Backfill SOS Medical (the only existing company in the system).
UPDATE public.empresas
SET
  ruc             = 'J0310000100357',
  direccion_calle = 'Bolonia, de Sermesa 80 vrs Oeste',
  departamento    = 'Managua'
WHERE codigo_empresa IS NOT NULL
  AND ruc IS NULL;
