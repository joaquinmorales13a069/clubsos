-- Tests manuales para el módulo nativo de citas.
-- Uso: psql contra la base remota o local — todos los tests deberían
-- terminar con "PASS" en su NOTICE. Cualquier "FAIL" requiere investigación.
--
-- Ejecutar:
--   psql "$DATABASE_URL" -f supabase/tests/citas_concurrency.sql

\set ON_ERROR_STOP on

BEGIN;

-- Setup: datos de fixture
-- Asume al menos: 1 doctor activo con ubicación, 1 servicio activo asociado,
-- y un horario válido para el día de prueba.

DO $$
DECLARE
  v_doctor_id   UUID;
  v_servicio_id UUID;
  v_user_id     UUID;
  v_fecha       TIMESTAMPTZ;
  v_cita_id     UUID;
  v_dummy       UUID;
BEGIN
  SELECT d.id INTO v_doctor_id
  FROM public.doctores d
  JOIN public.doctor_servicios ds ON ds.doctor_id = d.id
  WHERE d.activo AND d.ubicacion_id IS NOT NULL
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    RAISE NOTICE 'SKIP: no hay doctor activo con ubicación + servicio';
    RETURN;
  END IF;

  SELECT ds.servicio_id INTO v_servicio_id
  FROM public.doctor_servicios ds
  WHERE ds.doctor_id = v_doctor_id LIMIT 1;

  SELECT id INTO v_user_id FROM public.users WHERE rol = 'miembro' LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'SKIP: no hay usuario miembro';
    RETURN;
  END IF;

  INSERT INTO public.horarios_doctores (doctor_id, dia_semana, hora_inicio, hora_fin, slot_duracion)
  VALUES (v_doctor_id, EXTRACT(DOW FROM (CURRENT_DATE + 1))::SMALLINT, '08:00', '12:00', 30)
  ON CONFLICT DO NOTHING;

  v_fecha := ((CURRENT_DATE + 1) || ' 09:00')::TIMESTAMP AT TIME ZONE 'America/Managua';

  DELETE FROM public.citas
  WHERE doctor_id = v_doctor_id AND fecha_hora_cita = v_fecha;

  -- Test 1: insert básico funciona
  SET LOCAL "request.jwt.claims" TO '{"sub":"' || v_user_id::TEXT || '"}';
  v_cita_id := public.crear_cita_atomic(
    v_doctor_id, v_servicio_id, v_fecha, TRUE,
    NULL, NULL, NULL, NULL, NULL, NULL,
    'pago_clinica', NULL, NULL, NULL
  );
  IF v_cita_id IS NULL THEN
    RAISE NOTICE 'FAIL Test 1: crear_cita_atomic devolvió NULL';
  ELSE
    RAISE NOTICE 'PASS Test 1: insert básico (id=%)', v_cita_id;
  END IF;

  -- Test 2: segundo insert al mismo slot debe lanzar SLOT_TAKEN
  BEGIN
    v_dummy := public.crear_cita_atomic(
      v_doctor_id, v_servicio_id, v_fecha, TRUE,
      NULL, NULL, NULL, NULL, NULL, NULL,
      'pago_clinica', NULL, NULL, NULL
    );
    RAISE NOTICE 'FAIL Test 2: segundo insert no lanzó SLOT_TAKEN (id=%)', v_dummy;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'SLOT_TAKEN' THEN
        RAISE NOTICE 'PASS Test 2: segundo insert rechazado con SLOT_TAKEN';
      ELSE
        RAISE NOTICE 'FAIL Test 2: error inesperado: %', SQLERRM;
      END IF;
  END;

  -- Test 3: rechazo libera el slot
  UPDATE public.users SET rol = 'admin' WHERE id = v_user_id;
  PERFORM public.rechazar_cita(v_cita_id, 'test cleanup');
  UPDATE public.users SET rol = 'miembro' WHERE id = v_user_id;

  v_dummy := public.crear_cita_atomic(
    v_doctor_id, v_servicio_id, v_fecha, TRUE,
    NULL, NULL, NULL, NULL, NULL, NULL,
    'pago_clinica', NULL, NULL, NULL
  );
  IF v_dummy IS NOT NULL THEN
    RAISE NOTICE 'PASS Test 3: tras rechazo se pudo reservar el slot (id=%)', v_dummy;
  ELSE
    RAISE NOTICE 'FAIL Test 3: tras rechazo no se pudo reservar';
  END IF;

  -- Test 4: excepción bloquea
  DELETE FROM public.citas WHERE doctor_id = v_doctor_id AND fecha_hora_cita = v_fecha;
  INSERT INTO public.excepciones_horario (doctor_id, fecha_inicio, fecha_fin, motivo)
  VALUES (v_doctor_id, v_fecha - INTERVAL '1 hour', v_fecha + INTERVAL '1 hour', 'test');

  BEGIN
    v_dummy := public.crear_cita_atomic(
      v_doctor_id, v_servicio_id, v_fecha, TRUE,
      NULL, NULL, NULL, NULL, NULL, NULL,
      'pago_clinica', NULL, NULL, NULL
    );
    RAISE NOTICE 'FAIL Test 4: insert en excepción no lanzó SLOT_IN_EXCEPTION (id=%)', v_dummy;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'SLOT_IN_EXCEPTION' THEN
        RAISE NOTICE 'PASS Test 4: insert bloqueado por excepción';
      ELSE
        RAISE NOTICE 'FAIL Test 4: error inesperado: %', SQLERRM;
      END IF;
  END;

  DELETE FROM public.excepciones_horario
  WHERE doctor_id = v_doctor_id AND motivo = 'test';
  DELETE FROM public.citas WHERE doctor_id = v_doctor_id AND fecha_hora_cita = v_fecha;
END;
$$;

ROLLBACK;

-- Nota: el test de concurrencia real (múltiples sesiones simultáneas) requiere
-- ejecución desde un script externo (Node, bash con xargs -P, etc.) que invoque
-- el endpoint POST /api/citas en paralelo una vez que la Fase 2 esté lista.
-- Ver fase 2 plan para el script de concurrencia end-to-end.
