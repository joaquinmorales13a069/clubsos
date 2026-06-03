-- Pagadito integration (1/2): extend estado_pago enum with 'iniciado'.
-- Spec: docs/superpowers/specs/2026-06-01-pagadito-integration-design.md
--
-- This file is intentionally NOT wrapped in BEGIN/COMMIT. Postgres requires
-- that a newly-added enum value be committed before it can be referenced in
-- subsequent DDL (such as the partial index in 20260601130001). Splitting
-- the migration ensures the ADD VALUE commits before the index that filters
-- on `estado = 'iniciado'` is built.

ALTER TYPE public.estado_pago ADD VALUE IF NOT EXISTS 'iniciado' BEFORE 'verificado';
