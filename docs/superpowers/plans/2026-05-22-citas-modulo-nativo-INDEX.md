# Módulo nativo de citas — Índice de planes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each phase task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`../specs/2026-05-22-citas-modulo-nativo-design.md`](../specs/2026-05-22-citas-modulo-nativo-design.md)
**Branch:** `feat/citas-modulo-nativo`
**Estrategia:** Opción B — 5 fases mergeables, cada una independientemente desplegable.

---

## Orden de ejecución

Ejecutar fases **en orden estricto**. Cada fase asume que las anteriores ya están en `main` (o al menos en el branch de feature, si se decide mergear todo de una sola vez al final).

1. **[Fase 1 — Schema + RPCs](./2026-05-22-citas-modulo-nativo-fase1-schema.md)**
   Migraciones, tablas nuevas, RPC atómica de booking, índices, RLS, seed.
   *Después de fase 1 el bug de duplicados ya queda mitigado a nivel DB aunque el wizard siga llamando a EA.*

2. **[Fase 2 — Backend endpoints](./2026-05-22-citas-modulo-nativo-fase2-backend.md)**
   Route handlers que envuelven las RPC. Endpoints nuevos de disponibilidad,
   confirmar, rechazar, cancelar. Eliminación de `app/api/ea/`.

3. **[Fase 3 — Wizard del miembro](./2026-05-22-citas-modulo-nativo-fase3-wizard.md)**
   Refactor de los 8 pasos del wizard. Suscripción Realtime. Aviso de
   concurrencia. Actualización de `MisCitas`, `CitaCard`, `ProximaCitaCard`.

4. **[Fase 4 — Dashboard admin](./2026-05-22-citas-modulo-nativo-fase4-admin.md)**
   CRUD de ubicaciones, servicios, doctores (con horarios y excepciones).
   Vista calendario con `@fullcalendar/react`. Endpoints admin.

5. **[Fase 5 — Notificaciones + .ics](./2026-05-22-citas-modulo-nativo-fase5-notificaciones.md)**
   Tabla `cita_eventos`, trigger, edge function `procesar_eventos_cita`,
   Resend, helper `.ics`, botones de calendario, recordatorio 24h con
   `pg_cron`, campana in-app.

---

## Dependencias entre fases

| Fase | Depende de | Razón |
|------|-----------|-------|
| 1 | — | Punto de entrada |
| 2 | 1 | Necesita las RPCs creadas |
| 3 | 2 | Wizard llama a los endpoints |
| 4 | 1 | Necesita las tablas; los endpoints CRUD pueden ir aquí o en fase 2 |
| 5 | 1, 2 | Necesita tablas y endpoint `/api/citas/[id]/ics` |

Fases 3 y 4 son técnicamente independientes entre sí (una toca el wizard de
miembro, la otra el dashboard admin). Si quieres paralelizar, fase 4 puede
comenzar inmediatamente después de fase 1 mientras alguien más trabaja fase 3
sobre fase 2.

## Convenciones aplicadas en todos los planes

- **Migraciones:** `supabase/migrations/YYYYMMDDHHMMSS_short_description.sql`,
  aplicadas con `supabase db push`.
- **Tipo-checking:** `pnpm build` (incluye `tsc`) al final de cada fase.
- **Lint:** `pnpm lint`.
- **i18n:** toda cadena nueva en `messages/es.json` y `messages/en.json`
  simultáneamente. Sin strings hardcodeados.
- **Commits:** uno por step lógico (no batch de toda una task).
- **Toasts:** `sonner` exclusivamente.
- **Auth en route handlers:** patrón `assertAdmin` / role check al inicio
  (ver `CLAUDE.md`).

## Variables de entorno

**Nuevas (introducidas en fase 5):**
```
RESEND_API_KEY=
EMAIL_FROM=
```

**A eliminar (fase 5, después de borrar `app/api/ea/`):**
```
NEXT_PUBLIC_EA_API_URL
EA_API_KEY
```

## Dependencias npm a instalar

**Fase 4:**
```bash
pnpm add @fullcalendar/react @fullcalendar/core @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
```

**Fase 5:**
```bash
pnpm add resend
```
