-- =============================================================================
-- Datos mock para pruebas del módulo nativo de citas.
-- Servicios + Doctores + doctor_servicios + horarios_doctores.
--
-- Aplicar con:
--   psql "$DATABASE_URL" -f supabase/seed/test_data_servicios_doctores.sql
--
-- O pegar todo en el SQL editor del Supabase Dashboard.
--
-- Idempotente: usa WHERE NOT EXISTS / ON CONFLICT, así que se puede correr
-- varias veces sin duplicar filas.
--
-- Requisitos previos:
--   - Tabla ubicaciones poblada (Clínica Managua + Clínica León, seedeada
--     por la migración 20260522000400_citas_native_seed_ubicaciones.sql)
--   - Schema del módulo nativo aplicado (Fases 1-4 del proyecto)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SERVICIOS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.servicios (nombre, descripcion, duracion, slot_duracion, precio, activo)
SELECT * FROM (VALUES
  ('Consulta General',          'Consulta médica de medicina general para adultos.',          30, 1,  500.00, TRUE),
  ('Consulta Pediátrica',       'Consulta médica especializada en niños y adolescentes.',     30, 1,  600.00, TRUE),
  ('Consulta Ginecológica',     'Consulta especializada en salud femenina.',                   45, 2,  800.00, TRUE),
  ('Consulta Dermatológica',    'Diagnóstico y tratamiento de afecciones de la piel.',         30, 1,  700.00, TRUE),
  ('Examen Físico Completo',    'Chequeo médico general anual con laboratorios básicos.',     60, 2, 1500.00, TRUE),
  ('Vacunación',                'Aplicación de vacunas (no incluye costo de la vacuna).',     15, 1,  150.00, TRUE),
  ('Limpieza Dental',           'Profilaxis dental y eliminación de sarro.',                   45, 2,  450.00, TRUE),
  ('Endodoncia (revisión)',     'Evaluación inicial para tratamiento de conducto.',            30, 1,  600.00, TRUE),
  ('Cirugía Menor',             'Procedimiento ambulatorio menor (suturas, drenaje, etc.).',  60, 2, 2000.00, TRUE),
  ('Control Prenatal',          'Consulta de seguimiento para mujeres embarazadas.',           45, 2,  750.00, TRUE)
) AS s(nombre, descripcion, duracion, slot_duracion, precio, activo)
WHERE NOT EXISTS (
  SELECT 1 FROM public.servicios WHERE servicios.nombre = s.nombre
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DOCTORES (con ubicación)
-- ─────────────────────────────────────────────────────────────────────────────
-- Usamos el correo como discriminador para idempotencia.

WITH ubic AS (
  SELECT id AS managua_id FROM public.ubicaciones WHERE nombre = 'Clínica Managua'
), ubic_leon AS (
  SELECT id AS leon_id FROM public.ubicaciones WHERE nombre = 'Clínica León'
)
INSERT INTO public.doctores (nombre, correo, ubicacion_id, activo)
SELECT d.nombre, d.correo, d.ubicacion_id, d.activo
FROM (VALUES
  -- Managua
  ('Dr. Carlos Mendoza',     'carlos.mendoza@sosmedical.test',     (SELECT managua_id FROM ubic), TRUE),
  ('Dra. María Fernández',   'maria.fernandez@sosmedical.test',    (SELECT managua_id FROM ubic), TRUE),
  ('Dra. Ana Torres',        'ana.torres@sosmedical.test',         (SELECT managua_id FROM ubic), TRUE),
  ('Dr. Luis Martínez',      'luis.martinez@sosmedical.test',      (SELECT managua_id FROM ubic), TRUE),
  ('Dra. Patricia López',    'patricia.lopez@sosmedical.test',     (SELECT managua_id FROM ubic), TRUE),
  -- León
  ('Dr. Roberto Hernández',  'roberto.hernandez@sosmedical.test',  (SELECT leon_id FROM ubic_leon), TRUE),
  ('Dra. Sofía Ramírez',     'sofia.ramirez@sosmedical.test',      (SELECT leon_id FROM ubic_leon), TRUE),
  ('Dr. Eduardo Castro',     'eduardo.castro@sosmedical.test',     (SELECT leon_id FROM ubic_leon), TRUE),
  ('Dra. Carolina Vargas',   'carolina.vargas@sosmedical.test',    (SELECT leon_id FROM ubic_leon), TRUE)
) AS d(nombre, correo, ubicacion_id, activo)
WHERE NOT EXISTS (
  SELECT 1 FROM public.doctores WHERE doctores.correo = d.correo
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DOCTOR_SERVICIOS — qué servicios ofrece cada doctor
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.doctor_servicios (doctor_id, servicio_id)
SELECT d.id, s.id
FROM (VALUES
  -- Dr. Carlos Mendoza — medicina general
  ('carlos.mendoza@sosmedical.test',    'Consulta General'),
  ('carlos.mendoza@sosmedical.test',    'Examen Físico Completo'),
  ('carlos.mendoza@sosmedical.test',    'Vacunación'),
  -- Dra. María Fernández — pediatría
  ('maria.fernandez@sosmedical.test',   'Consulta Pediátrica'),
  ('maria.fernandez@sosmedical.test',   'Vacunación'),
  -- Dra. Ana Torres — ginecología
  ('ana.torres@sosmedical.test',        'Consulta Ginecológica'),
  ('ana.torres@sosmedical.test',        'Control Prenatal'),
  -- Dr. Luis Martínez — dermatología + cirugía menor
  ('luis.martinez@sosmedical.test',     'Consulta Dermatológica'),
  ('luis.martinez@sosmedical.test',     'Cirugía Menor'),
  -- Dra. Patricia López — odontología
  ('patricia.lopez@sosmedical.test',    'Limpieza Dental'),
  ('patricia.lopez@sosmedical.test',    'Endodoncia (revisión)'),
  -- Dr. Roberto Hernández — medicina general (León)
  ('roberto.hernandez@sosmedical.test', 'Consulta General'),
  ('roberto.hernandez@sosmedical.test', 'Examen Físico Completo'),
  -- Dra. Sofía Ramírez — pediatría (León)
  ('sofia.ramirez@sosmedical.test',     'Consulta Pediátrica'),
  ('sofia.ramirez@sosmedical.test',     'Vacunación'),
  -- Dr. Eduardo Castro — odontología (León)
  ('eduardo.castro@sosmedical.test',    'Limpieza Dental'),
  ('eduardo.castro@sosmedical.test',    'Endodoncia (revisión)'),
  -- Dra. Carolina Vargas — ginecología (León)
  ('carolina.vargas@sosmedical.test',   'Consulta Ginecológica'),
  ('carolina.vargas@sosmedical.test',   'Control Prenatal')
) AS pair(doctor_correo, servicio_nombre)
JOIN public.doctores  d ON d.correo = pair.doctor_correo
JOIN public.servicios s ON s.nombre = pair.servicio_nombre
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. HORARIOS_DOCTORES — horario semanal recurrente
-- ─────────────────────────────────────────────────────────────────────────────
-- dia_semana: 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado
-- slot_duracion en minutos.
-- ON CONFLICT DO NOTHING usa el UNIQUE (doctor_id, dia_semana, hora_inicio).

INSERT INTO public.horarios_doctores (doctor_id, dia_semana, hora_inicio, hora_fin, slot_duracion, activo)
SELECT d.id, h.dia_semana, h.hora_inicio::TIME, h.hora_fin::TIME, h.slot_duracion::SMALLINT, TRUE
FROM (VALUES
  -- ════ MANAGUA ════════════════════════════════════════════════════════════

  -- Dr. Carlos Mendoza — Lun-Vie mañana y tarde
  ('carlos.mendoza@sosmedical.test', 1, '08:00', '12:00', 30),
  ('carlos.mendoza@sosmedical.test', 1, '14:00', '18:00', 30),
  ('carlos.mendoza@sosmedical.test', 2, '08:00', '12:00', 30),
  ('carlos.mendoza@sosmedical.test', 2, '14:00', '18:00', 30),
  ('carlos.mendoza@sosmedical.test', 3, '08:00', '12:00', 30),
  ('carlos.mendoza@sosmedical.test', 3, '14:00', '18:00', 30),
  ('carlos.mendoza@sosmedical.test', 4, '08:00', '12:00', 30),
  ('carlos.mendoza@sosmedical.test', 4, '14:00', '18:00', 30),
  ('carlos.mendoza@sosmedical.test', 5, '08:00', '12:00', 30),

  -- Dra. María Fernández — Lun, Mié, Vie + Sábado mañana
  ('maria.fernandez@sosmedical.test', 1, '09:00', '13:00', 30),
  ('maria.fernandez@sosmedical.test', 1, '15:00', '17:00', 30),
  ('maria.fernandez@sosmedical.test', 3, '09:00', '13:00', 30),
  ('maria.fernandez@sosmedical.test', 3, '15:00', '17:00', 30),
  ('maria.fernandez@sosmedical.test', 5, '09:00', '13:00', 30),
  ('maria.fernandez@sosmedical.test', 6, '08:00', '12:00', 30),

  -- Dra. Ana Torres — Mar, Jue, Sáb mañana (ginecología = slots largos)
  ('ana.torres@sosmedical.test', 2, '09:00', '13:00', 30),
  ('ana.torres@sosmedical.test', 4, '09:00', '13:00', 30),
  ('ana.torres@sosmedical.test', 4, '14:00', '18:00', 30),
  ('ana.torres@sosmedical.test', 6, '08:00', '12:00', 30),

  -- Dr. Luis Martínez — Lun-Vie tarde solo
  ('luis.martinez@sosmedical.test', 1, '13:00', '18:00', 30),
  ('luis.martinez@sosmedical.test', 2, '13:00', '18:00', 30),
  ('luis.martinez@sosmedical.test', 3, '13:00', '18:00', 30),
  ('luis.martinez@sosmedical.test', 4, '13:00', '18:00', 30),
  ('luis.martinez@sosmedical.test', 5, '13:00', '18:00', 30),

  -- Dra. Patricia López — Lun, Mar, Jue, Sáb (odontología = 45min/slot)
  ('patricia.lopez@sosmedical.test', 1, '08:00', '12:00', 45),
  ('patricia.lopez@sosmedical.test', 2, '08:00', '12:00', 45),
  ('patricia.lopez@sosmedical.test', 2, '14:00', '17:00', 45),
  ('patricia.lopez@sosmedical.test', 4, '08:00', '12:00', 45),
  ('patricia.lopez@sosmedical.test', 4, '14:00', '17:00', 45),
  ('patricia.lopez@sosmedical.test', 6, '08:00', '12:00', 45),

  -- ════ LEÓN ═══════════════════════════════════════════════════════════════

  -- Dr. Roberto Hernández — Lun-Vie mañana y tarde
  ('roberto.hernandez@sosmedical.test', 1, '08:00', '12:00', 30),
  ('roberto.hernandez@sosmedical.test', 1, '14:00', '18:00', 30),
  ('roberto.hernandez@sosmedical.test', 2, '08:00', '12:00', 30),
  ('roberto.hernandez@sosmedical.test', 2, '14:00', '18:00', 30),
  ('roberto.hernandez@sosmedical.test', 3, '08:00', '12:00', 30),
  ('roberto.hernandez@sosmedical.test', 4, '08:00', '12:00', 30),
  ('roberto.hernandez@sosmedical.test', 4, '14:00', '18:00', 30),
  ('roberto.hernandez@sosmedical.test', 5, '08:00', '12:00', 30),

  -- Dra. Sofía Ramírez — Lun, Mié, Vie + Sábado mañana
  ('sofia.ramirez@sosmedical.test', 1, '09:00', '13:00', 30),
  ('sofia.ramirez@sosmedical.test', 3, '09:00', '13:00', 30),
  ('sofia.ramirez@sosmedical.test', 3, '15:00', '18:00', 30),
  ('sofia.ramirez@sosmedical.test', 5, '09:00', '13:00', 30),
  ('sofia.ramirez@sosmedical.test', 6, '08:00', '12:00', 30),

  -- Dr. Eduardo Castro — Mar, Jue, Sáb (odontología = 45min/slot)
  ('eduardo.castro@sosmedical.test', 2, '08:00', '12:00', 45),
  ('eduardo.castro@sosmedical.test', 2, '14:00', '17:00', 45),
  ('eduardo.castro@sosmedical.test', 4, '08:00', '12:00', 45),
  ('eduardo.castro@sosmedical.test', 4, '14:00', '17:00', 45),
  ('eduardo.castro@sosmedical.test', 6, '08:00', '12:00', 45),

  -- Dra. Carolina Vargas — Lun, Mié, Vie
  ('carolina.vargas@sosmedical.test', 1, '09:00', '13:00', 30),
  ('carolina.vargas@sosmedical.test', 3, '09:00', '13:00', 30),
  ('carolina.vargas@sosmedical.test', 3, '15:00', '18:00', 30),
  ('carolina.vargas@sosmedical.test', 5, '09:00', '13:00', 30)
) AS h(doctor_correo, dia_semana, hora_inicio, hora_fin, slot_duracion)
JOIN public.doctores d ON d.correo = h.doctor_correo
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Resumen
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_servicios INT;
  v_doctores  INT;
  v_pivote    INT;
  v_horarios  INT;
BEGIN
  SELECT COUNT(*) INTO v_servicios FROM public.servicios;
  SELECT COUNT(*) INTO v_doctores  FROM public.doctores;
  SELECT COUNT(*) INTO v_pivote    FROM public.doctor_servicios;
  SELECT COUNT(*) INTO v_horarios  FROM public.horarios_doctores;

  RAISE NOTICE '── Seed completado ──';
  RAISE NOTICE 'Servicios totales:           %', v_servicios;
  RAISE NOTICE 'Doctores totales:            %', v_doctores;
  RAISE NOTICE 'Asignaciones doctor↔servicio: %', v_pivote;
  RAISE NOTICE 'Horarios semanales:          %', v_horarios;
END;
$$;

COMMIT;
