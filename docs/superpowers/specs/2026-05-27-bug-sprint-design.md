# Bug-fix sprint — May 2026

**Branch (sugerido):** `fix/bug-sprint-mayo-2026`
**PR único** que agrupa 5 bugs/mejoras independientes.

---

## Resumen

Cinco items reportados:

| # | Item | Tipo | Riesgo |
|---|------|------|--------|
| 1 | Uso de citas por contrato en modal de usuario (admin) | Feature interna | Bajo |
| 2 | Fusión de campanas (notificaciones + avisos) | Refactor UI | Bajo |
| 3 | Botones del modal de cancelar/rechazar cita (admin) | Copy | Trivial |
| 4 | Validación de paciente ocupado (no doble-booking) | Bug crítico de lógica | Medio |
| 5 | Mostrar ubicación en CitaCard del miembro | UI fix | Trivial |

---

## #1 — Uso de citas por contrato en modal de usuario (admin)

**Objetivo:** que el admin pueda revisar, desde la modal de detalle de cada usuario, cuántas citas ha consumido el titular contra cada contrato/servicio.

### Cambios

- Refactor de `EditarUsuarioAdminModal` en `components/dashboard/admin/AdminUsuarios.tsx` para envolver el contenido en `<Tabs>` de shadcn con dos pestañas:
  - **Información** — formulario actual sin cambios (default tab).
  - **Uso de citas** — nuevo, ver abajo.
- La tab **Uso de citas** se muestra cuando `usuario.empresa_id IS NOT NULL` (cubre roles `miembro` y `empresa_admin`). Para usuarios `admin` se oculta la tab por completo (no aplica).
- Nuevo componente `components/dashboard/admin/AdminUsuarioContratosUsage.tsx`:
  - Props: `userId: string`.
  - Hace `fetch('/api/admin/usuarios/[id]/contratos-usage')` con `cache: 'no-store'`.
  - Renderiza lista por contrato → servicio con: nombre del contrato, servicio, cuota por titular, usadas, restantes, barra de progreso visual (`bg-emerald` si <70%, `amber` si <100%, `red` si =100%), fecha de inicio de período y tipo de reset.
  - Estado loading (Skeleton), estado empty ("Sin contratos activos para este usuario").
- Nuevo route handler `app/api/admin/usuarios/[id]/contratos-usage/route.ts`:
  - `assertAdmin(supabase)`.
  - Llama al RPC existente `get_miembro_contrato_usage(p_user_id := params.id)`.
  - Retorna `{ usage: jsonb }`.

### i18n

Nuevas keys en `messages/es.json` + `messages/en.json`:
- `Dashboard.admin.usuarios.modal.tabs.info` / `.uso`
- `Dashboard.admin.usuarios.contratosUsage.title`
- `Dashboard.admin.usuarios.contratosUsage.empty`
- `Dashboard.admin.usuarios.contratosUsage.cuotaLabel` / `.usadasLabel` / `.restantesLabel`
- `Dashboard.admin.usuarios.contratosUsage.periodoLabel`

---

## #2 — Fusión de campanas en topbar

**Objetivo:** un solo icono de campana en lugar de dos, lista unificada cronológica, badges separados por tipo.

### Cambios

- En `components/dashboard/Topbar.tsx`:
  - Eliminar `<TopbarAvisosPopover />`.
  - Mantener un solo `<CampanaUnificada />` (renombre de `NotificacionesCampana.tsx`).
- Refactor de `components/dashboard/NotificacionesCampana.tsx` → `CampanaUnificada.tsx`:
  - Hook interno carga en paralelo:
    - `notificaciones` del usuario actual (lo que ya hace hoy).
    - `avisos` vigentes para el usuario (lo que hace `TopbarAvisosPopover`).
  - Suscripciones realtime a ambas tablas.
  - Estado derivado: arreglo unificado ordenado por `created_at DESC` con campo `type: 'notificacion' | 'aviso'`.
- Render del botón:
  - Un solo icono `Bell`.
  - Dos badges pequeños lado a lado (solo si su count > 0):
    - `🔔 N` — notificaciones no leídas (color neutral/gris oscuro).
    - `📢 N` — avisos no abiertos por el usuario (color azul `secondary`).
  - Formato compacto: ambos badges van superpuestos arriba-derecha del icono.
- Render del popover:
  - Lista unificada (sin tabs).
  - Cada item tiene a la izquierda una pill pequeña indicando tipo (`Notificación` con icono campana / `Aviso` con icono megáfono) y a la derecha el contenido (título + tiempo relativo).
  - Click en notificación: marca como leída + navega si tiene `link_url`.
  - Click en aviso: abre el `AvisoDetailModal` existente y marca como leído (tabla `aviso_lecturas` o equivalente — revisar lo que ya hace `TopbarAvisosPopover`).
  - Footer: "Ver todas las notificaciones" + "Ver todos los avisos" (dos links separados, mantienen las páginas existentes).

### i18n

- `Dashboard.topbar.campana.pillNotif` / `.pillAviso`
- `Dashboard.topbar.campana.empty` (cuando ambas listas vacías)
- `Dashboard.topbar.campana.verNotificaciones` / `.verAvisos`

### Eliminar

- `components/dashboard/TopbarAvisosPopover.tsx` (después de verificar que nadie más lo importa).

---

## #3 — Botones del modal de cancelar/rechazar cita (admin)

**Bug:** En `AdminCitaDetalleModal.tsx` cuando se confirma una cancelación o rechazo, ambos botones del footer muestran el mismo texto "Cancelar cita" / "Rechazar".

### Cambios

En `components/dashboard/admin/AdminCitaDetalleModal.tsx`:

- Rama `isConfirmado && showCancelar` (líneas 363-385):
  - Botón izquierdo (regresar): `t("no_regresar")` = "No, regresar"
  - Botón derecho (confirmar): `t("si_cancelar_cita")` = "Sí, cancelar cita"

- Rama `isPendiente && showRechazar` (líneas 327-349):
  - Botón izquierdo (regresar): `t("no_regresar")` = "No, regresar"
  - Botón derecho (confirmar): `t("si_rechazar_cita")` = "Sí, rechazar cita"

### i18n

Nuevas keys bajo `Dashboard.admin.citas.calendario.modal`:

- `no_regresar` → "No, regresar" / "No, go back"
- `si_cancelar_cita` → "Sí, cancelar cita" / "Yes, cancel appointment"
- `si_rechazar_cita` → "Sí, rechazar cita" / "Yes, reject appointment"

---

## #4 — Validación de paciente ocupado (no doble-booking del paciente)

**Bug:** `crear_cita_atomic` valida solapamiento solo por `doctor_id`. Un usuario puede agendar dos citas a la misma hora con doctores distintos (o en clínicas distintas), lo cual es físicamente imposible.

**Regla acordada (respuesta del usuario en brainstorming):** "por persona física" — el titular y cada familiar tienen su propia regla de no-solape; el titular no bloquea a su familiar y viceversa.

### Migración SQL

Nueva migración `supabase/migrations/YYYYMMDDHHMMSS_citas_patient_busy_check.sql` que reemplaza `crear_cita_atomic` con la misma firma. Después del check `SLOT_TAKEN` (línea ~129 del original) se inserta:

```sql
-- ── Patient-busy check ─────────────────────────────────────────────────────
-- Una misma persona física no puede tener dos citas que se traslapen en tiempo,
-- aunque sean con doctores o en ubicaciones distintas.
IF p_para_titular THEN
  -- Lock por titular+día para cerrar la race-condition entre 2 inserts simultáneos
  PERFORM pg_advisory_xact_lock(
    hashtext('patient_slot:titular:' || v_user_id::TEXT
             || ':' || (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::DATE::TEXT)
  );
  IF EXISTS (
    SELECT 1 FROM public.citas c
    WHERE c.paciente_id = v_user_id
      AND c.para_titular = TRUE
      AND c.estado_sync NOT IN ('cancelado','rechazado')
      AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
          && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
  ) THEN
    RAISE EXCEPTION 'PATIENT_BUSY' USING ERRCODE = 'P0001';
  END IF;
ELSE
  -- Familiar: identificado por cédula normalizada (sin guiones).
  -- Si no hay cédula, no podemos identificar al familiar — saltamos el check.
  IF COALESCE(REPLACE(p_paciente_cedula, '-', ''), '') <> '' THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('patient_slot:familiar:' || v_user_id::TEXT
               || ':' || REPLACE(p_paciente_cedula, '-', '')
               || ':' || (p_fecha_hora_cita AT TIME ZONE v_doctor_tz)::DATE::TEXT)
    );
    IF EXISTS (
      SELECT 1 FROM public.citas c
      WHERE c.paciente_id = v_user_id
        AND c.para_titular = FALSE
        AND REPLACE(COALESCE(c.paciente_cedula,''),'-','')
            = REPLACE(p_paciente_cedula,'-','')
        AND c.estado_sync NOT IN ('cancelado','rechazado')
        AND tstzrange(c.fecha_hora_cita, c.fecha_hora_fin, '[)')
            && tstzrange(p_fecha_hora_cita, v_fecha_hora_fin, '[)')
    ) THEN
      RAISE EXCEPTION 'PATIENT_BUSY' USING ERRCODE = 'P0001';
    END IF;
  END IF;
END IF;
```

### Mapeo de error cliente

`lib/citas/errors.ts`:

```ts
PATIENT_BUSY: { status: 409, i18nKey: 'Errors.citas.patient_busy' },
```

### i18n

- `Errors.citas.patient_busy` (ES): "Ya tienes otra cita agendada que se traslapa con este horario. Cancela la cita existente antes de agendar otra."
- (EN): "You already have another appointment that overlaps with this time. Cancel the existing appointment before booking another."

### Notas

- No se modifica `obtener_slots_disponibles` (no filtra por paciente). El usuario verá un toast al intentar confirmar — el wizard ya maneja errores del RPC. Si en el futuro se quiere filtrar visualmente, es un cambio independiente.
- No se añade índice único físico; el advisory lock + SELECT en transacción cubre la concurrencia con el mismo nivel de garantía que el check existente del doctor.

---

## #5 — Mostrar ubicación en CitaCard del miembro

**Bug:** Las cards de "Próximas citas" no muestran dónde será cada cita.

### Cambios

En `components/dashboard/miembro/citas/CitaCard.tsx`:

- Agregar nuevo bloque entre el bloque de servicio (línea ~67-71) y el bloque de paciente (línea ~74-78):

```tsx
{cita.ubicacion?.nombre && (
  <div className="flex items-start gap-1.5 text-neutral">
    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-secondary" />
    <div className="min-w-0">
      <p className="text-xs font-roboto font-medium text-gray-700 truncate">
        {cita.ubicacion.nombre}
      </p>
      {cita.ubicacion.direccion && (
        <p className="text-[11px] font-roboto text-gray-400 truncate">
          {cita.ubicacion.direccion}
        </p>
      )}
    </div>
  </div>
)}
```

- Importar `MapPin` desde `lucide-react`.

### Datos

- Verificar que `MisCitas.tsx` (o el query que alimenta las cards) seleccione `ubicacion:ubicaciones(id, nombre, direccion)` además de los campos actuales. Agregar el join si falta.
- Verificar que `types.ts` de `miembro/citas` ya tipa `ubicacion` con `direccion` (lo está, según el uso en `CitaCard` para el calendario).

### i18n

No requiere strings nuevos (todo es contenido dinámico).

---

## Orden de implementación sugerido

1. **#3** (trivial copy fix) — primer commit para warm-up.
2. **#5** (UI fix) — segundo commit.
3. **#1** (feature interna admin) — backend + frontend.
4. **#2** (refactor UI campanas) — más invasivo pero acotado.
5. **#4** (migración SQL + mapeo errores) — último, requiere `supabase db push` y testing manual con dos citas concurrentes.

## Testing manual

- **#1**: abrir modal de detalle para un titular con consumo registrado y verificar que la tab muestra cuota/usadas/restantes correctamente.
- **#2**: con notificaciones no leídas + avisos no abiertos, verificar que el badge muestra ambos counts. Abrir cada tipo y verificar acciones.
- **#3**: abrir modal admin sobre una cita confirmada, click "Cancelar" → ver los nuevos labels en el footer.
- **#4**: agendar cita con Doctor A a las 8:00. Intentar otra cita con Doctor B a las 8:00 — debe fallar con el toast de `patient_busy`. Repetir con familiar (misma cédula) — debe fallar. Familiar con cédula distinta a la misma hora — debe pasar.
- **#5**: revisar visualmente las cards en "Mis citas" → "Próximas".

## Fuera de scope

- Crear una vista equivalente de "Uso de citas por usuario" dentro del panel del empresa_admin (la tab queda solo en la modal admin de detalle). Si se pide después, es feature aparte.
- Filtrar visualmente los slots disponibles del wizard según conflictos del paciente (la validación server-side basta para corregir el bug).
- Migrar el resto de strings de los componentes tocados; solo se traducen las keys nuevas.
