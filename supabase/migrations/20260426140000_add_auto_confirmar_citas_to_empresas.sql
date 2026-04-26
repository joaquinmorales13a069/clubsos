-- Migration: add_auto_confirmar_citas_to_empresas
-- Adds a flag to empresas that auto-confirms new citas without admin intervention.
-- When true, a DB trigger flips estado_sync to 'confirmado' immediately after INSERT,
-- and notificar_cita_whatsapp skips admin notifications entirely.

-- 1. Column
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS auto_confirmar_citas boolean NOT NULL DEFAULT false;

-- 2. Trigger function
CREATE OR REPLACE FUNCTION public.auto_confirmar_cita()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auto boolean;
BEGIN
  IF NEW.empresa_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT auto_confirmar_citas INTO v_auto
  FROM public.empresas
  WHERE id = NEW.empresa_id;

  IF v_auto IS TRUE THEN
    UPDATE public.citas
    SET estado_sync = 'confirmado',
        updated_at  = now()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger — fires AFTER INSERT only when cita starts as pendiente
DROP TRIGGER IF EXISTS trg_auto_confirmar_cita ON public.citas;
CREATE TRIGGER trg_auto_confirmar_cita
  AFTER INSERT ON public.citas
  FOR EACH ROW
  WHEN (NEW.estado_sync = 'pendiente')
  EXECUTE FUNCTION public.auto_confirmar_cita();
