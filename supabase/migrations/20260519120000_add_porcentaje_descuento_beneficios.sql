-- supabase/migrations/20260519120000_add_porcentaje_descuento_beneficios.sql
ALTER TABLE beneficios
  ADD COLUMN IF NOT EXISTS porcentaje_descuento TEXT NULL;
