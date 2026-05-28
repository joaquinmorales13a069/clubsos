# Claude Design Prompts Blueprint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce `docs/design/claude-design-prompts.md`, a curated catalog of prompts to feed into Claude Design that will produce a redesigned UI for clubSOS — no modals for forms, mobile-first, 3:1 table pattern, consolidated wizards, redesigned role homes.

**Architecture:** A single markdown deliverable assembled section-by-section, with commits between each section. The first two sections (Design System + Transversal Patterns) define reusable vocabulary that all subsequent screen prompts reference by name. Each screen prompt follows a single template (defined in the spec § 6) so an external consumer can paste prompts into Claude Design without further context.

**Tech Stack:** Markdown only. No code touched. Reference doc: `docs/superpowers/specs/2026-05-28-claude-design-prompts-design.md`.

**Reference for screen content** (existing components/pages — open them while writing prompts to capture actual sections, data, and actions):
- Homes: `components/dashboard/admin/AdminInicio.tsx`, `components/dashboard/empresa/EmpresaInicio.tsx`, `app/[locale]/(dashboard)/dashboard/page.tsx`
- Wizard citas: `components/dashboard/miembro/citas/steps/Paso{Paciente,Servicio,Ubicacion,Doctor,Fecha,Horario,Pago,Transferencia,Confirmar}.tsx`
- Signup: `app/[locale]/(auth)/signup/page.tsx` (588 lines)
- Admin lists: `components/dashboard/admin/Admin{Doctores,Servicios,Ubicaciones,Empresas,Citas,Beneficios,Documentos,Excepciones,Auditoria,Reportes}*.tsx`
- Empresa: `components/dashboard/empresa/Empresa{Usuarios,Citas,Reportes,Ajustes}*.tsx`
- Miembro: `components/dashboard/miembro/**`

---

## Conventions used in every task

- **File path:** all edits target `docs/design/claude-design-prompts.md` (the deliverable).
- **Commit format:** `docs(design): add prompts for <section>` for additive sections, `docs(design): polish <section>` for cleanups.
- **Verification:** after each task run `wc -l docs/design/claude-design-prompts.md` to confirm the file grew, and skim the rendered preview if available. Then `git diff --stat` to confirm only that file changed.
- **Each screen prompt MUST follow the template** in spec § 6: title, route, role, referenced patterns, project context blurb, screen objective, sections required, mock data, actions, states (loading/empty/error), responsive behavior in 3 breakpoints, hard rules, sibling screens.

---

### Task 1: Create file skeleton with preamble (Section 0)

**Files:**
- Create: `docs/design/claude-design-prompts.md`

- [ ] **Step 1: Create the file with the master heading, table of contents, and Section 0 (Preamble)**

Write the file with this exact content:

````markdown
# Claude Design Prompts — clubSOS Redesign Blueprint

> Catálogo curado de prompts para alimentar **Claude Design** y obtener mockups consistentes que rediseñen la interfaz de clubSOS. Acompaña al spec `docs/superpowers/specs/2026-05-28-claude-design-prompts-design.md`.

## Tabla de contenido

- [0. Preámbulo](#0-preámbulo)
- [1. Design System foundational](#1-design-system-foundational)
- [2. Patrones transversales](#2-patrones-transversales)
- [3. Auth](#3-auth)
- [4. Miembro](#4-miembro)
- [5. Empresa_admin](#5-empresa_admin)
- [6. Admin](#6-admin)
- [7. Wizards expandidos](#7-wizards-expandidos)
- [8. Apéndices](#8-apéndices)

---

## 0. Preámbulo

### 0.1 Cómo usar este archivo con Claude Design

1. **Empieza por el prompt foundational** (§ 1). Pégalo en una sesión nueva de Claude Design para establecer el design system. Genera y guarda los componentes base.
2. **Carga los patrones transversales** (§ 2) en la misma sesión o en una segunda sesión que herede el design system. Estos patrones son referenciados por nombre desde cada prompt de pantalla.
3. **Genera pantallas individuales** en lotes por grupo (auth, miembro, empresa, admin, wizards). Cada prompt es autocontenido pero asume que los patrones de § 1 y § 2 ya están cargados en el contexto.
4. **Itera** sobre los outputs con prompts cortos de refinamiento ("ajusta el espaciado a 24px", "usa el color secundary para el badge", etc.).
5. **Exporta** los mockups aprobados como referencia para la fase de implementación en código.

### 0.2 Convenciones globales

| Convención | Valor |
|---|---|
| **Identidad** | clubSOS — plataforma médica multi-tenant (empresas + afiliados). |
| **Brand primario** | `#CD2129` rojo (acciones, énfasis, estado activo). |
| **Brand secundario** | `#2266A7` azul (links, info, secondary buttons). |
| **Neutro** | `#616161` gris medio (texto secundario). |
| **Tipografía headers** | Poppins (semibold/bold). |
| **Tipografía body** | Roboto (regular/medium). |
| **Radios** | `rounded-xl` (12px) para cards, `rounded-2xl` (16px) para contenedores grandes. |
| **Sombras** | shadow-sm para cards estándar, glassmorphism sutil (`backdrop-blur` + bg-white/60) para cards flotantes. |
| **Toasts** | Vía `sonner` (success/error/info). Nunca mensajes inline. |
| **Iconos** | `lucide-react`. |
| **Mobile-first** | Breakpoints estándar Tailwind: `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`. |
| **Idioma** | Copy en español por defecto. Los strings reales viven en `messages/{es,en}.json`. |

### 0.3 Reglas duras (aplican a TODOS los prompts)

1. **Cero modales para formularios.** Crear/editar/subir = página dedicada con ruta propia.
2. **Patrón tabla 3:1** (§ 2.2) para todas las listas con detalle. El layout lado a lado se activa solo en `xl+` (≥1280px).
3. **Wizards con stepper sticky-top + summary lateral sticky** en `lg+`. En móvil el summary colapsa a chip bottom + sheet.
4. **Confirmaciones destructivas** = confirm-in-place inline (no modal). Para flujos críticos = página dedicada `/eliminar`.
5. **Sheets móviles** permitidos solo para detalles dentro del patrón 3:1.
6. **Skeleton independiente por sección** en homes y listas (cada bloque carga y muestra skeleton de forma autónoma).
7. **Estados a diseñar siempre:** loading, vacío, error, éxito.

---
````

- [ ] **Step 2: Verify file created and size**

Run:
```bash
wc -l docs/design/claude-design-prompts.md
```
Expected: ~70-80 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add prompts file skeleton and preamble"
```

---

### Task 2: Section 1 — Design System foundational prompt

**Files:**
- Modify: `docs/design/claude-design-prompts.md` (append section 1)

- [ ] **Step 1: Append Section 1 to the file**

Append (do NOT replace anything):

````markdown
## 1. Design System foundational

> Pega este prompt al inicio de tu sesión con Claude Design. Genera el sistema completo de tokens y componentes base que los siguientes prompts asumen ya existen.

### Prompt 1.1 — Design System completo

```
Quiero que generes el sistema de diseño visual para una plataforma médica
llamada clubSOS. Es una app multi-tenant donde empresas registran a sus
empleados (miembros) como afiliados a un plan de salud, y los miembros
agendan citas médicas. Tres roles: admin global, empresa_admin, miembro.

Genera, en este orden:

A. PALETA DE COLORES (semántica)
   - primary: #CD2129 (rojo brand, acciones principales)
   - primary-foreground: white
   - secondary: #2266A7 (azul, links, secondary actions)
   - secondary-foreground: white
   - neutral: #616161 (texto secundario)
   - background: #FAFAFA
   - surface: white
   - surface-elevated: white con shadow-sm
   - border: #E5E7EB
   - muted: #F3F4F6
   - success: #10B981
   - warning: #F59E0B
   - error: #DC2626
   - info: #2266A7

B. TIPOGRAFÍA
   - Headers: Poppins (300, 400, 500, 600, 700)
   - Body: Roboto (300, 400, 500, 700)
   - Escala: h1 32px/40, h2 24px/32, h3 20px/28, h4 18px/26,
     body 16px/24, sm 14px/20, xs 12px/16

C. RADIOS Y ESPACIADO
   - Radios: sm 6px, md 8px, xl 12px, 2xl 16px, full 9999px
   - Espaciado: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 px
   - Container padding: 16px móvil, 24px md, 32px lg+

D. SOMBRAS
   - sm: 0 1px 2px rgb(0 0 0 / 0.05)
   - md: 0 4px 6px -1px rgb(0 0 0 / 0.1)
   - lg: 0 10px 15px -3px rgb(0 0 0 / 0.1)
   - glass: backdrop-blur(12px) + bg-white/60 + border-white/40

E. COMPONENTES BASE (diseña una página showcase con todos)
   1. Button — variantes: primary, secondary, outline, ghost, destructive
      Tamaños: sm, md, lg. Estados: default, hover, active, disabled, loading
   2. Input — text, email, password, search, number; con label arriba,
      helper text debajo, error state con color y mensaje
   3. Select / Combobox — con search interno
   4. Checkbox / Radio / Switch
   5. Textarea con autoresize
   6. Card — variantes: default, elevated, glass, interactive (hover)
   7. Badge / Chip — variantes: default, success, warning, error, info,
      outline; tamaños sm/md
   8. Avatar — con fallback de iniciales, tamaños sm/md/lg
   9. Tabs — horizontal y vertical
  10. Stepper — horizontal con números, estados completado/actual/pendiente
  11. Toast (sonner-style) — success, error, info, warning
  12. Sheet — desliza desde derecha (desktop) y abajo (móvil)
  13. Sidebar — vertical colapsable con grupos y íconos lucide-react
  14. Topbar — con búsqueda global, campana notificaciones, avatar dropdown
  15. EmptyState — ícono grande + título + descripción + CTA
  16. Skeleton — para texto, card, avatar, tabla row
  17. Progress bar y Spinner
  18. Breadcrumbs
  19. Pagination
  20. DatePicker y TimePicker (móvil-friendly)

F. PRINCIPIOS DE INTERACCIÓN
   - Mobile-first siempre
   - Foco visible accesible (ring-2 ring-primary/40)
   - Microinteracciones: transition-all duration-200 ease-out
   - Estados de hover sutiles (no agresivos)
   - Loading inmediato con skeletons (nunca spinner full-screen
     excepto para auth)

Iconografía: lucide-react. Glassmorphism sutil en cards flotantes
(credential card del miembro, modales móviles tipo sheet).

Entrega un mockup tipo "design system showcase" en una sola página
larga que muestre todos los tokens y componentes con sus estados.
```

---
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/design/claude-design-prompts.md`
Expected: section grew by ~95 lines (~165-180 total).

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add design system foundational prompt"
```

---

### Task 3: Section 2 — Transversal patterns (5 patterns)

**Files:**
- Modify: `docs/design/claude-design-prompts.md` (append section 2)

- [ ] **Step 1: Append Section 2 with all 5 patterns**

Append:

````markdown
## 2. Patrones transversales

> Estos 5 patrones son referenciados por nombre desde cada prompt de pantalla. Genera mockups de referencia para cada uno antes de las pantallas.

### Prompt 2.1 — Layout shell (Sidebar + Topbar)

```
Diseña el layout shell de la app clubSOS. Asume el design system ya
cargado (paleta CD2129/2266A7, Poppins/Roboto, rounded-xl).

ESTRUCTURA:
- Sidebar fijo a la izquierda (240px en lg+, 64px colapsado, drawer
  off-canvas en <md).
  Grupos colapsables con divisores sutiles. Cada item: ícono lucide
  18px + label + opcional badge de contador (citas pendientes).
  Item activo: fondo bg-primary/10 + texto primary + barra lateral
  izquierda primary 3px.
- Topbar de 64px alto: búsqueda global (al centro en lg+, ícono en md),
  campana de notificaciones con badge contador, avatar dropdown con
  nombre + rol + logout.
- Contenido principal: padding 16/24/32 según breakpoint,
  max-w-screen-2xl centrado.

RESPONSIVE:
- <md: sidebar oculto, botón hamburguesa en topbar abre drawer.
- md a lg: sidebar colapsado por defecto, expandible.
- lg+: sidebar expandido por defecto.

Genera 3 vistas: móvil cerrado, móvil con drawer abierto, desktop.
```

### Prompt 2.2 — Patrón Tabla 3:1 (lista + panel contextual)

```
Diseña el patrón maestro de "tabla con panel contextual" que clubSOS
usa en todas sus listas de admin/empresa.

ESTRUCTURA (xl+, ≥1280px):
Grid de 4 columnas con gap-6.
- Columnas 1-3: tabla.
  - Toolbar arriba: campo search (lupa izquierda), chips de filtros
    activos, botón "Filtros avanzados", botón primario "+ Nuevo".
  - Tabla con headers sticky, filas seleccionables (radio o checkbox
    para multi), zebra muy sutil, hover bg-muted, fila seleccionada
    bg-primary/5 + border-l-4 border-primary.
  - Paginación abajo derecha.
- Columna 4: panel sticky (top-24, h-fit), bg-surface, rounded-2xl,
  border, padding 24. STATEFUL — tiene 2 modos:

  MODO A (sin selección):
   - Header: "Resumen" + ícono BarChart.
   - 2-3 KPI mini-cards stack vertical (ej: Total, Activos, Pendientes).
   - Divider.
   - Sección "Filtros avanzados" siempre expandida: selects, date
     pickers, switches.
   - Divider.
   - Botones: "Exportar CSV", "Importar".

  MODO B (con selección de una fila):
   - Header: ícono + nombre del registro + botón X cerrar selección.
   - Meta info (4-6 líneas key-value).
   - Divider.
   - Lista vertical de acciones contextuales (cada una con ícono +
     label): Editar, Ver historial, Duplicar, Eliminar (color error).
   - Si la acción Editar requiere página dedicada, navegar a
     /recurso/[id]/editar (NO abrir modal).

RESPONSIVE:
- <md: tabla se vuelve lista de cards verticales (cada fila = card
  rounded-xl con info principal). Toolbar de búsqueda + botón "Filtros"
  arriba. Al tocar una card aparece un sheet inferior (no modal) que
  cubre 70% del viewport con el detalle + acciones contextuales.
- md a xl: tabla ancho completo. KPIs y filtros arriba (en una fila
  horizontal). Cuando hay selección, panel de detalle se ubica debajo
  de la tabla como sección sticky.
- xl+: layout 3:1 lado a lado.

ELIMINAR: usa confirm-in-place — el botón "Eliminar" se transforma en
"¿Confirmar? · Sí · No" en línea. Para flujos críticos (eliminar
empresa, eliminar usuario activo), navegar a página dedicada
/recurso/[id]/eliminar con resumen del impacto.

Genera 4 vistas: móvil sin selección, móvil con sheet abierto,
desktop xl sin selección (modo A), desktop xl con selección (modo B).
```

### Prompt 2.3 — Wizard genérico (stepper + sticky summary)

```
Diseña el patrón maestro de wizard que clubSOS usa para signup y para
agendar citas.

ESTRUCTURA (lg+):
Grid de 3 columnas en md+ (2fr 1fr o 3fr 1fr para summary).

- Top sticky stepper horizontal:
  Bullets numeradas (1, 2, 3, 4, 5) conectadas con líneas.
  Estados: completado (primary lleno + check), actual (primary outline
  + número), pendiente (gris). Click en pasos completados navega de
  vuelta. Below: "Paso 3 de 5: Doctor + Fecha + Horario".

- Columna principal (izquierda, 2/3 o 3/4 del ancho):
  Card grande rounded-2xl, padding 32. Contiene el contenido del paso
  actual. Inputs grandes, labels Poppins semibold, helper text Roboto.
  Validación en vivo: ícono check verde a la derecha del input cuando
  válido; mensaje de error en rojo debajo cuando inválido.
  Smart defaults aplicados con badge "Sugerido" o "Más frecuente".

- Columna derecha (1/3 o 1/4 del ancho):
  Sticky summary card. Header "Resumen de tu cita" / "Resumen de
  registro". Lista de pasos completados con: ícono check verde +
  label del paso + valor seleccionado + botón "Editar" pequeño
  que salta al paso. Pasos pendientes en gris claro con "—".

- Footer sticky-bottom dentro del contenedor:
  Botón secundario "← Anterior" (oculto en paso 1) + spacer +
  botón primario "Continuar →". Botón principal del último paso
  cambia a "Confirmar y enviar" en color primary.

RESPONSIVE:
- <md: stepper colapsa a barra de progreso fina + label "Paso 3 de 5".
  Summary lateral se vuelve chip fijo en bottom: "Ver resumen ↑" con
  contador de pasos completos; al tocar abre sheet inferior con el
  summary completo. Footer de navegación pegado al bottom edge.
- md a lg: summary lateral se mueve debajo del contenido principal
  (no sticky lateral); stepper completo arriba.
- lg+: summary lateral sticky a la derecha.

Genera 3 vistas: móvil con sheet de summary abierto, md sin summary
sidebar, lg+ con summary sticky a la derecha.
```

### Prompt 2.4 — Página-Formulario (reemplaza modal)

```
Diseña el patrón "página-formulario" que clubSOS usa en lugar de
modales para crear/editar entidades.

ESTRUCTURA:
- Breadcrumb arriba: "Doctores / Crear nuevo" con separadores ›.
- Header de página: h1 Poppins bold + subtítulo gris + acciones a la
  derecha (botón "Cancelar" outline + botón primario "Guardar" o
  "Crear").
- Container max-w-3xl centrado para forms simples, max-w-5xl para
  forms con preview lateral.
- Form en card rounded-2xl bg-surface padding 32.
  - Secciones agrupadas con divisores sutiles + título de sección
    Poppins semibold sm uppercase tracking-wide neutral.
  - 1 o 2 columnas según breakpoint (1 col móvil, 2 cols md+ para
    forms anchos).
  - Inputs siguen el design system, con label arriba.
  - Help text debajo de inputs en gris.
- Sticky bottom action bar (en móvil): "Cancelar" + "Guardar".
- Validación: en vivo al perder foco; resumen de errores en banner
  arriba si hay errores al intentar enviar.
- Loading state: botón "Guardar" muestra spinner + label
  "Guardando…" + estado disabled de todos los inputs.
- Success: toast verde "Creado exitosamente" + redirect a la lista.

RESPONSIVE:
- <md: 1 columna. Action bar sticky bottom con dos botones full-width.
  Padding container 16px.
- md+: hasta 2 columnas dentro del form. Action bar en el header.

Genera 2 vistas: móvil con form largo, desktop con form en 2 cols.
```

### Prompt 2.5 — Estados (Empty / Skeleton / Error / Confirm-in-place)

```
Diseña los 4 estados auxiliares que clubSOS usa en toda la app.

A. EMPTY STATE
   - Ícono grande (lucide, 64px, color neutral-300) centrado.
   - Título Poppins semibold xl.
   - Descripción Roboto sm neutral.
   - CTA primary button con ícono +.
   Padding 64 vertical. Variantes para: tabla vacía, lista vacía,
   búsqueda sin resultados, primera vez (onboarding).

B. SKELETON
   - Tabla: 5 filas con cells animadas (animate-pulse, bg-muted,
     rounded).
   - Card: bloque rounded con líneas de texto skeleton.
   - KPI: número 32px + label sm skeleton.
   - Wizard step: 3 grupos de inputs skeleton.

C. ERROR STATE
   - Ícono AlertTriangle 64px color error.
   - Título "Algo salió mal".
   - Descripción técnica corta + sugerencia ("Intenta recargar o
     contacta soporte").
   - Botón outline "Reintentar" + link "Contactar soporte".

D. CONFIRM-IN-PLACE
   - Al hacer click en "Eliminar" (botón ghost color error), el
     botón se transforma in-place en un mini-row:
     "¿Confirmar eliminación? · [Sí, eliminar] · [Cancelar]"
   - Sí: botón pequeño bg-error text-white.
   - Cancelar: botón pequeño ghost.
   - Sin overlay, sin modal. Transición suave 200ms.

Genera una sola página de showcase con los 4 estados en grid 2x2.
```

---
````

- [ ] **Step 2: Verify section length**

Run: `wc -l docs/design/claude-design-prompts.md`
Expected: file grew by ~250 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add 5 transversal patterns (shell, table, wizard, page-form, states)"
```

---

### Task 4: Section 3 — Auth (3 prompts: Login, Signup overview, MFA)

**Files:**
- Modify: `docs/design/claude-design-prompts.md` (append section 3)

**Reference:** Open `app/[locale]/(auth)/login/page.tsx`, `app/[locale]/(auth)/signup/page.tsx`, `app/[locale]/mfa/verificar/page.tsx` to capture actual fields, copy and flow.

- [ ] **Step 1: Append Section 3**

For each of the 3 screens follow the template (spec § 6). Append:

````markdown
## 3. Auth

### 3.1 Login

**Ruta:** `/{locale}/login`
**Rol:** público
**Patrones referenciados:** Design System

**Prompt:**

```
clubSOS es una plataforma médica multi-tenant. Brand: rojo #CD2129 +
azul #2266A7. Poppins/Roboto.

Diseña la pantalla de Login.

OBJETIVO: usuario ingresa con email + password. Soporta login con
Google. Si tiene MFA, redirige a /mfa/verificar después de auth.

SECCIONES (split-screen lg+, stack móvil):
- IZQUIERDA (form, 5/12 del ancho lg+, 100% móvil):
  - Logo clubSOS arriba.
  - h1 "Bienvenido de vuelta".
  - Subtítulo "Ingresa para gestionar tus citas y beneficios".
  - Botón "Continuar con Google" (outline + ícono Google) full-width.
  - Divider "o continúa con email".
  - Input email + input password (con toggle mostrar/ocultar).
  - Link "¿Olvidaste tu contraseña?" alineado a la derecha, sm,
    color secondary.
  - Botón primary full-width "Ingresar".
  - Texto pie: "¿No tienes cuenta? Regístrate" con link a /signup.

- DERECHA (brand, 7/12 lg+, oculto <lg):
  - Background gradient sutil primary→secondary o imagen médica
    abstracta.
  - Card flotante glass con quote testimonial o feature highlight:
    "Agenda tus citas médicas con un solo toque" + ícono CalendarCheck.
  - Footer pequeño con badges de seguridad (HIPAA-like).

ESTADOS:
- Loading: botón "Ingresar" muestra spinner + "Ingresando…", inputs
  disabled.
- Error: banner rojo arriba del form con mensaje
  ("Credenciales inválidas") + form vuelve a estar editable.

RESPONSIVE:
- <md: solo columna izquierda, padding 24, logo arriba, todo
  centrado verticalmente.
- md a lg: igual a móvil pero max-w-md centrado.
- lg+: split 5/7.

REGLAS: sin modales. Toasts con sonner para success. Toggle de
mostrar password con íconos Eye/EyeOff.
```

---

### 3.2 Signup — overview wizard

**Ruta:** `/{locale}/signup`
**Rol:** público
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña la pantalla overview del Signup wizard para clubSOS (los 5
pasos individuales se detallan en § 7.6-7.10).

OBJETIVO: usuario nuevo se registra como afiliado. 5 pasos cortos
con validación en vivo y resumen editable al final.

LAYOUT: split-screen como Login (5/7 lg+).

IZQUIERDA (form column):
- Logo clubSOS arriba.
- Stepper horizontal (5 pasos) en sticky-top.
- Contenido del paso actual (renderizado del prompt correspondiente
  de § 7).
- Footer "← Anterior" + "Continuar →".

DERECHA (brand column, oculto <lg):
- Visual con beneficios del programa:
  1. ✓ Citas médicas en 24h
  2. ✓ Beneficios exclusivos
  3. ✓ Documentos digitales seguros
  4. ✓ Familia incluida
- Cada item con ícono lucide + texto.
- Card flotante glass con resumen del progreso del usuario.

RESPONSIVE:
- <md: solo columna izquierda, stepper colapsa a barra de progreso
  fina + "Paso X de 5".
- md a lg: igual a móvil + max-w-xl.
- lg+: split 5/7 con brand a la derecha.

ESTADOS:
- Loading global durante envío final: spinner + "Creando tu cuenta…".
- Error: banner arriba del paso con mensaje.

REGLAS: sin modales. Cada paso es un prompt individual de § 7.
Stepper permite volver atrás (click) pero no saltar hacia adelante.
```

---

### 3.3 MFA — Verificar / Enrolar

**Ruta:** `/{locale}/mfa/verificar`
**Rol:** público (post-login con MFA enrolado) / autenticado (para enrolar)
**Patrones referenciados:** Design System

**Prompt:**

```
Diseña 2 pantallas MFA para clubSOS:

A. VERIFICAR (post-login si MFA enrolado)
   - Layout centrado, max-w-md.
   - Logo clubSOS arriba.
   - h1 "Verificación en dos pasos".
   - Subtítulo "Ingresa el código de 6 dígitos de tu app de
     autenticación".
   - Input OTP de 6 celdas (1 dígito por celda, auto-jump al
     siguiente, paste detecta los 6 dígitos).
   - Botón primary full-width "Verificar".
   - Link sm "Usar código de respaldo" → muestra input alternativo.
   - Link xs "Cerrar sesión" abajo en gris.

B. ENROLAR (desde ajustes o post-signup)
   - h1 "Activa autenticación en dos pasos".
   - Subtítulo "Escanea el QR con tu app".
   - QR code centrado (256px).
   - Texto pequeño con código manual para copiar (monoespaciado).
   - Input OTP de 6 dígitos para confirmar.
   - Botón primary "Activar 2FA".
   - Link "Saltar por ahora" en gris (solo en flujo post-signup).

ESTADOS:
- Loading: spinner en botón.
- Error: input OTP se pone rojo + mensaje "Código incorrecto.
  Intenta de nuevo".
- Éxito: toast verde + redirect a /dashboard.

RESPONSIVE:
- <md: padding 16, OTP cells más pequeñas.
- md+: max-w-md, padding 32.

REGLAS: sin modales. Toast con sonner para success.
```

---
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/design/claude-design-prompts.md`
Expected: file grew by ~180 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add auth prompts (login, signup, mfa)"
```

---

### Task 5: Section 4.1 — Home miembro

**Files:**
- Modify: `docs/design/claude-design-prompts.md`

**Reference:** `app/[locale]/(dashboard)/dashboard/page.tsx`, `components/dashboard/miembro/{CredentialCard,QuickActions,ProximaCitaCard,RecentBeneficiosCard,RecentDocumentosCard,RecentAvisosCard,MisServiciosCubiertos}.tsx`

- [ ] **Step 1: Append Section 4 header and 4.1**

````markdown
## 4. Miembro

### 4.1 Home miembro

**Ruta:** `/{locale}/dashboard`
**Rol:** miembro
**Patrones referenciados:** Layout shell, Design System

**Prompt:**

```
Diseña el Home del miembro de clubSOS. Tres roles: admin, empresa_admin,
miembro. Este es para miembro (el afiliado al plan de salud).

OBJETIVO: dashboard personal con su carnet digital, próxima cita,
quick actions y resúmenes de sus avisos/beneficios/documentos.

SECCIONES (de arriba abajo):

1. MFA BANNER (condicional, solo si no enrolado):
   - Banner amarillo warning con ícono ShieldAlert.
   - Texto "Protege tu cuenta con autenticación en dos pasos".
   - Botón outline "Activar ahora" link a /mfa/verificar.

2. HERO + CREDENTIAL CARD
   - Layout grid (md): 7/12 hero + 5/12 credential card.
   - Hero: "Hola, [Nombre]" h1 Poppins bold 32px con [Nombre]
     en color primary. Subtítulo Roboto neutral.
   - Credential card flotante (glass): tarjeta tipo carnet con
     - Foto/iniciales del miembro (avatar 64px).
     - Nombre completo.
     - Empresa.
     - Número de afiliado (badge sm).
     - Background gradient primary→secondary muy sutil con
       backdrop-blur. Rotación leve 1-2deg en hover.

3. PRÓXIMA CITA (card destacada)
   - Si existe: card grande con
     - Ícono CalendarClock 40px en círculo primary/10.
     - Badge de estado (pendiente, confirmado).
     - Servicio + doctor + ubicación.
     - Fecha y hora formato amigable.
     - Acciones: "Ver detalles" + "Agregar a calendario" (dropdown
       con Google/Outlook/Apple/.ics).
   - Si no existe: empty state con "No tienes citas próximas" +
     CTA "Pedir nueva cita" link a /citas/nueva.

4. QUICK ACTIONS ROW (4 pills)
   - Grid grid-cols-2 md:grid-cols-4 gap-4.
   - Cada pill: card rounded-2xl con ícono lucide 32 + label
     Poppins semibold.
   - Acciones: Pedir cita (CalendarPlus), Ver beneficios (Gift),
     Mis documentos (FileText), Mi familia (Users).

5. GRID DE RESÚMENES (md+: 3 cols)
   A. ÚLTIMOS AVISOS (2 items)
      - Header con título + link "Ver todos →".
      - Lista de cards mini con título + fecha relativa + dot status.
   B. BENEFICIOS RECIENTES (3 items)
      - Header + link.
      - Mini cards horizontales con ícono + título + fecha fin.
   C. DOCUMENTOS RECIENTES (3 items)
      - Header + link.
      - Lista con ícono tipo archivo + nombre + fecha + botón
        descargar mini.

6. MIS SERVICIOS CUBIERTOS (sección expandida)
   - Header "Servicios incluidos en tu plan".
   - Lista de cards horizontales con:
     - Ícono del servicio.
     - Nombre.
     - Uso actual (ej: 3/12 visitas).
     - Barra de progreso.
   - Cada card clickeable a detalle del servicio.

ESTADOS:
- Skeleton independiente por sección (no skeleton global).
- Empty state para Próxima cita y para cada lista vacía.
- Error: cada bloque puede fallar sin romper los demás.

RESPONSIVE:
- <md: 1 columna stack, credential card debajo del hero.
- md: 2 cols para hero+credential y para resúmenes (los 3 resúmenes
  apilados de a 2).
- lg+: layout completo con 3 cols en resúmenes.

REGLAS: sin modales. Toasts con sonner. Mobile-first.
```

---
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/design/claude-design-prompts.md`
Expected: grew by ~90 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add miembro home prompt"
```

---

### Task 6: Sections 4.2–4.10 — Miembro screens (citas list + 7 more)

**Files:**
- Modify: `docs/design/claude-design-prompts.md`

**Reference:**
- 4.2 citas: `components/dashboard/miembro/citas/{MisCitas,CitaCard,CitaEstadoBadge,AgregarACalendario}.tsx`
- 4.3 wizard cita: see Section 7.1-7.5 individual steps; this is the overview/container.
- 4.4 avisos: `components/dashboard/miembro/avisos/MisAvisos.tsx`
- 4.5 aviso detalle: convert `AvisoDetailModal.tsx` to page at `/avisos/[id]`
- 4.6 beneficios: `components/dashboard/miembro/beneficios/{BeneficiosGrid,BeneficioCard}.tsx`
- 4.7 beneficio detalle: convert `BeneficioDetailModal.tsx` to page at `/beneficios/[id]`
- 4.8 documentos: `components/dashboard/miembro/documentos/{MisDocumentos,DocumentoCard}.tsx`
- 4.9 familia: `components/dashboard/miembro/familia/MiFamilia.tsx`
- 4.10 ajustes: `components/dashboard/miembro/ajustes/AjustesForm.tsx`

- [ ] **Step 1: Append all 9 sub-sections (4.2 through 4.10)**

For each follow the template (route, rol, patrones referenciados, prompt with secciones / estados / responsive / reglas). Below is the exact content to append:

````markdown
### 4.2 Mis citas (lista)

**Ruta:** `/{locale}/dashboard/citas`
**Rol:** miembro
**Patrones referenciados:** Tabla 3:1 (variante simplificada para móvil), Design System

**Prompt:**

```
Diseña la pantalla "Mis citas" del miembro.

OBJETIVO: ver todas las citas del miembro (pasadas, próximas,
canceladas) con filtros y acción de pedir nueva cita.

SECCIONES:
1. Header de página:
   - h1 "Mis citas" + subtítulo "Gestiona tus citas médicas".
   - Botón primary derecha: "+ Pedir nueva cita" link a
     /citas/nueva (NO modal — es página).

2. Tabs de filtro: "Próximas" (default) · "Pasadas" · "Canceladas".
   Tabs subrayadas en primary cuando activas. Cada tab muestra
   contador.

3. Lista de citas (card list, NO tabla — el miembro tiene pocas):
   Cada card rounded-2xl con:
   - Avatar/ícono del servicio (24px) en círculo color del estado.
   - Servicio + doctor (Poppins semibold).
   - Ubicación + fecha/hora (Roboto sm).
   - Badge de estado a la derecha: pendiente (amarillo),
     pendiente_admin (azul), confirmado (verde), completado (gris),
     cancelado (rojo), rechazado (rojo).
   - Acciones derecha: "Ver detalle" (link a /citas/[id]) +
     dropdown "Agregar a calendario" (Google/Outlook/Apple/.ics) +
     "Cancelar" (solo si dentro de ventana).

ESTADOS:
- Skeleton: 4 cards skeleton.
- Empty (por tab): EmptyState con CTA "Pedir cita".
- Error: ErrorState con reintentar.

CANCELAR: confirm-in-place — botón "Cancelar" se transforma en
"¿Confirmar cancelación? · [Sí] · [No]". NO modal. Validar ventana
(default 24h antes) en cliente y mostrar mensaje si fuera.

RESPONSIVE:
- <md: cards full-width, acciones colapsan en menú "..." con sheet.
- md+: cards en 1 columna max-w-4xl centradas.

REGLAS: sin modales. Toasts con sonner.
```

---

### 4.3 Wizard nueva cita (overview)

**Ruta:** `/{locale}/dashboard/citas/nueva`
**Rol:** miembro
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña el overview del wizard de "Pedir nueva cita" del miembro
de clubSOS. 5 pasos consolidados (los detalles de cada paso están
en § 7.1-7.5).

OBJETIVO: agendar una cita médica nueva con stepper claro, summary
sticky lateral y smart defaults.

LAYOUT: usa el patrón Wizard de § 2.3.
- Stepper 5 pasos arriba sticky:
  1. Paciente · 2. Servicio + Ubicación · 3. Doctor + Fecha + Horario
  · 4. Pago · 5. Confirmar.
- Columna principal: contenido del paso (renderizado del prompt
  correspondiente de § 7.1-7.5).
- Columna lateral derecha (lg+): summary sticky con lista de pasos
  completados + botones editar.
- Footer "← Anterior" + "Continuar →" / "Confirmar y enviar".

EXTRAS:
- Badge "Sugerido" en items autoseleccionados (1 sola ubicación,
  1 solo doctor, fecha más próxima).
- Stepper permite volver a pasos completados con click.
- En móvil el summary lateral colapsa a chip "Ver resumen ↑" en
  bottom que abre sheet.

ESTADOS:
- Loading durante envío final: spinner en botón "Confirmar" +
  "Creando tu cita…".
- Error: banner arriba del paso (ej: "El horario ya no está
  disponible. Selecciona otro.").
- Éxito: redirect a /citas con toast "Cita creada exitosamente".

REGLAS: sin modales. Validación en vivo. Smart defaults siempre.
```

---

### 4.4 Mis avisos

**Ruta:** `/{locale}/dashboard/avisos`
**Rol:** miembro
**Patrones referenciados:** Design System

**Prompt:**

```
Diseña la pantalla "Mis avisos" del miembro.

OBJETIVO: ver avisos publicados por su empresa o por el admin global.

SECCIONES:
1. Header: h1 "Avisos" + subtítulo + chip contador "X sin leer".
2. Tabs: "Todos" · "Sin leer" · "Archivados".
3. Lista de avisos como cards:
   - Card horizontal con:
     - Indicator dot izquierda (primary si sin leer, gris si leído).
     - Título Poppins semibold + extracto Roboto sm 2 líneas truncado.
     - Fecha relativa abajo derecha.
     - Click navega a /avisos/[id] (página, NO modal).
4. Pagination si > 20.

ESTADOS:
- Skeleton 5 cards.
- Empty: EmptyState "No tienes avisos aún".
- Error: ErrorState.

RESPONSIVE:
- <md: cards full-width.
- md+: lista max-w-4xl centrada.

REGLAS: sin modales. Click va a página detalle.
```

---

### 4.5 Aviso detalle (página, reemplaza modal)

**Ruta:** `/{locale}/dashboard/avisos/[id]`
**Rol:** miembro
**Patrones referenciados:** Design System

**Prompt:**

```
Diseña la página de detalle de un aviso (reemplaza el modal actual).

OBJETIVO: leer un aviso completo con su contenido enriquecido.

SECCIONES:
1. Breadcrumb: "Avisos / [Título del aviso truncado]".
2. Header:
   - Botón outline "← Volver" arriba izquierda.
   - h1 Título del aviso (Poppins bold 28px).
   - Meta: autor (empresa o admin) + fecha + chip de categoría.
3. Contenido principal (max-w-3xl):
   - Body con prose tipography (paragraphs, lists, links).
   - Imágenes embebidas si las hay.
4. Sidebar (lg+ a la derecha):
   - Card "Más avisos" con 3 avisos relacionados/recientes.
   - Card "Acciones": marcar como archivado, compartir.

ESTADOS:
- Skeleton del contenido.
- Error 404: "Aviso no encontrado" + link volver.

RESPONSIVE:
- <md: sin sidebar, sidebar al final del contenido.
- md a lg: igual móvil.
- lg+: layout con sidebar.

REGLAS: sin modales. Marca como leído al cargar (cliente).
```

---

### 4.6 Mis beneficios

**Ruta:** `/{locale}/dashboard/beneficios`
**Rol:** miembro
**Patrones referenciados:** Design System

**Prompt:**

```
Diseña la pantalla "Mis beneficios" del miembro.

OBJETIVO: explorar beneficios disponibles según su empresa.

SECCIONES:
1. Header h1 + subtítulo + chip "X beneficios activos".
2. Toolbar:
   - Search input "Buscar beneficio…".
   - Filtros chip: "Todos", "Salud", "Bienestar", "Educación",
     "Otros" (categorías).
3. Grid de beneficios (3 cols md, 4 cols xl):
   - BeneficioCard:
     - Imagen del beneficio (aspect-video, rounded-t-2xl).
     - Badge categoría arriba.
     - Título Poppins semibold.
     - Descripción Roboto sm 2 líneas truncada.
     - Fecha fin "Vigente hasta X" sm gris.
     - Botón outline "Ver detalles" link a /beneficios/[id].

ESTADOS:
- Skeleton de 8 cards.
- Empty: EmptyState "No hay beneficios activos para tu empresa".
- Error: ErrorState.

RESPONSIVE:
- <md: 1 col.
- md: 2 cols.
- lg: 3 cols.
- xl: 4 cols.

REGLAS: sin modales. Click va a /beneficios/[id].
```

---

### 4.7 Beneficio detalle (página)

**Ruta:** `/{locale}/dashboard/beneficios/[id]`
**Rol:** miembro
**Patrones referenciados:** Design System

**Prompt:**

```
Diseña la página de detalle de un beneficio (reemplaza el modal
actual).

OBJETIVO: ver descripción completa, cómo usarlo y código/cupón si
aplica.

SECCIONES:
1. Breadcrumb: "Beneficios / [Título]".
2. Header con botón "← Volver".
3. Layout (md+: 2 cols, 2/3 + 1/3):
   - IZQ:
     - Imagen grande del beneficio (aspect-video, rounded-2xl).
     - Título h1.
     - Descripción larga prose.
     - Sección "¿Cómo usarlo?" con pasos numerados.
     - Términos y condiciones (collapsible).
   - DER (sidebar):
     - Card "Información":
       - Categoría (badge).
       - Vigencia.
       - Establecimiento/proveedor.
     - Card "Tu beneficio":
       - Si tiene código: código grande monoespaciado +
         botón "Copiar" inline.
       - Botón primary "Activar / Reclamar".
     - Card "Ubicaciones" si aplica.

ESTADOS:
- Skeleton.
- Error 404.
- Beneficio expirado: banner gris arriba "Este beneficio venció el X".

RESPONSIVE:
- <md: sidebar al final, full-width.
- md+: 2 cols.

REGLAS: sin modales. Toast de éxito al copiar código.
```

---

### 4.8 Mis documentos

**Ruta:** `/{locale}/dashboard/documentos`
**Rol:** miembro
**Patrones referenciados:** Design System

**Prompt:**

```
Diseña la pantalla "Mis documentos" del miembro.

OBJETIVO: ver y descargar documentos médicos personales.

SECCIONES:
1. Header h1 + subtítulo.
2. Toolbar:
   - Search "Buscar documento…".
   - Filtros: tipo de documento (chips), año (select).
3. Lista o grid (toggle):
   - DocumentoCard:
     - Ícono grande tipo archivo (PDF, imagen).
     - Nombre del documento Poppins semibold.
     - Tipo (badge) + fecha del documento.
     - Acciones: descargar (ícono Download) + previsualizar (ícono
       Eye) si es PDF/imagen.
4. Pagination.

ESTADOS:
- Skeleton 6 cards.
- Empty: EmptyState "Tu empresa aún no ha subido documentos".
- Error: ErrorState.

PREVIEW: cuando se hace click en preview de PDF/imagen, abre en una
nueva pestaña o navega a /documentos/[id]/ver (NO modal). Para
documentos pequeños se puede usar un sheet inferior móvil con
viewer embedded.

RESPONSIVE:
- <md: 1 col cards.
- md: 2 cols.
- lg+: 3 cols.

REGLAS: sin modales para subir (el miembro no sube — solo admin).
```

---

### 4.9 Mi familia

**Ruta:** `/{locale}/dashboard/familia`
**Rol:** miembro
**Patrones referenciados:** Página-Formulario, Design System

**Prompt:**

```
Diseña la pantalla "Mi familia" del miembro.

OBJETIVO: gestionar familiares incluidos en el plan.

SECCIONES:
1. Header:
   - h1 "Mi familia" + chip "X / Y miembros usados".
   - Botón primary "+ Agregar familiar" navega a
     /familia/nuevo (página, no modal).
2. Barra de progreso de cupos usados (si el plan tiene límite).
3. Grid de familiares (2 cols md, 3 cols lg):
   - FamiliarCard:
     - Avatar con iniciales 56px.
     - Nombre completo Poppins semibold.
     - Relación (Hijo/a, Cónyuge, Padre/Madre, etc.) badge.
     - Fecha de nacimiento + edad.
     - Acciones: Editar (link a /familia/[id]/editar) + Eliminar
       (confirm-in-place).

ESTADOS:
- Skeleton 4 cards.
- Empty: EmptyState "Agrega familiares para incluirlos en tu plan".
- Error: ErrorState.
- Cupo lleno: banner amarillo "Has alcanzado el límite de
  familiares. Contacta a tu empresa para ampliar."

RESPONSIVE:
- <md: 1 col.
- md+: 2-3 cols.

REGLAS: agregar/editar van a páginas dedicadas. Eliminar es
confirm-in-place.
```

---

### 4.10 Mis ajustes

**Ruta:** `/{locale}/dashboard/ajustes`
**Rol:** miembro
**Patrones referenciados:** Página-Formulario, Design System

**Prompt:**

```
Diseña la pantalla "Mis ajustes" del miembro (es una página de
configuración personal, NO un modal).

OBJETIVO: editar datos personales, contraseña, MFA, preferencias.

LAYOUT:
- Sidebar izquierdo (lg+): navegación interna de secciones
  ("Perfil", "Seguridad", "Notificaciones", "Idioma").
- Contenido principal: formulario de la sección actual.

SECCIONES (cada una es un form en card propia):
1. PERFIL:
   - Avatar con botón "Cambiar foto" debajo.
   - Nombre completo, cédula (readonly), email (readonly),
     teléfono, fecha nacimiento, sexo.
   - Botón "Guardar cambios" derecha del header de sección.
2. SEGURIDAD:
   - Cambiar contraseña: campos actual + nueva + confirmar +
     medidor de fortaleza.
   - MFA: estado actual + botón activar/desactivar (lleva a
     /mfa/verificar para enrolar).
   - Sesiones activas: lista con dispositivo + ubicación + última
     actividad + botón "Cerrar".
3. NOTIFICACIONES:
   - Switches: Email · WhatsApp · In-app por categoría
     (citas, avisos, beneficios).
4. IDIOMA:
   - Select: Español · English.

ESTADOS:
- Loading global al guardar: spinner en botón + disabled inputs.
- Toast verde "Guardado" con sonner.
- Error: banner rojo arriba del form.

RESPONSIVE:
- <md: navegación lateral colapsa a tabs horizontales con scroll-x.
- md+: sidebar lateral + contenido.

REGLAS: sin modales. Cada sección guarda independientemente.
```

---
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/design/claude-design-prompts.md`
Expected: grew by ~360 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add 9 miembro prompts (citas, avisos, beneficios, documentos, familia, ajustes)"
```

---

### Task 7: Section 5 — Empresa_admin (5 prompts)

**Files:**
- Modify: `docs/design/claude-design-prompts.md`

**Reference:**
- 5.1 home: `components/dashboard/empresa/EmpresaInicio.tsx` + subcomponents
- 5.2 citas: `components/dashboard/empresa/EmpresaCitasRegistro.tsx`
- 5.3 usuarios: `components/dashboard/empresa/{EmpresaUsuarios,EditarUsuarioModal,DetalleModal}.tsx`
- 5.4 reportes: `components/dashboard/empresa/EmpresaReportes.tsx`
- 5.5 ajustes: `components/dashboard/empresa/EmpresaAjustes.tsx`

- [ ] **Step 1: Append Section 5**

````markdown
## 5. Empresa_admin

### 5.1 Home empresa

**Ruta:** `/{locale}/dashboard/empresa`
**Rol:** empresa_admin
**Patrones referenciados:** Layout shell, Design System

**Prompt:**

```
Diseña el Home del empresa_admin de clubSOS. Es el administrador de
una empresa cliente que gestiona a sus miembros afiliados.

OBJETIVO: dashboard ejecutivo de la empresa con KPIs, uso de
contratos, citas pendientes y miembros recientes.

SECCIONES:
1. Hero saludo:
   - "Hola, [Nombre]" h1.
   - Subtítulo "Panel de [Nombre Empresa]".

2. CARD DESTACADA: Uso de contratos
   - Background gradient sutil secondary→primary muy claro.
   - Título "Uso del contrato".
   - Métricas: Contratados X / Activos Y / Disponibles Z.
   - Barra de progreso grande (h-4 rounded-full).
   - Texto pequeño "Renovación: dd/mm/aaaa".

3. ALERT BANNER (condicional, si citas_pendientes > 0):
   - Banner amarillo warning con AlertTriangle + texto
     "Tienes X citas pendientes de aprobación" + botón "Revisar".

4. KPI CARDS (grid 2x2 móvil, 4x1 md+):
   - Total miembros
   - Miembros activos
   - Miembros pendientes (color warning si > 0)
   - Citas del mes
   Cada card: ícono lucide 24 en círculo color/10, número 32px
   Poppins bold, label sm Roboto neutral.

5. QUICK ACTIONS ROW (3 pills):
   - "Nuevo miembro" (UserPlus) link a /empresa/usuarios/nuevo
   - "Ver reportes" (BarChart) link a /empresa/reportes
   - "Ajustes" (Settings) link a /empresa/ajustes

6. GRID 2 COLS (lg+):
   A. Citas pendientes
      - Header "Citas pendientes" + link "Ver todas →"
      - Lista de 5 con: nombre miembro + servicio + fecha + badge
        estado + acciones (Aprobar / Rechazar) confirm-in-place.
   B. Miembros recientes
      - Header + link.
      - Lista de 5 con: avatar + nombre + email + chip estado.

7. GRÁFICA "Citas por servicio"
   - Donut o bar chart abajo, card propia.
   - Leyenda lateral con colores y porcentajes.

ESTADOS:
- Skeleton independiente por sección.
- Empty para cada lista vacía.
- Error por bloque sin romper los demás.

RESPONSIVE:
- <md: stack 1 col.
- md: KPIs 2x2, otras secciones 1 col.
- lg+: KPIs 4x1, listas 2 cols.

REGLAS: aprobar/rechazar citas son confirm-in-place. Sin modales.
```

---

### 5.2 Citas empresa

**Ruta:** `/{locale}/dashboard/empresa/citas`
**Rol:** empresa_admin
**Patrones referenciados:** Tabla 3:1, Design System

**Prompt:**

```
Diseña la pantalla de citas para empresa_admin de clubSOS.

OBJETIVO: ver TODAS las citas de los miembros de la empresa y
aprobar/rechazar las pendientes_empresa.

USA EL PATRÓN TABLA 3:1 de § 2.2.

COLUMNAS DE TABLA:
- Miembro (avatar + nombre).
- Servicio.
- Doctor.
- Fecha y hora.
- Estado (badge: pendiente_empresa naranja, pendiente azul,
  confirmado verde, completado gris, cancelado/rechazado rojo).
- Acciones (icon buttons: ver, aprobar, rechazar).

FILTROS DEL PANEL LATERAL (Modo A — sin selección):
- KPIs mini: Total mes / Pendientes / Confirmadas / Canceladas.
- Filtros expandidos:
  - Estado (multi-select).
  - Servicio (select).
  - Rango de fechas (date range).
  - Miembro (search).
- Acciones: Exportar CSV.

PANEL CON SELECCIÓN (Modo B):
- Avatar miembro + nombre + email.
- Servicio · Doctor · Ubicación · Fecha · Cita ID.
- Estado actual badge grande.
- Acciones contextuales:
  - Si pendiente_empresa: "Aprobar" (primary) + "Rechazar" (outline,
    error). Ambas son confirm-in-place con mensaje opcional.
  - Si otros estados: solo "Ver historial" + "Contactar miembro".

ESTADOS:
- Skeleton de 8 filas.
- Empty: "No hay citas que coincidan con los filtros".
- Error.

RESPONSIVE: hereda del patrón Tabla 3:1.

REGLAS: aprobar/rechazar = confirm-in-place inline con campo de
mensaje opcional. Sin modales.
```

---

### 5.3 Usuarios empresa

**Ruta:** `/{locale}/dashboard/empresa/usuarios`
**Rol:** empresa_admin
**Patrones referenciados:** Tabla 3:1, Página-Formulario, Design System

**Prompt:**

```
Diseña la pantalla de gestión de usuarios (miembros) de la empresa.

OBJETIVO: lista de miembros con búsqueda, filtros, crear/editar/
suspender.

USA EL PATRÓN TABLA 3:1.

COLUMNAS:
- Avatar + nombre.
- Email.
- Cédula.
- Rol (miembro / empresa_admin) badge.
- Estado (activo / pendiente / suspendido) badge.
- Fecha registro.
- Acciones: ver, editar, suspender/activar.

PANEL MODO A (sin selección):
- KPIs: Total / Activos / Pendientes / Suspendidos.
- Filtros: estado, rol, búsqueda nombre/email/cédula.
- Botones: Exportar CSV, Importar masivo (link a página
  /empresa/usuarios/importar, NO modal).

PANEL MODO B (con selección):
- Avatar + datos resumen.
- Acciones: Editar (link a /empresa/usuarios/[id]/editar, NO modal),
  Ver historial de citas, Suspender/Activar (confirm-in-place),
  Reenviar invitación.

CREAR NUEVO USUARIO:
- Botón primary toolbar "+ Nuevo miembro" link a
  /empresa/usuarios/nuevo (página dedicada usando patrón
  Página-Formulario § 2.4).
- Esa página tiene form con: nombre, email, cédula, teléfono, rol,
  contrato asignado (select). Botones Cancelar / Crear.

ESTADOS: hereda Tabla 3:1.

RESPONSIVE: hereda Tabla 3:1.

REGLAS: editar/crear = página. Suspender = confirm-in-place. Sin
modales.
```

---

### 5.4 Reportes empresa

**Ruta:** `/{locale}/dashboard/empresa/reportes`
**Rol:** empresa_admin
**Patrones referenciados:** Design System

**Prompt:**

```
Diseña la pantalla de reportes para empresa_admin.

OBJETIVO: visualizaciones agregadas sobre uso del plan por sus
miembros.

SECCIONES:
1. Header h1 "Reportes" + subtítulo.
2. Toolbar global:
   - Selector de rango de fechas (date range picker).
   - Tabs: "Resumen" · "Citas" · "Beneficios" · "Documentos".

3. RESUMEN (tab default):
   - 4 KPIs grandes arriba (grid 2x2 móvil, 4x1 md+).
   - Gráfica de línea: Citas por mes (12 meses).
   - Donut: Distribución por servicio.
   - Tabla compacta: Top 5 miembros activos.

4. CITAS:
   - KPIs específicos.
   - Heatmap calendar (citas por día).
   - Stacked bar: estados por mes.
   - Tabla por servicio con métricas.

5. BENEFICIOS:
   - Beneficios más usados (top 10 horizontal bar).
   - Total reclamos / Tasa de uso / Beneficios activos.

6. DOCUMENTOS:
   - Total documentos / Promedio por miembro.
   - Tabla por tipo.

7. Footer fixed: botón outline "Exportar reporte (PDF)" derecha.

ESTADOS:
- Skeleton por gráfica.
- Empty si rango sin datos.
- Error por sección.

RESPONSIVE:
- <md: gráficas full-width apiladas.
- md+: grids 2 cols donde aplique.

REGLAS: sin modales. Exportar genera PDF y dispara toast con link.
```

---

### 5.5 Ajustes empresa

**Ruta:** `/{locale}/dashboard/empresa/ajustes`
**Rol:** empresa_admin
**Patrones referenciados:** Página-Formulario, Design System

**Prompt:**

```
Diseña la pantalla de ajustes de la empresa.

OBJETIVO: editar datos generales de la empresa, contrato, logo,
preferencias de notificación.

LAYOUT:
- Sidebar interno con secciones (lg+): "Datos generales",
  "Contrato", "Branding", "Notificaciones".
- En móvil: tabs horizontales con scroll-x.

SECCIONES:
1. DATOS GENERALES:
   - Logo upload (avatar 96px + botón cambiar).
   - Nombre legal, RUC, dirección, teléfono contacto, email contacto.
2. CONTRATO (readonly mostly):
   - Tipo de plan, total contratado, fecha inicio/fin.
   - Si admin global permite: botón "Solicitar ampliación".
3. BRANDING:
   - Color primario opcional (color picker) — solo para
     personalización dentro de límites.
4. NOTIFICACIONES:
   - Switches por tipo: nuevo miembro, cita pendiente, etc.
   - Configurar destinatarios (multi-email input).

ESTADOS:
- Loading guardar.
- Toast verde "Guardado".
- Error banner.

RESPONSIVE:
- <md: tabs scroll-x.
- md+: sidebar + contenido.

REGLAS: sin modales. Cada sección guarda independientemente.
```

---
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/design/claude-design-prompts.md`
Expected: grew by ~270 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add 5 empresa_admin prompts (home, citas, usuarios, reportes, ajustes)"
```

---

### Task 8: Section 6 — Admin part A (6.1–6.8: home, usuarios, doctores, servicios, ubicaciones, empresas)

**Files:**
- Modify: `docs/design/claude-design-prompts.md`

**Reference:** `components/dashboard/admin/{AdminInicio,AdminInicioCitasPendientes,AdminInicioEmpresasRecientes,AdminInicioCitasPorServicio,AdminDoctores,AdminDoctorFormModal,AdminDoctorTabInfo,AdminDoctorTabServicios,AdminServicios,AdminServicioFormModal,AdminUbicaciones,AdminUbicacionFormModal,AdminEmpresas}.tsx`

- [ ] **Step 1: Append Section 6 header and prompts 6.1 through 6.8**

````markdown
## 6. Admin

### 6.1 Home admin

**Ruta:** `/{locale}/dashboard/admin`
**Rol:** admin
**Patrones referenciados:** Layout shell, Design System

**Prompt:**

```
Diseña el Home del admin global de clubSOS.

OBJETIVO: vista global de la plataforma — todas las empresas, todos
los usuarios, todas las citas.

SECCIONES:
1. Hero: "Hola, [Nombre]" + "Panel global".

2. ALERT BANNER (si citas_pendientes > 0): warning con CTA "Revisar".

3. KPIs (6 cards: grid 2 cols móvil, 3 md, 6 lg):
   - Total empresas
   - Empresas activas
   - Total usuarios
   - Usuarios activos
   - Citas pendientes (warning si > 0)
   - Citas del mes
   Más abajo en card aparte: Documentos totales + Beneficios activos.

4. QUICK ACTIONS ROW (4 pills):
   - Nueva empresa (link a /admin/empresas/nuevo)
   - Nuevo doctor (link a /admin/doctores/nuevo)
   - Subir documento (link a /admin/documentos/subir)
   - Crear beneficio (link a /admin/beneficios/nuevo)

5. GRID 2 COLS (lg+):
   A. Citas pendientes (global):
      - Lista de 8 con miembro + empresa + servicio + fecha + acciones
        (Aprobar/Rechazar confirm-in-place + Ver detalle link).
   B. Empresas recientes:
      - Lista de 5 con logo + nombre + contrato + fecha.

6. GRÁFICA "Citas por servicio" global.

ESTADOS:
- Skeleton independiente por sección.
- Empty / Error por bloque.

RESPONSIVE:
- <md: 1 col stack.
- md: KPIs 3 cols, otros 1 col.
- lg+: KPIs 6 cols, grid 2 cols, gráfica full-width.

REGLAS: aprobar/rechazar = confirm-in-place. Sin modales.
```

---

### 6.2 Usuarios admin

**Ruta:** `/{locale}/dashboard/admin/usuarios`
**Rol:** admin
**Patrones referenciados:** Tabla 3:1, Página-Formulario, Design System

**Prompt:**

```
Diseña la pantalla global de usuarios (todos los usuarios de todas
las empresas) para admin.

USA EL PATRÓN TABLA 3:1.

COLUMNAS:
- Avatar + nombre.
- Email.
- Cédula.
- Empresa (badge).
- Rol (admin / empresa_admin / miembro).
- Estado (activo / pendiente / suspendido).
- Fecha registro.

PANEL MODO A:
- KPIs: Total / Activos / Pendientes / Suspendidos.
- Filtros: empresa (multi-select), rol, estado, búsqueda.
- Acciones: Exportar, Importar masivo (link a página).

PANEL MODO B:
- Datos resumen.
- Acciones: Editar (link), Ver citas, Suspender (confirm-in-place),
  Cambiar rol (confirm-in-place con select inline), Eliminar
  (link a /admin/usuarios/[id]/eliminar página dedicada con
  warning de impacto).

CREAR / EDITAR: páginas dedicadas
- /admin/usuarios/nuevo y /admin/usuarios/[id]/editar.

ESTADOS / RESPONSIVE: heredan Tabla 3:1.

REGLAS: sin modales para forms.
```

---

### 6.3 Doctores (lista)

**Ruta:** `/{locale}/dashboard/admin/doctores`
**Rol:** admin
**Patrones referenciados:** Tabla 3:1, Página-Formulario, Design System

**Prompt:**

```
Diseña la pantalla de gestión de doctores.

USA EL PATRÓN TABLA 3:1.

COLUMNAS:
- Avatar + nombre.
- Especialidad.
- Ubicación principal.
- Servicios cubiertos (chips truncados a 2 + "+N").
- Estado (activo/inactivo).
- Acciones: ver detalle (link a /admin/doctores/[id]), editar (link),
  activar/inactivar (confirm-in-place).

PANEL MODO A:
- KPIs: Total / Activos / Inactivos.
- Filtros: especialidad, ubicación, servicio, estado.

PANEL MODO B:
- Avatar grande + nombre + especialidad.
- Servicios completos lista.
- Horarios resumen.
- Acciones: Ver detalle (link), Editar (link),
  Gestionar horarios (link a /admin/doctores/[id]?tab=horarios),
  Inactivar (confirm-in-place).

BOTÓN PRIMARY toolbar: "+ Nuevo doctor" link a
/admin/doctores/nuevo (NO modal — página completa con form usando
Página-Formulario).

ESTADOS / RESPONSIVE: heredan Tabla 3:1.

REGLAS: sin modales.
```

---

### 6.4 Doctor detalle

**Ruta:** `/{locale}/dashboard/admin/doctores/[id]`
**Rol:** admin
**Patrones referenciados:** Página-Formulario, Design System

**Prompt:**

```
Diseña la página de detalle de un doctor con tabs (reemplaza modal).

LAYOUT:
- Breadcrumb "Doctores / [Nombre]".
- Header: avatar grande + nombre + especialidad + badges (estado,
  ubicación) + botones derecha (Editar link, Inactivar
  confirm-in-place).
- Tabs horizontales: "Información" · "Servicios" · "Horarios" ·
  "Excepciones" · "Citas".

CONTENIDO POR TAB:
1. INFORMACIÓN:
   - Card con datos personales (cédula, email, teléfono, dirección).
   - Card con datos profesionales (registro médico, biografía,
     idiomas).
2. SERVICIOS:
   - Lista de servicios habilitados con duración y tarifa.
   - Botón "+ Agregar servicio" navega a página /servicios o abre
     select inline.
3. HORARIOS:
   - Calendario semanal con bloques de disponibilidad por día.
   - Botón "Agregar horario" link a /admin/doctores/[id]/horarios/
     nuevo.
4. EXCEPCIONES:
   - Lista de fechas excluidas (vacaciones, feriados).
   - Botón link a /admin/excepciones/nuevo.
5. CITAS:
   - Mini-tabla de las últimas 20 citas del doctor.

ESTADOS: skeleton del tab activo, empty para cada lista.

RESPONSIVE:
- <md: tabs scroll-x, contenido full-width.
- md+: tabs horizontales completos.

REGLAS: sin modales. Todo crear/editar va a página.
```

---

### 6.5 Doctor crear/editar (página)

**Ruta:** `/{locale}/dashboard/admin/doctores/nuevo` y `/[id]/editar`
**Rol:** admin
**Patrones referenciados:** Página-Formulario, Design System

**Prompt:**

```
Diseña la página de crear/editar doctor (reemplaza
AdminDoctorFormModal).

USA EL PATRÓN PÁGINA-FORMULARIO § 2.4.

SECCIONES (en una sola página, scroll vertical):
1. Datos personales:
   - Avatar upload + nombre completo + cédula + email + teléfono.
2. Datos profesionales:
   - Registro médico, especialidad (select), idiomas (multi).
3. Ubicación principal y secundarias (multi-select).
4. Servicios habilitados (multi-select de servicios existentes,
   con duración por defecto).
5. Estado (switch activo/inactivo, solo en edición).
6. Biografía (textarea con character counter).

ACCIONES:
- Header: Breadcrumb + h1 "Nuevo doctor" / "Editar [Nombre]".
- Action bar: Cancelar (vuelve a /admin/doctores) + Crear/Guardar.

VALIDACIÓN: en vivo por campo. Resumen de errores arriba al
intentar enviar.

ESTADOS:
- Loading durante envío.
- Toast verde "Doctor creado" + redirect a /admin/doctores.
- Error banner arriba.

RESPONSIVE:
- <md: 1 col, action bar sticky bottom.
- md+: 2 cols en secciones anchas, action bar en header.

REGLAS: sin modales. Cancelar es navegación, no modal de confirmar
descartar (a menos que haya cambios sin guardar — entonces
confirm-in-place "¿Descartar cambios?").
```

---

### 6.6 Servicios (lista + crear/editar)

**Ruta:** `/{locale}/dashboard/admin/servicios` (+ /nuevo y /[id]/editar)
**Rol:** admin
**Patrones referenciados:** Tabla 3:1, Página-Formulario, Design System

**Prompt:**

```
Diseña la pantalla de servicios médicos para admin.

USA EL PATRÓN TABLA 3:1.

COLUMNAS:
- Nombre (con ícono).
- Categoría (badge).
- Duración por slot (min).
- Tarifa.
- Doctores que lo ofrecen (contador chip).
- Estado.
- Acciones.

PANEL MODO A:
- KPIs: Total / Activos / Categorías.
- Filtros: categoría, estado.

PANEL MODO B:
- Detalle servicio.
- Acciones: Editar (link), Ver doctores (link a /admin/doctores
  filtrado), Duplicar (link a /nuevo precargado),
  Inactivar (confirm-in-place).

BOTÓN PRIMARY: "+ Nuevo servicio" link a /admin/servicios/nuevo.

CREAR/EDITAR — Página-Formulario:
- Campos: nombre, descripción, categoría (select), duración slot
  (number min), tarifa (number), ícono (selector visual de
  íconos lucide), color de badge (color picker simple).
- Cancelar / Guardar.

RESPONSIVE: hereda Tabla 3:1.

REGLAS: sin modales.
```

---

### 6.7 Ubicaciones (lista + crear/editar)

**Ruta:** `/{locale}/dashboard/admin/ubicaciones` (+ /nuevo y /[id]/editar)
**Rol:** admin
**Patrones referenciados:** Tabla 3:1, Página-Formulario, Design System

**Prompt:**

```
Diseña la pantalla de ubicaciones (clínicas/sedes).

USA EL PATRÓN TABLA 3:1.

COLUMNAS:
- Nombre.
- Dirección truncada.
- Ciudad.
- Doctores asignados (contador).
- Estado.

PANEL MODO A:
- KPIs: Total / Activas.
- Filtros: ciudad, estado.

PANEL MODO B:
- Mapa mini (placeholder o estático) + dirección completa.
- Lista de doctores en esa ubicación.
- Acciones: Editar, Inactivar.

CREAR/EDITAR (página):
- Nombre, dirección completa con autocompletado (placeholder de
  Google Places), ciudad, código postal, teléfono, horario de
  apertura.
- Coordenadas GPS (lat/lng).
- Foto principal upload.

RESPONSIVE: hereda Tabla 3:1.

REGLAS: sin modales.
```

---

### 6.8 Empresas (lista + crear/editar)

**Ruta:** `/{locale}/dashboard/admin/empresas` (+ /nuevo y /[id]/editar)
**Rol:** admin
**Patrones referenciados:** Tabla 3:1, Página-Formulario, Design System

**Prompt:**

```
Diseña la pantalla de empresas clientes.

USA EL PATRÓN TABLA 3:1.

COLUMNAS:
- Logo + nombre.
- RUC.
- Plan / Tipo de contrato.
- Miembros activos / contratados (X / Y).
- Renovación.
- Estado.

PANEL MODO A:
- KPIs: Total / Activas / En renovación próxima (< 30d) / Vencidas.
- Filtros: estado, plan, búsqueda.

PANEL MODO B:
- Logo + nombre + RUC + dirección.
- Métricas: miembros, citas mes, beneficios reclamados.
- Acciones: Editar (link), Ver miembros (link filtrado), Ver
  contratos (link), Suspender (confirm-in-place), Eliminar (link a
  página /eliminar con resumen).

CREAR/EDITAR (página) — Página-Formulario:
- Secciones:
  1. Datos legales (nombre, RUC, dirección).
  2. Contacto (email contacto, teléfono).
  3. Contrato (tipo plan, fecha inicio, fecha fin, número de
     contratados).
  4. Branding (logo upload).
- Cancelar / Crear.

RESPONSIVE: hereda Tabla 3:1.

REGLAS: sin modales. Eliminar empresa es flujo crítico con página
dedicada que lista impactos (miembros que serán suspendidos,
contratos que se cierran).
```

---
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/design/claude-design-prompts.md`
Expected: grew by ~410 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add 8 admin prompts (home, usuarios, doctores, servicios, ubicaciones, empresas)"
```

---

### Task 9: Section 6 — Admin part B (6.9–6.16: citas, calendario, beneficios, documentos, excepciones, reportes, sistema, auditoría)

**Files:**
- Modify: `docs/design/claude-design-prompts.md`

**Reference:** `components/dashboard/admin/{AdminCitasView,AdminCitasRegistro,AdminCalendarioCitas,AdminPagoVerificacion,AdminCitaDetalleModal,AvisosAdmin,AdminDocumentos,SubirDocumentoModal,AdminExcepcionesTabla,AdminExcepcionFormModal,AdminReportes,AdminReportesEmpresas,AdminReportesCitas,AdminReportesDocumentos,AdminReportesBeneficios,AdminReportesUsuarios,AdminAuditoria,AdminAuditoriaFiltros,AdminAuditoriaTabla,BeneficioFormModal}.tsx`

- [ ] **Step 1: Append prompts 6.9 through 6.16**

````markdown
### 6.9 Citas admin (lista 3:1)

**Ruta:** `/{locale}/dashboard/admin/citas`
**Rol:** admin
**Patrones referenciados:** Tabla 3:1, Design System

**Prompt:**

```
Diseña la pantalla global de citas para admin.

USA EL PATRÓN TABLA 3:1.

COLUMNAS:
- ID corto.
- Miembro (avatar + nombre + empresa chip).
- Servicio.
- Doctor.
- Ubicación.
- Fecha y hora.
- Estado (badge color).
- Pago (chip: pendiente/verificado/n.a.).
- Acciones (ver, aprobar, rechazar).

PANEL MODO A:
- KPIs: Total mes / Pendientes / Confirmadas / Canceladas /
  Verificación pago.
- Filtros: estado, empresa, servicio, doctor, rango fechas, estado
  pago.
- Tab toggle: "Lista" · "Calendario" (calendario → § 6.10).
- Exportar / Importar masivo.

PANEL MODO B (reemplaza AdminCitaDetalleModal):
- Header con avatar miembro + ID + estado badge grande.
- Sección "Detalle":
  - Servicio, doctor, ubicación, fecha, duración.
  - Miembro: nombre, empresa, contacto.
  - Paciente (si para_titular=false): nombre, teléfono, cédula.
- Sección "Pago" (si aplica):
  - Estado pago + monto + método + ver comprobante.
- Sección "Notificaciones":
  - Timeline de cita_eventos (creada → confirmada → recordatorio).
- Acciones:
  - Si pendiente_admin: Confirmar (primary) / Rechazar (outline
    error) ambos confirm-in-place con campo mensaje opcional.
  - Si pago pendiente: link "Verificar pago" a página dedicada
    /admin/citas/[id]/verificar-pago.
  - Cancelar (confirm-in-place).
  - Editar (raro, link a página si aplica).

ESTADOS / RESPONSIVE: heredan Tabla 3:1.

REGLAS: confirmar/rechazar/cancelar = confirm-in-place. Verificar
pago = página dedicada. Sin modales.
```

---

### 6.10 Calendario de citas

**Ruta:** `/{locale}/dashboard/admin/citas/calendario`
**Rol:** admin
**Patrones referenciados:** Design System

**Prompt:**

```
Diseña la vista calendario de citas para admin.

OBJETIVO: ver citas en vista calendario (día / semana / mes) con
filtros y acciones rápidas.

LAYOUT:
- Header sticky:
  - Tabs vista: Día · Semana · Mes (default semana).
  - Selector fecha con flechas anterior/siguiente + botón Hoy.
  - Filtros derecha: doctor, ubicación, estado.
  - Botón "Nueva cita" (link a flujo admin de creación o redirect
    al wizard del miembro impersonando).

- Cuerpo calendario:
  - VISTA SEMANAL: grid horario 7 cols (lun-dom), filas de 30 min
    desde 06:00 hasta 22:00. Cada cita = bloque rounded en el slot
    con color por estado, nombre miembro, servicio. Click sobre
    bloque abre sheet lateral (md+) o sheet inferior (móvil) con
    el detalle/acciones de la cita (reusa el panel B de § 6.9).
  - VISTA DÍA: 1 columna grande con todo el día.
  - VISTA MES: cells de día con dots/contadores de citas por estado.
    Click en día → vista día.

- Realtime: las citas se actualizan en vivo (subscripción).

ESTADOS:
- Skeleton del calendario.
- Empty: día/semana sin citas con mensaje suave.
- Error.

RESPONSIVE:
- <md: solo vista día (otras vistas opcionales con tabs).
- md+: vistas completas.

REGLAS: el detalle no abre modal — abre sheet lateral o panel
flotante anclado a la celda. Sin modales.
```

---

### 6.11 Beneficios admin (lista + crear/editar)

**Ruta:** `/{locale}/dashboard/admin/beneficios` (+ /nuevo y /[id]/editar)
**Rol:** admin
**Patrones referenciados:** Tabla 3:1, Página-Formulario, Design System

**Prompt:**

```
Diseña la gestión de beneficios para admin.

USA EL PATRÓN TABLA 3:1.

COLUMNAS:
- Imagen mini + título.
- Categoría (badge).
- Empresas asignadas (multi: "Todas" o contador).
- Vigencia (rango fechas).
- Estado (activa, expirada, programada).
- Reclamos (contador).

PANEL MODO A:
- KPIs: Total / Activos / Más reclamado.
- Filtros: categoría, empresa, estado.

PANEL MODO B:
- Imagen + título.
- Detalle: descripción corta, código (si aplica), vigencia.
- Stats: vistas, reclamos, tasa de uso.
- Acciones: Editar (link), Duplicar (link precargado), Pausar/
  Reactivar (confirm-in-place), Eliminar (confirm-in-place).

CREAR/EDITAR (página, reemplaza BeneficioFormModal):
- Secciones:
  1. Contenido: título, descripción larga (rich text), imagen upload
     (aspect 16:9).
  2. Categorización: categoría (select), tags.
  3. Beneficiarios: "Todas las empresas" / "Empresas específicas"
     (multi-select).
  4. Vigencia: fecha inicio + fecha fin.
  5. Mecánica: con código (input + generador) / sin código (botón
     activar).
  6. Estado: switch activo.

RESPONSIVE: hereda Tabla 3:1.

REGLAS: sin modales.
```

---

### 6.12 Documentos admin (lista + subir)

**Ruta:** `/{locale}/dashboard/admin/documentos` (+ /subir)
**Rol:** admin
**Patrones referenciados:** Tabla 3:1, Página-Formulario, Design System

**Prompt:**

```
Diseña la pantalla de gestión de documentos médicos del admin.

USA EL PATRÓN TABLA 3:1.

COLUMNAS:
- Ícono tipo archivo + nombre.
- Tipo (badge).
- Usuario destinatario (avatar + nombre).
- Empresa.
- Fecha del documento.
- Tamaño.
- Acciones: descargar, previsualizar, eliminar.

PANEL MODO A:
- KPIs: Total / Por tipo top.
- Filtros: tipo, empresa, usuario, rango fechas.
- Botón primary toolbar: "+ Subir documento" link a
  /admin/documentos/subir (página, NO modal — reemplaza
  SubirDocumentoModal).

PANEL MODO B:
- Preview thumbnail.
- Metadata completa.
- Acciones: Descargar, Re-asignar (link a /editar),
  Eliminar (confirm-in-place).

SUBIR DOCUMENTO (página dedicada):
- Drag-and-drop area grande (con fallback click).
- Form de metadata: nombre, tipo, usuario destinatario (search),
  fecha del documento.
- Bulk: subir múltiples con metadata común editable por archivo.
- Action bar: Cancelar / Subir.
- Progress bar por archivo.

RESPONSIVE: hereda Tabla 3:1.

REGLAS: sin modales para subir. Drag-and-drop full-width móvil.
```

---

### 6.13 Excepciones horario (lista + crear/editar)

**Ruta:** `/{locale}/dashboard/admin/excepciones` (+ /nuevo y /[id]/editar)
**Rol:** admin
**Patrones referenciados:** Tabla 3:1, Página-Formulario, Design System

**Prompt:**

```
Diseña la gestión de excepciones de horario (vacaciones, feriados).

USA EL PATRÓN TABLA 3:1.

COLUMNAS:
- Título / motivo.
- Scope (Global / Doctor / Ubicación / Servicio).
- Fecha inicio.
- Fecha fin.
- Duración (días).
- Estado (vigente, futura, pasada).
- Citas afectadas (contador).

PANEL MODO A:
- KPIs: Total vigentes / Futuras / Citas afectadas próximos 30d.
- Filtros: scope, rango.

PANEL MODO B:
- Detalle excepción.
- Lista de citas afectadas con badge si fueron auto-canceladas.
- Acciones: Editar (link), Eliminar (confirm-in-place).

CREAR/EDITAR (página dedicada, reemplaza
AdminExcepcionFormModal):
- Secciones:
  1. Tipo: select Global / Doctor específico / Ubicación específica
     / Servicio específico.
  2. Selector(es) según tipo (multi-select).
  3. Fechas: rango (date range picker) o día completo + recurrencia
     (semanal/mensual opcional).
  4. Motivo (textarea) + tipo (vacaciones / feriado / capacitación
     / otro).
  5. Acciones automáticas: switch "Auto-cancelar citas afectadas y
     notificar".
- Banner amarillo arriba si selección afecta a > 0 citas mostrando
  contador, antes de guardar.

RESPONSIVE: hereda Tabla 3:1.

REGLAS: sin modales.
```

---

### 6.14 Reportes admin

**Ruta:** `/{locale}/dashboard/admin/reportes`
**Rol:** admin
**Patrones referenciados:** Design System

**Prompt:**

```
Diseña la pantalla de reportes global de admin.

OBJETIVO: KPIs y reportes ejecutivos globales con drill-down por
sub-reportes.

SECCIONES:
1. Header h1 + selector rango fechas + botón "Exportar reporte".
2. Tabs: "Resumen" · "Empresas" · "Citas" · "Documentos" ·
   "Beneficios" · "Usuarios".

3. RESUMEN:
   - 6 KPIs grandes (empresas activas, usuarios activos, citas mes,
     citas confirmadas, documentos, beneficios reclamados).
   - Gráfica línea: crecimiento usuarios por mes.
   - Donut: distribución de empresas por plan.
   - Tabla top 5 empresas más activas.

4. SUB-REPORTES (cada tab):
   Cada uno = página interna con gráficas específicas (donut, bar,
   line, heatmap, mini-tablas) y filtros propios.

ESTADOS:
- Skeleton por gráfica.
- Empty si rango sin datos.
- Error por sección.

RESPONSIVE:
- <md: gráficas apiladas.
- md+: grids 2 cols.

REGLAS: sin modales. Exportar genera PDF y dispara toast con link.
```

---

### 6.15 Auditoría

**Ruta:** `/{locale}/dashboard/admin/auditoria`
**Rol:** admin
**Patrones referenciados:** Tabla 3:1, Design System

**Prompt:**

```
Diseña la pantalla de auditoría del admin.

USA EL PATRÓN TABLA 3:1 (modo lectura — no edit/delete inline).

COLUMNAS:
- Timestamp (relativo + tooltip absoluto).
- Actor (avatar + nombre + rol).
- Acción (badge: created / updated / deleted / login / etc.).
- Recurso (badge tipo + ID).
- IP / dispositivo.

PANEL MODO A:
- KPIs: Eventos hoy / Eventos semana / Actores únicos / Acciones
  fallidas.
- Filtros (panel expandido siempre):
  - Actor (search).
  - Acción (multi-select).
  - Recurso (tipo).
  - Rango fechas.
  - Resultado (éxito/fallo).
- Exportar JSON / CSV.

PANEL MODO B (con selección):
- Detalle completo del evento:
  - Actor + rol + IP + user agent.
  - Recurso + ID + nombre legible.
  - Diff (si update): JSON viewer antes/después.
  - Metadata adicional.
- Acciones: copiar JSON, link al recurso afectado.

ESTADOS: hereda Tabla 3:1.

REGLAS: solo lectura. Sin modales.
```

---

### 6.16 Sistema (configuración)

**Ruta:** `/{locale}/dashboard/admin/sistema`
**Rol:** admin
**Patrones referenciados:** Página-Formulario, Design System

**Prompt:**

```
Diseña la pantalla de configuración del sistema (admin global).

LAYOUT:
- Sidebar interno con secciones (lg+) / tabs scroll-x (móvil):
  "General", "Citas", "Notificaciones", "Integraciones",
  "Mantenimiento".

SECCIONES:
1. GENERAL:
   - Nombre de la plataforma, logo global, color brand (limitado).
   - Idiomas habilitados.
   - Términos y privacidad (link a páginas /terminos, /privacidad).
2. CITAS:
   - Ventana de cancelación (horas) input number.
   - Auto-confirmación (switch).
   - Recordatorio 24h (switch).
3. NOTIFICACIONES:
   - Templates WhatsApp habilitados (lista con estado approved).
   - Email FROM, RESEND key (mask).
   - Activar canales: email / WhatsApp / in-app.
4. INTEGRACIONES:
   - Status de Supabase, Resend, WhatsApp Cloud API.
   - Edge functions estado.
5. MANTENIMIENTO:
   - Modo mantenimiento switch (banner global a usuarios).
   - Limpieza de logs antiguos.
   - Reindexar search.

Cada sección guarda independiente con botón Guardar.

ESTADOS: loading guardar, toast verde, error banner.

REGLAS: sin modales.
```

---
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/design/claude-design-prompts.md`
Expected: grew by ~470 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add 8 admin prompts (citas, calendario, beneficios, documentos, excepciones, reportes, auditoria, sistema)"
```

---

### Task 10: Section 7.1–7.5 — Wizard citas (5 expanded steps)

**Files:**
- Modify: `docs/design/claude-design-prompts.md`

**Reference:** `components/dashboard/miembro/citas/steps/{PasoPaciente,PasoServicio,PasoUbicacion,PasoDoctor,PasoFecha,PasoHorario,PasoPago,PasoTransferencia,PasoConfirmar}.tsx`

- [ ] **Step 1: Append Section 7 header and prompts 7.1-7.5**

````markdown
## 7. Wizards expandidos

> Estos prompts detallan el contenido del paso ACTUAL dentro del shell del wizard (§ 2.3). Asume que el stepper, summary lateral y footer ya están renderizados — diseña solo el contenido principal del paso.

### 7.1 Wizard Citas — Paso 1: Paciente

**Ruta:** `/{locale}/dashboard/citas/nueva?step=1`
**Rol:** miembro
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña el contenido del PASO 1 del wizard de nueva cita: PACIENTE.

OBJETIVO: el miembro indica para quién es la cita — para sí mismo
(titular) o para un familiar registrado.

CONTENIDO:
1. Título de paso: "¿Para quién es la cita?".
2. Subtítulo: "Selecciona el paciente que recibirá la atención".

3. TABS / TOGGLE GRANDE:
   - 2 cards grandes lado a lado (md+) / stack (móvil):
     - "Para mí (Titular)": avatar del miembro + nombre.
     - "Para un familiar": ícono Users.
   - Card activa: border-primary border-2 + bg-primary/5.

4. SI "Para un familiar":
   - Subsection "Selecciona el familiar":
     - Grid de avatar cards con familiares registrados.
     - Cada card: avatar + nombre + relación badge + edad.
     - Card final: "+ Agregar nuevo familiar" link a /familia/nuevo
       (NO modal — abre página).
   - Si no hay familiares: empty state inline con CTA.

5. SI "Para mí":
   - Validación silenciosa: confirmar datos del miembro
     (no editable).

ESTADOS:
- Skeleton si hay carga.
- Error: banner.

VALIDACIÓN: avanzar requiere selección (titular o un familiar).

REGLAS: sin modales. Agregar familiar = página.
```

---

### 7.2 Wizard Citas — Paso 2: Servicio + Ubicación

**Ruta:** `/{locale}/dashboard/citas/nueva?step=2`
**Rol:** miembro
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña el contenido del PASO 2 del wizard: SERVICIO + UBICACIÓN
consolidados.

OBJETIVO: elegir el servicio médico y la ubicación. Si solo hay
1 ubicación disponible para el servicio, autoseleccionar y mostrar
con badge "Sugerido".

CONTENIDO:
1. Título: "¿Qué servicio necesitas?".

2. SERVICIOS — grid de cards (2 cols md, 3 cols lg):
   Cada ServicioCard:
   - Ícono lucide grande del servicio en círculo color primary/10.
   - Nombre Poppins semibold.
   - Descripción corta sm.
   - Badge "Cubierto" si está en el plan.
   - Hover: border-primary, shadow-md.
   - Selected: border-primary border-2 + bg-primary/5 + check mark.

3. CUANDO HAY SELECCIÓN DE SERVICIO:
   - Aparece subsection "Ubicación":
     - Si 1 sola ubicación disponible: card pre-seleccionada con
       badge naranja "Sugerido" + nombre + dirección + botón
       "Ver más opciones" (oculto si solo 1).
     - Si > 1: grid de UbicacionCard con nombre + dirección +
       distancia (opcional) + badge.

ESTADOS:
- Skeleton del grid.
- Empty: "No hay servicios disponibles en tu plan" (raro, banner).
- Error: banner.

VALIDACIÓN: avanzar requiere servicio + ubicación seleccionados.

REGLAS: sin modales. Smart defaults visibles con badge.
```

---

### 7.3 Wizard Citas — Paso 3: Doctor + Fecha + Horario (UNIFICADO)

**Ruta:** `/{locale}/dashboard/citas/nueva?step=3`
**Rol:** miembro
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña el contenido del PASO 3 unificado del wizard: DOCTOR + FECHA
+ HORARIO en una sola vista.

OBJETIVO: ver disponibilidad integrada de doctores compatibles con
el servicio en una vista calendario+slots.

CONTENIDO (lg+: 3 cols / 2/3 + 1/3, móvil: stack):

1. Header del paso:
   - Título: "Elige tu cita".
   - Selector horizontal de doctores arriba (sticky):
     - Avatars en row scroll-x con nombre debajo.
     - Si solo 1 doctor disponible: card grande con info y badge
       "Sugerido".
     - Click cambia doctor y refresca slots (mantiene fecha
       seleccionada).

2. COLUMNA IZQUIERDA (calendario):
   - Calendario mensual interactivo (date picker grande).
   - Días con disponibilidad: dot indicator primary.
   - Día sin disponibilidad: gris claro disabled.
   - Día seleccionado: bg-primary text-white circular.
   - Navegación de mes con flechas + label "Mayo 2026".
   - Auto-selección: primera fecha con disponibilidad si no hay
     selección previa, marcada con badge "Más próxima".

3. COLUMNA DERECHA (slots):
   - Header: fecha seleccionada formato amigable
     "Miércoles, 28 de mayo".
   - Grid de slot buttons (2-3 cols dentro de la columna):
     - Cada slot: bloque rounded-xl con hora "09:00".
     - Estados: disponible (border + hover bg-primary/10),
       seleccionado (bg-primary text-white), no disponible
       (gris disabled).
   - Si día seleccionado no tiene slots: empty state
     "No hay horarios disponibles este día. Prueba otra fecha."

4. REALTIME: los slots se actualizan en vivo si alguien más reserva.

ESTADOS:
- Skeleton de calendario y slots.
- Empty: doctor sin disponibilidad próxima.
- Error.

VALIDACIÓN: avanzar requiere doctor + fecha + slot seleccionados.

RESPONSIVE:
- <md: stack vertical: selector doctor → calendario → slots.
- md+: row de doctores, 2 cols calendario+slots.
- lg+: layout completo.

REGLAS: sin modales. Realtime con sutiles transitions cuando un
slot se ocupa por otro usuario.
```

---

### 7.4 Wizard Citas — Paso 4: Pago

**Ruta:** `/{locale}/dashboard/citas/nueva?step=4`
**Rol:** miembro
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña el contenido del PASO 4 del wizard: PAGO.

OBJETIVO: elegir método de pago. Si transferencia, subir
comprobante inline.

CONTENIDO:
1. Título: "Método de pago".
2. Si servicio cubierto 100%: banner verde "Esta cita está
   cubierta por tu plan. No se requiere pago." + skip step
   automático con badge.
3. Si requiere pago:
   - Total a pagar: card destacada con monto Poppins bold 32px +
     desglose (servicio, IVA si aplica).
   - Tabs de métodos:
     - Tarjeta (placeholder Pasarela): logo + texto "Serás
       redirigido a checkout seguro al confirmar".
     - Transferencia bancaria: muestra datos de cuenta
       (banco, número, beneficiario) + área upload
       "Subir comprobante" (drag-and-drop o click) + input opcional
       de referencia.
     - Efectivo en sede (si aplica): card simple con instrucciones.

ESTADOS:
- Loading durante upload de comprobante.
- Validación: si transferencia, requiere comprobante.
- Error banner si upload falla.

VALIDACIÓN: si requiere pago, método + (comprobante si
transferencia) son obligatorios.

REGLAS: sin modales. Comprobante se sube inline.
```

---

### 7.5 Wizard Citas — Paso 5: Confirmar

**Ruta:** `/{locale}/dashboard/citas/nueva?step=5`
**Rol:** miembro
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña el contenido del PASO 5 final: CONFIRMAR.

OBJETIVO: revisar todos los detalles, aceptar términos y enviar.

CONTENIDO:
1. Título: "Confirma tu cita".
2. Subtítulo: "Revisa la información antes de confirmar".
3. RESUMEN ESTRUCTURADO (card grande):
   - Sección "Paciente": avatar + nombre + relación + edad +
     botón "Editar" mini.
   - Sección "Servicio y ubicación": ícono + nombre servicio +
     ubicación + edit.
   - Sección "Doctor": avatar + nombre + especialidad + edit.
   - Sección "Fecha y horario": ícono CalendarClock + fecha
     completa + hora + duración + edit.
   - Sección "Pago": método + monto + edit (si aplica).

4. AVISOS:
   - Política de cancelación: "Puedes cancelar hasta 24 horas
     antes" en card info azul.
   - Confirmaciones: "Recibirás un email + WhatsApp con la
     confirmación".

5. Términos y condiciones:
   - Checkbox "He leído y acepto los [términos y condiciones]"
     con link a /terminos.
   - Sin aceptar = botón Confirmar deshabilitado.

6. Footer de wizard (heredado de § 2.3):
   - "← Anterior" + "Confirmar y enviar" (primary grande).

ESTADOS:
- Loading durante envío: spinner + "Creando tu cita…".
- Error: banner arriba con mensaje específico
  (SLOT_TAKEN → "Ese horario ya no está disponible. Te llevamos
  al paso 3 para elegir otro").
- Éxito: redirect a /citas + toast verde + animación check.

REGLAS: sin modales. Editar saltos a pasos previos.
```

---
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/design/claude-design-prompts.md`
Expected: grew by ~280 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add 5 wizard citas step prompts (1-5)"
```

---

### Task 11: Section 7.6–7.10 — Wizard signup (5 expanded steps)

**Files:**
- Modify: `docs/design/claude-design-prompts.md`

**Reference:** `app/[locale]/(auth)/signup/page.tsx` (588 lines — see actual field names and validations)

- [ ] **Step 1: Append prompts 7.6 through 7.10**

````markdown
### 7.6 Wizard Signup — Paso 1: Datos personales

**Ruta:** `/{locale}/signup?step=1`
**Rol:** público
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña el contenido del PASO 1 del signup: DATOS PERSONALES.

OBJETIVO: capturar identidad básica del nuevo miembro.

CONTENIDO:
1. Título: "Cuéntanos sobre ti".
2. Subtítulo: "Esta información nos ayuda a personalizar tu cuenta".
3. Campos (2 cols md+, 1 col móvil):
   - Nombre completo (texto, requerido).
   - Cédula / DNI (texto con máscara según país, requerido).
   - Fecha de nacimiento (date picker, requerido, no futuro,
     edad mínima 18 o señalar si menor).
   - Sexo (select: Femenino / Masculino / Otro / Prefiero no decir).

VALIDACIÓN EN VIVO:
- Nombre: mínimo 2 palabras.
- Cédula: formato + verificar único (debounce 500ms, spinner inline,
  check verde si disponible).
- Fecha: en rango razonable.

ESTADOS:
- Cada input muestra success/error en tiempo real.
- Banner si hay errores generales.

REGLAS: sin modales.
```

---

### 7.7 Wizard Signup — Paso 2: Contacto

**Ruta:** `/{locale}/signup?step=2`
**Rol:** público
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña el contenido del PASO 2 del signup: CONTACTO.

OBJETIVO: capturar email y teléfono validados.

CONTENIDO:
1. Título: "¿Cómo te contactamos?".
2. Campos:
   - Email (requerido):
     - Validación formato.
     - Verificar único (debounce, spinner inline).
     - Si ya existe: link "¿Ya tienes cuenta? Inicia sesión".
   - Teléfono (requerido):
     - Input con selector de país (bandera + código).
     - Validación formato.
     - Texto helper "Te enviaremos confirmaciones por WhatsApp".
   - Dirección (opcional):
     - Calle, ciudad, código postal.
3. CHECKBOX:
   - "Quiero recibir notificaciones por WhatsApp" (default ON).
   - "Quiero recibir newsletters" (default OFF).

VALIDACIÓN: en vivo por campo. Email único validado contra Supabase.

REGLAS: sin modales.
```

---

### 7.8 Wizard Signup — Paso 3: Empresa / Contrato

**Ruta:** `/{locale}/signup?step=3`
**Rol:** público
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña el contenido del PASO 3 del signup: EMPRESA / CONTRATO.

OBJETIVO: asociar al usuario con su empresa y validar contrato/
código.

CONTENIDO:
1. Título: "¿Cuál es tu empresa?".
2. Campos:
   - Empresa:
     - Input con autocompletado (search) buscando empresas activas.
     - Cada opción: logo + nombre + tipo plan.
     - Si solo 1 empresa preseleccionada por código de invitación
       (URL param): mostrarla como card preseleccionada con
       badge "Sugerido" y opción "Cambiar empresa".
   - Código de invitación / contrato (opcional o requerido según
     empresa):
     - Input texto monoespaciado.
     - Validar en vivo (debounce): si válido → muestra preview
       del beneficio "Plan: X, Cobertura: Y" en card verde.
     - Si inválido: error rojo.

3. SI NO HAY EMPRESA:
   - Banner azul info "¿Tu empresa no aparece? Habla con
     RRHH para que se registre en clubSOS".

VALIDACIÓN: empresa requerida. Código validado si la empresa
requiere uno.

REGLAS: sin modales.
```

---

### 7.9 Wizard Signup — Paso 4: Seguridad

**Ruta:** `/{locale}/signup?step=4`
**Rol:** público
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña el contenido del PASO 4 del signup: SEGURIDAD.

OBJETIVO: definir password y opcionalmente activar MFA.

CONTENIDO:
1. Título: "Asegura tu cuenta".
2. Campos:
   - Password (requerido):
     - Input con toggle mostrar/ocultar.
     - Medidor de fortaleza en vivo (barra horizontal con segmentos
       débil/medio/fuerte/excelente coloreados).
     - Checklist de requisitos debajo en vivo (cada uno con check
       o cross): mínimo 8 caracteres, una mayúscula, un número,
       un símbolo.
   - Confirmar password (debe coincidir, validación inline).

3. SECCIÓN MFA (opcional):
   - Switch "Activar autenticación en dos pasos (recomendado)".
   - Si ON: texto "Lo configurarás al iniciar sesión por primera
     vez".

4. CHECKBOX (requerido para continuar):
   - "Acepto los términos y condiciones y política de privacidad"
     con links a /terminos y /privacidad.

VALIDACIÓN: password cumple todos los requisitos + match +
términos aceptados.

REGLAS: sin modales.
```

---

### 7.10 Wizard Signup — Paso 5: Resumen editable

**Ruta:** `/{locale}/signup?step=5`
**Rol:** público
**Patrones referenciados:** Wizard, Design System

**Prompt:**

```
Diseña el contenido del PASO 5 final del signup: RESUMEN EDITABLE.

OBJETIVO: revisar todo lo capturado con posibilidad de editar
cada sección antes de crear la cuenta.

CONTENIDO:
1. Título: "Confirma tus datos".
2. Subtítulo: "Revisa que todo esté correcto antes de crear tu
   cuenta".

3. CARDS RESUMEN (uno por paso, scroll vertical):
   Cada card:
   - Header con número de paso + título + botón "Editar" mini
     (link al paso correspondiente).
   - Contenido: lista key-value de los campos capturados.
     Datos sensibles (password) ocultos con bullets.
   - Border-l-4 primary cuando el paso está completo.

4. Sección final:
   - Card destacada "Tu plan":
     - Empresa + tipo de plan + beneficios incluidos.
   - Mini-banner: "Al crear tu cuenta, recibirás un email de
     confirmación".

5. Footer de wizard:
   - "← Anterior" + "Crear mi cuenta" (primary grande con
     ícono check).

ESTADOS:
- Loading durante creación: spinner + "Creando tu cuenta…" en botón.
- Error: banner arriba con código de error específico
  (email duplicado → te llevamos al paso 2).
- Éxito: redirect a /dashboard + toast verde "¡Bienvenido a
  clubSOS!" + tour onboarding opcional.

REGLAS: sin modales. Edit redirige al paso correspondiente.
```

---
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/design/claude-design-prompts.md`
Expected: grew by ~250 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add 5 wizard signup step prompts (6-10)"
```

---

### Task 12: Section 8 — Apéndices

**Files:**
- Modify: `docs/design/claude-design-prompts.md`

- [ ] **Step 1: Append Section 8 with migration table and glossary**

````markdown
## 8. Apéndices

### 8.1 Tabla de migración modal → página

| Modal actual (archivo) | Ruta nueva | Prompt que cubre el rediseño |
|---|---|---|
| `AdminDoctorFormModal.tsx` | `/admin/doctores/nuevo` y `/admin/doctores/[id]/editar` | § 6.5 |
| `AdminServicioFormModal.tsx` | `/admin/servicios/nuevo` · `/admin/servicios/[id]/editar` | § 6.6 |
| `AdminUbicacionFormModal.tsx` | `/admin/ubicaciones/nuevo` · `/admin/ubicaciones/[id]/editar` | § 6.7 |
| `AdminExcepcionFormModal.tsx` | `/admin/excepciones/nuevo` · `/admin/excepciones/[id]/editar` | § 6.13 |
| `BeneficioFormModal.tsx` | `/admin/beneficios/nuevo` · `/admin/beneficios/[id]/editar` | § 6.11 |
| `SubirDocumentoModal.tsx` | `/admin/documentos/subir` | § 6.12 |
| `AdminCitaDetalleModal.tsx` | Panel lateral 3:1 de `/admin/citas` | § 6.9 (Modo B) |
| `EditarUsuarioModal.tsx` (empresa) | `/empresa/usuarios/[id]/editar` | § 5.3 |
| `DetalleModal.tsx` (empresa) | Panel lateral 3:1 | § 5.2 / § 5.3 (Modo B) |
| `AvisoDetailModal.tsx` (miembro) | `/avisos/[id]` | § 4.5 |
| `BeneficioDetailModal.tsx` (miembro) | `/beneficios/[id]` | § 4.7 |
| `AdminPagoVerificacion` (si modal) | `/admin/citas/[id]/verificar-pago` | § 6.9 (link) |

**Excepciones permitidas (siguen siendo modal o no aplica):**

- `HelpModal.tsx` (ayuda contextual — no es formulario).
- Confirm-in-place inline (no es modal real).
- Sheets móviles del patrón Tabla 3:1 (son sheets, no modales).
- Pantallas de auth (login, signup) son páginas propias, no modales.

### 8.2 Glosario de términos del dominio

| Término | Significado |
|---|---|
| **Miembro** | Afiliado al plan de salud, empleado de una empresa cliente. Rol `miembro` en DB. |
| **Empresa_admin** | Administrador de una empresa cliente. Gestiona sus miembros y reportes. Rol `empresa_admin`. |
| **Admin** | Administrador global de la plataforma. Rol `admin`. |
| **Cita** | Reserva de un servicio médico con un doctor en una ubicación y horario. Estados: `pendiente`, `pendiente_admin`, `pendiente_empresa`, `confirmado`, `rechazado`, `cancelado`, `completado`. |
| **Servicio** | Tipo de atención médica (consulta general, pediatría, laboratorio, etc.) con duración por slot y tarifa. |
| **Ubicación** | Clínica/sede física donde se atiende. |
| **Doctor** | Profesional médico con especialidad, servicios habilitados, ubicaciones y horarios. |
| **Beneficio** | Promoción o descuento ofrecido a los miembros de una o varias empresas. |
| **Contrato** | Plan de servicio de una empresa con clubSOS, con vigencia y cupo de miembros. |
| **Documento médico** | Archivo PDF/imagen asociado a un miembro (recetas, exámenes, informes). |
| **Familia** | Familiares registrados por el miembro que también son beneficiarios del plan. |
| **Excepción de horario** | Fecha o rango excluidos de la disponibilidad (vacaciones, feriados). |
| **Slot** | Unidad de tiempo discreta (ej: 30 min) donde se puede agendar una cita. |
| **Aviso** | Comunicado publicado por la empresa o el admin global a sus miembros. |
| **`para_titular`** | Boolean en una cita: si es para el miembro titular o para un familiar. |
| **`estado_sync`** | Campo de estado de la cita en la DB. |

### 8.3 Componentes existentes referenciados

- Sidebar: `components/dashboard/Sidebar.tsx`
- Topbar: `components/dashboard/Topbar.tsx`
- Campana notificaciones: `components/dashboard/CampanaUnificada.tsx`
- DateTime display: `components/dashboard/DateTimeDisplay.tsx`
- MFA banner: `components/dashboard/MfaBanner.tsx`
- Login toast: `components/dashboard/LoginSuccessToast.tsx`
- Nav item: `components/dashboard/NavItem.tsx`
- Pending activation screen: `components/dashboard/PendingActivationScreen.tsx`
- Help modal (permitido): `components/auth/HelpModal.tsx`

---

> **Fin del catálogo de prompts.**
> Para añadir un nuevo prompt, copia la plantilla de spec § 6 y respeta las reglas duras del preámbulo § 0.3.
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/design/claude-design-prompts.md`
Expected: grew by ~80 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): add appendices (modal-to-page migration, glossary)"
```

---

### Task 13: Final review and consistency pass

**Files:**
- Modify: `docs/design/claude-design-prompts.md` (only if issues found)

- [ ] **Step 1: Read the full file and verify spec coverage**

Run:
```bash
wc -l docs/design/claude-design-prompts.md
```
Expected: total ~2,300-2,500 lines.

Open the file and verify every spec section has a corresponding prompt:

- Spec § 5 lists: 0 (preamble), 1 (design system), 2 (5 patterns), 3 (3 auth), 4 (10 miembro screens including wizard overview), 5 (5 empresa), 6 (16 admin), 7 (10 wizard steps), 8 (appendices). All should be present.

- [ ] **Step 2: Search for forbidden placeholders**

Run:
```bash
grep -nE "TBD|TODO|FIXME|XXX|fill in|implement later|appropriate error handling|similar to" docs/design/claude-design-prompts.md
```
Expected: no output (no matches). If there are matches, edit and replace each one with concrete content.

- [ ] **Step 3: Verify breakpoint consistency for 3:1 pattern**

Run:
```bash
grep -nE "3:1.*(md|lg|xl)" docs/design/claude-design-prompts.md
```
Expected: every reference to the 3:1 side-by-side layout uses `xl+` (≥1280px). Layout stacks in `md`–`xl` and uses cards-list in `<md`.

- [ ] **Step 4: Verify route consistency**

Run:
```bash
grep -nE "^\*\*Ruta:" docs/design/claude-design-prompts.md
```
Expected: every screen prompt has a `**Ruta:**` line that starts with `/{locale}/`.

- [ ] **Step 5: Verify no formulario opens a modal**

Run:
```bash
grep -nE "abre[r]? modal|en modal|abrir.+modal" docs/design/claude-design-prompts.md
```
Expected: no instances where a form is described as opening in a modal. Sheets and confirm-in-place are allowed.

- [ ] **Step 6: Commit any cleanup**

If any of the previous steps yielded fixes:

```bash
git add docs/design/claude-design-prompts.md
git commit -m "docs(design): polish prompts after consistency review"
```

If no fixes were needed, skip this commit.

- [ ] **Step 7: Final summary to user**

After all tasks complete, report:

- Final file path and total line count.
- Number of prompts: 1 (design system) + 5 (patterns) + 3 (auth) + 10 (miembro) + 5 (empresa) + 16 (admin) + 10 (wizard expanded) = 50 prompts.
- Commit history (`git log --oneline -- docs/design/claude-design-prompts.md`).
- Recommended usage: paste § 1 first, then § 2, then any screen prompt from § 3–7.

---

## Self-Review Notes

After writing this plan, I verified:

1. **Spec coverage:** Every section in the spec § 5 has at least one task: § 0 in Task 1, § 1 in Task 2, § 2 in Task 3, § 3 in Task 4, § 4 in Tasks 5-6, § 5 in Task 7, § 6 in Tasks 8-9, § 7 in Tasks 10-11, § 8 in Task 12. Task 13 is a verification pass.

2. **Placeholders:** No "TBD", "implement later", "similar to". Every prompt is written out in full.

3. **Consistency:**
   - Every screen prompt declares: ruta, rol, patrones referenciados, prompt body with secciones / estados / responsive / reglas.
   - The 3:1 pattern is consistently described as `xl+` for side-by-side.
   - "Sin modales" is repeated as a hard rule in every screen prompt.
   - Modal-to-page migrations cross-reference between § 8.1 and the corresponding prompt.

4. **Granularity:** Each task is one section of the file (one commit). Steps within a task are: append content → verify line count → commit. Bite-sized and verifiable.
