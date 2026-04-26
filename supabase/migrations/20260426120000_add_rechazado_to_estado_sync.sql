-- Add 'rechazado' to estado_sync enum so empresa_admin rejection is
-- distinguishable from miembro self-cancellation ('cancelado').
ALTER TYPE public.estado_sync ADD VALUE IF NOT EXISTS 'rechazado';
