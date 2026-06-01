-- Add telefono and especialidad columns to doctores table
-- Required for the new parallel-route doctor edit/create forms.

ALTER TABLE public.doctores
  ADD COLUMN IF NOT EXISTS telefono    TEXT,
  ADD COLUMN IF NOT EXISTS especialidad TEXT;
