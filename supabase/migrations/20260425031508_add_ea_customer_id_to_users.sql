-- =============================================================================
-- ea_customer_id on public.users
--
-- NOTE: This column already existed in the database as INTEGER before this
-- migration was created. The ADD COLUMN below is a no-op (IF NOT EXISTS guard).
-- Migration file created retroactively to keep local ↔ DB migration history in sync.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ea_customer_id INTEGER;

COMMENT ON COLUMN public.users.ea_customer_id IS
  'Easy!Appointments customer ID. Populated when the user is accepted into the system. Used to sync cita approvals with the EA REST API.';
