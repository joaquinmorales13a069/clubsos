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
