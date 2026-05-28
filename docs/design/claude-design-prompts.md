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

Claude Design separa dos cosas: la **configuración del Design System** (un formulario "Set up your design system" que carga tokens, marca y código de referencia como contexto persistente) y los **prompts de chat** (mensajes que generan pantallas individuales). Este archivo cubre ambos.

1. **Configura el Design System primero** usando el formulario de Claude Design. El § 1 de este documento contiene el mapeo campo-por-campo (Company blurb, Link code on GitHub, Add fonts/logos, Any other notes). **No pegues § 1 como mensaje de chat** — su contenido está pensado para los campos del formulario. Una vez guardado, ese contexto se hereda en todas las sesiones de chat siguientes.
2. **Carga los patrones transversales** (§ 2). Abre una nueva conversación y pega los 5 prompts (§ 2.1 a § 2.5), uno por uno o en lote. Guarda cada mockup — son tu vocabulario visual.
3. **Genera pantallas individuales** desde § 3 en adelante. Cada prompt es autocontenido y asume que el Design System (§ 1) y los patrones (§ 2) ya están en el contexto. Puedes pegar prompts uno por uno o agrupar "pantallas hermanas" (listadas al final de cada prompt) en la misma sesión.
4. **Itera** con prompts cortos de refinamiento en la misma conversación ("aumenta el espaciado a 24px", "usa secondary para el badge", "haz el sidebar más estrecho").
5. **Exporta** los mockups aprobados como referencia para la fase de implementación en código.

**Si el formulario de Setup no está disponible o quieres prescindir de él**, el prompt extendido en § 1.2 (fallback) puede pegarse como primer mensaje de chat para que Claude Design genere el design system desde texto plano.

### 0.2 Convenciones globales

| Convención | Valor |
|---|---|
| **Identidad** | clubSOS — capa digital sobre SOS Medical Nicaragua. Multi-tenant: empresas + afiliados (miembros). |
| **Mercado** | Nicaragua. Locale por defecto `es-NI`; locale alterno `en`. |
| **Logo en sidebar** | Wordmark `logo-SOSMedical.webp` (NO el badge clubSOS — el badge solo va en favicon / app icon). |
| **Brand primario** | `#CD2129` rojo SOS — "act now". Botones primarios, brand mark, gradiente top del carnet. |
| **Brand primario hover** | `#B81D24`. |
| **Brand secundario** | `#2266A7` azul "trust" — links, secondary CTAs, info, gradiente bottom del carnet. |
| **Brand secundario hover** | `#1D5A93`. |
| **Neutro** | `#616161` body-secondary. |
| **Background app** | `#FAFAFA` — **nunca pure white a nivel de página**. |
| **Surface** | `#FFFFFF` cards / sheets / sidebar. |
| **Border hairline** | `#E5E7EB` (`border-gray-100/200`). |
| **Tipografía headers** | Poppins (300-700), `leading-tight`, `letter-spacing: -0.01em`. |
| **Tipografía body** | Roboto (300-700), 16/24. |
| **Mono** | Stack `ui-monospace` — solo para ID de miembro en el carnet (`tracking-[0.2em] font-mono font-bold`). |
| **Eyebrows** | `10/14`, UPPERCASE, `tracking-widest`, opacity 60% — ej: `FECHA DE NACIMIENTO`, `N° DE MIEMBRO`. |
| **Radios** | Cards = `rounded-2xl` (16). Buttons / inputs / chips = `rounded-xl` (12). Pills y badges = `rounded-full`. |
| **Toasts** | Vía `sonner` (`toast.success/error/info`). **Nunca** mensajes inline. |
| **Iconos** | `lucide-react`, stroke-only. Toman color del padre (`text-primary` / `text-secondary` / `text-neutral`). |
| **Mobile-first** | Breakpoints Tailwind: `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`. |
| **Fechas** | `DD/MM/YYYY` (convención NI). |
| **Horas** | 12h con `a.m./p.m.` (helper `formatTime12NI`). |
| **Teléfonos** | Internacional, default `+505`. |
| **Idioma del copy** | Español NI por defecto. Strings reales en `messages/{es,en}.json`. |

#### Voz y tono

- **Tuteo**, nunca *usted*. Mensajes a miembros como recepcionista de clínica: *"Hola, Joaquín"*, *"Tu carnet digital, citas y beneficios — todo en un solo lugar."*.
- **Sentence case** para títulos y labels (*"Mis citas"*). Title Case se acepta en botones de acción (*"Recibir Código por WhatsApp"*).
- **UPPERCASE + tracked** solo para meta-labels pequeñas (eyebrows del carnet, status chips).
- **Tono por superficie:**
  - **Miembro** — friendly, reassuring. Saludos cortos.
  - **Admin / Empresa_admin** — operacional, denso, neutral.
  - **Sistema / errores** — directo, accionable: *"Por favor ingresa un número de teléfono válido (mínimo 8 dígitos)."*.
  - **Success** — ¡! con moderación: *"¡Bienvenido de vuelta!"*, *"Código enviado a tu WhatsApp."*.
- **Puntuación**: Spanish inverted (`¿`, `¡`). Em dash (`—`) para asides. Sin Oxford commas.
- **Emoji**: **no se usan**. Única excepción: el glifo `⚠` inline en errores de validación.
- **Unicode**: `—` como fallback de valor nulo, `·` (middle dot) como separador inline (`"Enviado a +505 · cambiar número"`).

#### Vocabulario (usa estas palabras exactas)

| Usa | NO uses |
|---|---|
| Cita / Citas | Reserva, Booking |
| Miembro | Usuario, Cliente |
| Empresa | Compañía, Organización |
| Carnet digital | Tarjeta, ID |
| Beneficio | Promoción, Descuento |
| Documento médico | Archivo |
| Recibir Código por WhatsApp | Send OTP, Enviar SMS |
| Ingresar / Iniciar Sesión | Loguear, Sign in |
| Familia / Mi Familia | Dependientes |
| Avisos | Notificaciones, News |

### 0.3 Reglas duras (aplican a TODOS los prompts)

#### Layout y navegación

1. **Cero modales para formularios.** Crear/editar/subir = página dedicada con ruta propia.
2. **Patrón tabla 3:1** (§ 2) para todas las listas con detalle. Grid lado a lado solo en `xl+` (≥1280px); en `md`–`xl` el panel se apila debajo; en `<md` lista de cards + sheet inferior.
3. **Wizards** con stepper sticky-top + summary lateral sticky en `lg+`. En móvil el summary colapsa a chip bottom + sheet.
4. **Confirmaciones destructivas** = confirm-in-place inline (no modal). Para flujos críticos = página dedicada `/eliminar` con resumen del impacto.
5. **Sheets móviles** permitidos solo para detalle contextual dentro del patrón 3:1.
6. **Mobile-first** siempre. Container padding **16 móvil · 24 md · 32 lg+**.

#### Estados y feedback

7. **Skeleton independiente por sección** en homes y listas (cada bloque carga / muestra skeleton de forma autónoma).
8. **Estados obligatorios** en cada componente con datos: Loading · Empty · Error · Success.
9. **Toasts vía sonner** (`toast.success/error/info`). Nunca mensajes inline.

#### Superficies (glass discipline)

10. **Glass es garnish, no salsa.** Solo en: sidebar desktop (`aside.hidden md:flex`), topbar sticky, sheet móvil overlay, hamburger button móvil. **Receta:** `bg-white/80 backdrop-blur-xl border-gray-200/70`.
11. **NO glass dentro del content area** ni en cards normales. El carnet del miembro tampoco — es un gradiente sólido.
12. **App background** `#FAFAFA` — nunca pure white a nivel de página. Cards = `#FFFFFF` con `border-gray-100` y `shadow-sm`.

#### Gradientes y ornamentación

13. **Único gradiente permitido**: el carnet digital — `linear-gradient(to bottom right, #CD2129 → #A41B22 → #2266A7)`, más dos círculos `bg-white/5` como decoración interna.
14. **Nada de gradientes en texto, iconos, botones o headers.**
15. **No patterns, no textures, no grain, no full-bleed imagery en producto.** La única foto del producto es `login-image.webp` (mitad de viewport en `lg+` solo en auth).

#### Sombras

16. **Cards reposo** `shadow-sm`. **Cards hover interactivas** `shadow-md` + `hover:-translate-y-0.5`.
17. **Sidebar desktop** sombra solo borde derecho: `shadow-[2px_0_20px_rgba(0,0,0,0.04)]`.
18. **Topbar** sombra solo borde inferior: `shadow-[0_2px_12px_rgba(0,0,0,0.04)]`.
19. **Carnet digital** `shadow-lg`.
20. **No sombras de color.** Siempre negro a alpha bajo.

#### Motion e interacción

21. **Default transition** `transition-all duration-200 ease-out`.
22. **Hover de card** `hover:-translate-y-0.5` + `hover:shadow-md`.
23. **Press** `active:translate-y-px` (base-ui Button default).
24. **Page enter del login**: `animate-in fade-in slide-in-from-bottom-4 duration-500`.
25. **No bouncy easings, no springs.** Solo `ease-out`.
26. **Focus visible** `ring-2 ring-primary/40` (o `ring-destructive/20` para destructive). Solo `:focus-visible`.

#### Hover/press de elementos clave

| Elemento | Hover | Press |
|---|---|---|
| Primary button | `bg-primary/90` | `translate-y-px` |
| Secondary button | `bg-secondary/80` | `translate-y-px` |
| Outline button | `bg-muted` | `translate-y-px` |
| Ghost / nav item | `bg-muted` (gray-100) | — |
| Link | `text-secondary/80` + `underline-offset-4 hover:underline` | — |
| Interactive card | `shadow-md` + `-translate-y-0.5` | (return to rest) |
| Topbar CTA pill (blue) | `bg-secondary/90` + arrow `translate-x-0.5 -translate-y-0.5` | — |

#### Iconografía

27. **Tamaños:** `w-3.5` (chevrons secundarios), `w-4` (inline / button), `w-5` (nav, topbar), `w-8` (empty state, tinted `text-gray-200`).
28. **Iconos comunes ya en uso:** `LayoutDashboard, CalendarDays, CalendarCheck, CalendarX, Gift, Megaphone, FileText, Users, Building2, BarChart3, Settings, SlidersHorizontal, MapPin, Stethoscope, UserRound, UserCog, ShieldCheck, UserCheck, Menu, X, ChevronRight, ArrowUpRight, RefreshCw, Eye, EyeOff, Bell, Search, Clock, Shield`.

---

## 1. Design System foundational

> El Design System NO se carga vía chat — se configura en el formulario **"Set up your design system"** de Claude Design (Company name, Link code, Fonts/logos, Notes). Esta sección mapea cada campo del formulario al contenido correspondiente de clubSOS. Si por algún motivo no puedes usar el formulario, el § 1.2 ofrece un prompt de chat equivalente.

### Prompt 1.1 — Mapeo del formulario "Set up your design system"

#### A. Company name and blurb (campo "Company name and blurb")

```
clubSOS — Plataforma médica multi-tenant para empresas y sus afiliados.
Las empresas registran a sus empleados (miembros) como beneficiarios de
un plan de salud; los miembros agendan citas médicas, gestionan documentos
médicos y reclaman beneficios. Tres roles: admin global, empresa_admin,
miembro. Stack: Next.js 16 App Router + React 19 + Tailwind v4 +
shadcn/ui + Supabase.
```

#### B. Link code on GitHub (campo "Link code on GitHub")

Pega la URL de tu repositorio. Esto le da acceso a `components/ui/` (shadcn), `tailwind.config.*`, `app/globals.css` y a las pantallas existentes — el redesign respetará las primitivas ya instaladas.

#### C. Link code from your computer (alternativa si el repo es privado)

Selecciona estos archivos/carpetas dentro del repo clubSOS:

- `app/[locale]/layout.tsx` — para que detecte tipografías Google Fonts.
- `app/globals.css` — tokens y variables CSS actuales.
- `tailwind.config.*` y `components.json` — configuración shadcn.
- `components/ui/` — primitivas instaladas.
- `components/dashboard/` (un par representativos: `Sidebar.tsx`, `Topbar.tsx`, una card de cada rol) — estilo actual de referencia.

#### D. Upload a .fig file

Opcional. Subir el brandbook o un Figma del producto si existe. Si no hay, dejar vacío.

#### E. Add fonts, logos and assets

- **Logo clubSOS** — desde `public/` si está disponible.
- **Tipografías**: Poppins (300-700) + Roboto (300-700). Si tienes los `.woff2` súbelos; de lo contrario las "Other notes" abajo declaran que Claude Design las cargue desde Google Fonts.
- **Imágenes de marca** — banner/hero si las tienes.

#### F. Any other notes? (campo "Any other notes?")

```
PALETA SEMÁNTICA
- primary: #CD2129 (rojo brand, acciones principales)
- primary-foreground: white
- secondary: #2266A7 (azul, links, secondary actions)
- secondary-foreground: white
- neutral: #616161 (texto secundario)
- background: #FAFAFA · surface: white · surface-elevated: white + shadow-sm
- border: #E5E7EB · muted: #F3F4F6
- success: #10B981 · warning: #F59E0B · error: #DC2626 · info: #2266A7

TIPOGRAFÍA (Google Fonts)
- Headers: Poppins (300-700)
- Body: Roboto (300-700)
- Escala: h1 32/40, h2 24/32, h3 20/28, h4 18/26, body 16/24, sm 14/20, xs 12/16

RADIOS Y ESPACIADO
- Radios: sm 6, md 8, xl 12, 2xl 16, full 9999
- Espaciado base 4 (4/8/12/16/20/24/32/40/48/64/80/96)
- Container padding: 16 móvil · 24 md · 32 lg+

SOMBRAS
- sm 0 1px 2px rgb(0 0 0 / .05)
- md 0 4px 6px -1px rgb(0 0 0 / .1)
- lg 0 10px 15px -3px rgb(0 0 0 / .1)
- glass: backdrop-blur(12px) + bg-white/60 + border-white/40

ICONOGRAFÍA: lucide-react.

PRINCIPIOS Y REGLAS DURAS (aplicables a TODAS las pantallas)
1. Mobile-first con breakpoints Tailwind (sm 640, md 768, lg 1024, xl 1280).
2. Cero modales para formularios — crear/editar/subir = página dedicada.
3. Patrón "Tabla 3:1": grid 4 cols (3 tabla + 1 panel contextual) solo en
   xl+ (≥1280px). En md–xl el panel se apila debajo. En <md cards + sheet inferior.
4. Wizards con stepper sticky-top + summary lateral sticky en lg+; en móvil
   el summary colapsa a chip bottom con sheet.
5. Confirmaciones destructivas = confirm-in-place inline (NO modal); para
   flujos críticos = página dedicada /eliminar con resumen del impacto.
6. Sheets móviles permitidos solo para detalles dentro del patrón 3:1.
7. Skeleton independiente por sección. Empty/Loading/Error/Success siempre.
8. Glassmorphism sutil reservado para cards flotantes (credential, hero).
9. Toasts vía sonner (success/error/info) — nunca mensajes inline.
10. Microinteracciones: transition-all duration-200 ease-out. Focus ring-2
    ring-primary/40.

COMPONENTES BASE QUE DEBEN EXISTIR
Button (primary/secondary/outline/ghost/destructive · sm/md/lg ·
default/hover/active/disabled/loading), Input (text/email/password/search/
number con label arriba + helper + error inline), Select/Combobox con search,
Checkbox/Radio/Switch, Textarea autoresize, Card (default/elevated/glass/
interactive), Badge/Chip (default/success/warning/error/info/outline · sm/md),
Avatar (con fallback iniciales · sm/md/lg), Tabs (horizontal y vertical),
Stepper horizontal con números, Toast sonner-style, Sheet (derecha desktop,
abajo móvil), Sidebar vertical colapsable con grupos, Topbar con search global
+ campana notificaciones + avatar dropdown, EmptyState (icono 64 + título +
desc + CTA), Skeleton (texto/card/avatar/tabla), Progress + Spinner,
Breadcrumbs, Pagination, DatePicker, TimePicker.

IDIOMA: copy en español por defecto.
```

#### Flujo de Setup paso a paso

1. Abre **Claude Design → New project → Set up your design system**.
2. Completa "Company name and blurb" con A.
3. Pega URL del repo en "Link code on GitHub" (B), o selecciona los archivos de C si es privado.
4. Salta o llena D (Figma) según tengas.
5. Sube logo y tipografías en E.
6. Pega el bloque completo de F en "Any other notes?".
7. Guarda. Claude Design queda preparado: el contexto persiste entre sesiones de chat.

### Prompt 1.2 — Fallback chat prompt (solo si NO usas el formulario de Setup)

> Pega esto como primer mensaje en un chat nuevo si por alguna razón no puedes usar el formulario "Set up your design system". Genera un mockup tipo "design system showcase" que sirve como contexto manual para los prompts posteriores.

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

> **Un único prompt** para generar los 5 patrones que se referencian desde cada pantalla. Pégalo en una conversación nueva (con el Design System ya configurado en el Setup). Claude Design devolverá 5 mockups en serie. Guárdalos — son tu vocabulario UI base para todas las pantallas posteriores.

### Prompt § 2 — Generar los 5 patrones transversales

```
Necesito que generes 5 mockups de referencia para clubSOS, en serie y en
este orden. Cada uno debe ser un mockup HTML responsive completo
(móvil <md, md–xl, xl+). Aplica el design system ya cargado (paleta
SOS red #CD2129 + trust blue #2266A7, Poppins/Roboto, rounded-xl/2xl,
glass = bg-white/80 backdrop-blur-xl border-gray-200/70, copy en
español NI con tuteo, lucide-react, sin emoji, sin gradientes excepto
el carnet).

═══════════════════════════════════════════════════════════════════
MOCKUP 1 — LAYOUT SHELL (Sidebar + Topbar)
═══════════════════════════════════════════════════════════════════

Estructura:
- Sidebar fijo izquierda 240px en lg+ (glass:
  bg-white/80 backdrop-blur-xl border-gray-200/70 +
  shadow-[2px_0_20px_rgba(0,0,0,0.04)] solo borde derecho).
  Versión colapsada 64px. En <md = drawer off-canvas + botón
  hamburguesa flotante (cápsula bg-white/90).
  - Wordmark logo-SOSMedical arriba (NO el badge clubSOS).
  - Grupos colapsables con divisores hairline. Cada item: ícono lucide
    20px + label Poppins 14 + opcional badge contador.
  - Item activo: bg-primary/10 + text-primary + barra lateral izquierda
    primary 3px.
  - Footer del sidebar: avatar + nombre + rol-badge en blue + logout.

- Topbar sticky-top 64px (glass:
  bg-white/80 backdrop-blur-xl + shadow-[0_2px_12px_rgba(0,0,0,0.04)]
  solo borde inferior).
  - Botón refresh (RefreshCw) con animate-spin cuando pending.
  - Search global al centro en lg+, ícono en md.
  - Pill blue "Ir a sosmedical.com.ni" con ArrowUpRight (hover:
    bg-secondary/90, arrow translate-x-0.5 -translate-y-0.5).
  - Switch idioma ES/EN.
  - Campana Bell con badge contador.
  - Avatar dropdown con nombre + rol + logout.

- Content area: max-w-screen-2xl centrado.
  Padding 16 móvil · 24 md · 32 lg+.

Responsive:
- <md: sidebar oculto, botón hamburguesa abre drawer overlay glass.
- md–lg: sidebar colapsado por defecto.
- lg+: sidebar expandido por defecto.

Genera 3 vistas: móvil con drawer abierto, md colapsado, lg+ expandido.

═══════════════════════════════════════════════════════════════════
MOCKUP 2 — PATRÓN TABLA 3:1 (lista + panel contextual stateful)
═══════════════════════════════════════════════════════════════════

Layout xl+ (≥1280px): grid grid-cols-4 gap-6.
- Cols 1–3: tabla.
  - Toolbar: search (ícono Search izquierda), chips de filtros activos,
    botón "Filtros avanzados" (SlidersHorizontal), botón primary
    "+ Nuevo".
  - Tabla headers sticky, filas seleccionables (radio o checkbox),
    zebra muy sutil, hover bg-muted, fila seleccionada
    bg-primary/5 + border-l-4 border-primary.
  - Paginación abajo derecha.
- Col 4: panel sticky (top-24, h-fit), bg-surface, rounded-2xl,
  border, shadow-sm, padding 24. STATEFUL:

  MODO A (sin selección):
  - Header "Resumen" + ícono BarChart3.
  - 2–3 KPI mini-cards stack vertical.
  - Divider hairline.
  - Sección "Filtros avanzados" expandida siempre: selects,
    date pickers, switches.
  - Divider.
  - Botones "Exportar CSV", "Importar".

  MODO B (con selección de una fila):
  - Header: ícono + nombre del registro + botón X cerrar.
  - 4–6 líneas key-value de metadata.
  - Divider.
  - Lista vertical de acciones contextuales (ícono + label):
    Editar (link a /recurso/[id]/editar, NUNCA modal),
    Ver historial, Duplicar,
    Eliminar (color destructive, confirm-in-place inline).

  MODO C (multi-selección):
  - Bulk-actions + conteo de seleccionados.

Responsive:
- <md: tabla se vuelve lista de cards rounded-xl shadow-sm. Al tocar
  una card aparece sheet inferior (bg-white/90 backdrop-blur-xl)
  cubriendo 70% del viewport con detalle + acciones. Toolbar search
  y botón "Filtros" arriba.
- md–xl: tabla ancho completo. KPIs en fila horizontal arriba.
  Cuando hay selección, panel detalle debajo de la tabla como
  sección sticky.
- xl+: layout 3:1 lado a lado.

Eliminar = confirm-in-place. El botón "Eliminar" se transforma in-place
en "¿Confirmar eliminación? · [Sí, eliminar] · [Cancelar]". Para
flujos críticos (eliminar empresa, eliminar usuario activo) navegar
a /recurso/[id]/eliminar con resumen del impacto.

Genera 4 vistas: móvil sin selección, móvil con sheet abierto,
desktop xl Modo A, desktop xl Modo B.

═══════════════════════════════════════════════════════════════════
MOCKUP 3 — WIZARD GENÉRICO (stepper + sticky summary)
═══════════════════════════════════════════════════════════════════

Layout lg+: grid 3 cols (2fr + 1fr).

Top sticky stepper horizontal:
- Bullets numeradas conectadas con líneas.
- Estados: completado (primary + check), actual (primary outline +
  número), pendiente (gris).
- Click en pasos completados navega de vuelta. Bajo el stepper:
  "Paso 3 de 5: Doctor + Fecha + Horario".

Columna principal (2/3):
- Card grande rounded-2xl shadow-sm, padding 32.
- Inputs grandes, labels Poppins semibold, helper text Roboto.
- Validación en vivo: check verde a la derecha del input cuando válido;
  mensaje rojo + glifo ⚠ debajo cuando inválido.
- Smart defaults con badge "Sugerido" o "Más frecuente" (color primary).

Columna lateral (1/3):
- Sticky summary card. Header "Resumen de tu cita" / "Resumen de
  registro".
- Lista de pasos: check verde + label + valor + botón "Editar" que
  salta al paso. Pasos pendientes en gris claro con "—".

Footer sticky-bottom interno:
- Botón secundario "← Anterior" (oculto en paso 1) + spacer +
  botón primary "Continuar →". Último paso: "Confirmar y enviar".

Responsive:
- <md: stepper colapsa a barra de progreso fina + "Paso 3 de 5".
  Summary se vuelve chip fijo bottom: "Ver resumen ↑" + contador,
  al tocar abre sheet inferior con summary completo.
- md–lg: summary debajo del contenido (no sticky lateral).
- lg+: summary lateral sticky a la derecha.

Genera 3 vistas: móvil con sheet de summary abierto, md sin summary
lateral, lg+ completo.

═══════════════════════════════════════════════════════════════════
MOCKUP 4 — PÁGINA-FORMULARIO (reemplaza modal de form)
═══════════════════════════════════════════════════════════════════

Estructura:
- Breadcrumb arriba con separadores ›:
  "Doctores › Crear nuevo".
- Header: h1 Poppins bold 32 + subtítulo neutral + acciones derecha
  (botón outline "Cancelar" + botón primary "Guardar" o "Crear").
- Container max-w-3xl simple, max-w-5xl con preview lateral.
- Form en card rounded-2xl bg-surface shadow-sm padding 32:
  - Secciones agrupadas con divisores hairline + título de sección
    Poppins semibold sm uppercase tracking-wide neutral.
  - 1 col móvil, 2 cols md+ en forms anchos.
  - Inputs con label arriba, helper text debajo en gris, error con
    glifo ⚠ + texto rojo.
- Sticky bottom action bar en móvil con "Cancelar" + "Guardar"
  full-width.
- Validación en vivo al perder foco; banner de resumen de errores
  arriba si hay errores al enviar.
- Loading: botón "Guardar" → spinner + "Guardando…", inputs disabled.
- Success: toast sonner verde + redirect a la lista.

Cancelar con cambios sin guardar = confirm-in-place inline
"¿Descartar cambios? · [Sí] · [No]".

Responsive:
- <md: 1 col, action bar sticky bottom full-width.
- md+: hasta 2 cols, action bar en header.

Genera 2 vistas: móvil con form largo, desktop 2 cols.

═══════════════════════════════════════════════════════════════════
MOCKUP 5 — ESTADOS (Empty / Skeleton / Error / Confirm-in-place)
═══════════════════════════════════════════════════════════════════

Genera UNA página showcase con 4 estados en grid 2x2 de cards.

A. EMPTY STATE
   - Ícono lucide 64px text-gray-200 centrado.
   - Título Poppins semibold xl.
   - Descripción Roboto sm neutral.
   - CTA primary con ícono +.
   - Padding 64 vertical.
   - Variantes mencionadas en copy: tabla vacía, búsqueda sin
     resultados, primera vez.

B. SKELETON
   - Mostrar 4 tipos en mini-grid:
     - Tabla: 5 filas con cells animate-pulse bg-muted rounded.
     - Card: bloque rounded con líneas skeleton.
     - KPI: número 32 + label sm skeleton.
     - Wizard step: 3 grupos de inputs skeleton.

C. ERROR STATE
   - Ícono AlertTriangle 64 color error.
   - Título "Algo salió mal" Poppins semibold.
   - Descripción + sugerencia: "Intenta recargar o contacta soporte."
   - Botón outline "Reintentar" + link "Contactar soporte".

D. CONFIRM-IN-PLACE
   - Mostrar la transformación del botón:
     Estado base: botón ghost text-destructive "Eliminar".
     Estado activo: mini-row inline
     "¿Confirmar eliminación? · [Sí, eliminar] (bg-destructive
     text-white) · [Cancelar] (ghost)".
   - Sin overlay, sin modal. Transición 200ms ease-out.
```

---

## 3. Auth

> **Un único prompt** para las 3 pantallas de auth (Login, Signup overview, MFA verificar+enrolar). Pégalo en una conversación nueva; Claude Design devuelve los mockups en serie.

### Prompt § 3 — Generar las 3 pantallas de auth

```
Necesito 3 mockups para auth de clubSOS. Aplica el design system
cargado (SOS red #CD2129 + trust blue #2266A7, Poppins/Roboto,
glass disciplinado, copy es-NI con tuteo).

Layout maestro: split-screen 5/7 en lg+, stack en <lg.
- Izquierda (form, 5/12): bg-white, padding 32, max-w-md.
- Derecha (brand, 7/12, oculto <lg): foto login-image.webp (clinical,
  masked healthcare worker + patient, naturally lit) + card flotante
  glass (bg-white/80 backdrop-blur-xl) con highlight.

Page enter del login: animate-in fade-in slide-in-from-bottom-4
duration-500.

═══════════════════════════════════════════════════════════════════
MOCKUP 1 — LOGIN
═══════════════════════════════════════════════════════════════════

Ruta: /{locale}/login

Form column:
- Logo wordmark SOS MEDICAL arriba.
- h1 "Bienvenido de vuelta".
- Subtítulo "Ingresa para gestionar tus citas y beneficios".
- TABS: "Recibir Código por WhatsApp" (default) · "Ingresar con
  contraseña".

Tab "Recibir Código por WhatsApp":
  - Input teléfono con selector país (bandera + +505 prefilled).
  - Helper "Te enviaremos un código de 6 dígitos por WhatsApp".
  - Botón primary full-width "Recibir Código por WhatsApp".
  - Tras enviar → mismo form con OTP input 6 cells + texto
    "Enviado a +505 8888-8888 · cambiar número" (separador ·).

Tab "Ingresar con contraseña":
  - Input email / Input password (toggle Eye/EyeOff).
  - Link sm "¿Olvidaste tu contraseña?" alineado derecha,
    color secondary.
  - Botón primary full-width "Iniciar Sesión".

Footer del form: "¿No tienes cuenta? Regístrate" con link a /signup,
color secondary, hover underline.

Estados:
- Loading: botón con spinner + "Ingresando…", inputs disabled.
- Error de validación: banner rojo arriba con glifo ⚠ + mensaje
  ("⚠ Por favor ingresa un número de teléfono válido").
- Error de auth: toast sonner rojo.
- OTP error: cells OTP en rojo + mensaje.

Brand column (lg+):
- Foto login-image.webp full-bleed cubriendo la mitad.
- Card glass flotante con CalendarCheck 32 + título "Agenda tus citas
  con un solo toque" + bullets de beneficios.

Responsive:
- <md: solo form col, padding 24, logo arriba, contenido centrado
  vertical.
- md–lg: form col centrado max-w-md.
- lg+: split 5/7.

═══════════════════════════════════════════════════════════════════
MOCKUP 2 — SIGNUP (overview wizard)
═══════════════════════════════════════════════════════════════════

Ruta: /{locale}/signup

Usa el patrón Wizard (Mockup 3 del § 2). Stepper de 5 pasos:
1. Datos personales · 2. Contacto · 3. Empresa / Contrato ·
4. Seguridad · 5. Resumen editable.

Form column:
- Logo wordmark arriba.
- Stepper horizontal sticky-top (en móvil colapsa a "Paso X de 5"
  con barra de progreso fina).
- Contenido del paso (detalle de cada paso está en § 7).
- Footer "← Anterior" + "Continuar →".

Brand column (lg+):
- Visual con bullets de beneficios:
  - ✓ Citas médicas en 24h
  - ✓ Beneficios exclusivos
  - ✓ Documentos digitales seguros
  - ✓ Familia incluida
  (cada uno con ícono lucide CheckCircle2 color success).
- Card glass flotante con resumen progreso del usuario.

Estados:
- Loading global durante envío: spinner + "Creando tu cuenta…".
- Error: banner arriba del paso con glifo ⚠.

Reglas: stepper permite volver atrás con click; no saltar adelante.

═══════════════════════════════════════════════════════════════════
MOCKUP 3 — MFA (2 vistas: verificar + enrolar)
═══════════════════════════════════════════════════════════════════

Layout centrado max-w-md, fondo bg-background.

A. VERIFICAR (ruta /{locale}/mfa/verificar, post-login si MFA enrolado):
   - Logo wordmark arriba.
   - h1 "Verificación en dos pasos".
   - Subtítulo "Ingresa el código de 6 dígitos de tu app de
     autenticación".
   - Input OTP 6 cells (auto-jump, paste detecta los 6).
   - Botón primary full-width "Verificar".
   - Link sm "Usar código de respaldo" → muestra input alternativo
     debajo.
   - Link xs gris "Cerrar sesión" abajo.

B. ENROLAR (desde ajustes o post-signup):
   - h1 "Activa autenticación en dos pasos".
   - Subtítulo "Escanea el QR con tu app".
   - QR code 256px centrado.
   - Texto pequeño con código manual monoespaciado para copiar.
   - Input OTP 6 cells para confirmar.
   - Botón primary "Activar 2FA".
   - Link gris "Saltar por ahora" (solo flujo post-signup).

Estados:
- Loading: spinner en botón.
- Error: OTP cells rojas + mensaje "⚠ Código incorrecto. Intenta
  de nuevo".
- Éxito: toast sonner verde + redirect a /dashboard.

Responsive:
- <md: padding 16, cells OTP más pequeñas.
- md+: max-w-md, padding 32.
```

---

## 4. Miembro

> **Un único prompt** para las 10 pantallas del rol miembro. Pégalo en una conversación; Claude Design genera los mockups en serie.

### Prompt § 4 — Generar las 10 pantallas del miembro

```
Genera 10 mockups responsive para el rol "miembro" de clubSOS.
Aplica el design system y los patrones transversales del § 2.
Copy es-NI con tuteo, voz friendly y reassuring (saludos cortos:
"Hola, {nombre}", "Aquí tienes un resumen de tu cuenta").

Layout shell común: sidebar glass + topbar glass + content area
max-w-screen-2xl centrado con padding 16/24/32.

═══════════════════════════════════════════════════════════════════
PANTALLA 1 — HOME (/dashboard)
═══════════════════════════════════════════════════════════════════

Secciones:
1. MFA banner condicional (warning amarillo, ShieldAlert,
   "Protege tu cuenta con autenticación en dos pasos" + botón
   outline "Activar ahora" link /mfa/verificar).
2. Hero greeting + credential card flotante:
   - Grid md: 7/12 hero + 5/12 carnet.
   - Hero: "Hola, {Nombre}" h1 Poppins bold 32 con {Nombre} color
     primary. Subtítulo Roboto neutral.
   - Carnet digital (UNICO componente con gradiente):
     bg gradient linear-gradient(to bottom right, #CD2129 →
     #A41B22 → #2266A7), rounded-2xl, shadow-lg.
     Contiene: 2 círculos decorativos bg-white/5; avatar/iniciales
     56; nombre completo; empresa; eyebrows (UPPERCASE tracking-widest
     opacity-60) "N° DE MIEMBRO" + valor `tracking-[0.2em] font-mono`
     truncado; "FECHA DE NACIMIENTO" + valor DD/MM/YYYY; rotación
     leve 1–2deg en hover.
3. Próxima cita destacada:
   - Si existe: card grande rounded-2xl shadow-sm con CalendarClock
     40 en círculo bg-primary/10 text-primary; badge estado
     (pendiente amarillo, confirmado verde); servicio + doctor +
     ubicación; fecha/hora amigable (12h a.m./p.m.); acciones
     "Ver detalles" + dropdown "Agregar a calendario" (Google/
     Outlook/Apple/.ics).
   - Si no: empty state "No tienes citas próximas" + CTA primary
     "Pedir nueva cita" link /citas/nueva.
4. Quick actions row (grid 2 móvil, 4 md):
   pills bg-surface rounded-2xl shadow-sm hover:shadow-md
   hover:-translate-y-0.5, con ícono 32 + label Poppins semibold:
   "Pedir Cita" (CalendarPlus), "Ver Beneficios" (Gift),
   "Mis Documentos" (FileText), "Mi Familia" (Users).
5. Grid 3 cols (md+) de resúmenes:
   A. Últimos Avisos (2): cards mini con título + fecha relativa +
      dot status.
   B. Beneficios Recientes (3): cards horizontales mini con ícono +
      título + fecha fin.
   C. Documentos Recientes (3): lista con ícono tipo archivo +
      nombre + fecha + botón download mini.
   Header de cada card: título + link "Ver todos →" color secondary.
6. Mis Servicios Cubiertos: cards horizontales con ícono servicio +
   nombre + uso "3/12 visitas" + barra progreso. Cada card
   clickeable.

Estados: skeleton por sección; empty por bloque; error por bloque
sin romper los demás.

Responsive:
- <md: 1 col stack, carnet debajo del hero.
- md: 2 cols hero+carnet, resúmenes apilados de a 2.
- lg+: layout completo con 3 cols en resúmenes.

═══════════════════════════════════════════════════════════════════
PANTALLA 2 — MIS CITAS (lista, /dashboard/citas)
═══════════════════════════════════════════════════════════════════

NO usa tabla 3:1 (miembro tiene pocas citas). Lista de cards.

Secciones:
1. Header: h1 "Mis Citas" + subtítulo "Gestiona tus citas médicas".
   Botón primary derecha "+ Pedir Nueva Cita" link /citas/nueva
   (NUNCA modal).
2. Tabs subrayadas: "Próximas" (default) · "Pasadas" · "Canceladas".
   Cada tab con contador.
3. Lista de citas como cards rounded-2xl shadow-sm:
   - Avatar/ícono servicio 24 en círculo color del estado.
   - Servicio + doctor (Poppins semibold).
   - Ubicación (MapPin) + fecha/hora (Clock) (Roboto sm).
   - Badge estado a la derecha: pendiente (warning), pendiente_admin
     (info), confirmado (success), completado (neutral), cancelado/
     rechazado (error).
   - Acciones derecha: "Ver detalle" link /citas/[id], dropdown
     "Agregar a calendario", "Cancelar" (solo dentro de ventana
     24h — confirm-in-place inline).

Estados: skeleton 4 cards; empty por tab con CTA "Pedir Cita"; error.

Responsive:
- <md: cards full-width, acciones en menú "..." con sheet inferior.
- md+: cards en 1 col max-w-4xl centradas.

═══════════════════════════════════════════════════════════════════
PANTALLA 3 — WIZARD NUEVA CITA OVERVIEW (/dashboard/citas/nueva)
═══════════════════════════════════════════════════════════════════

Usa patrón Wizard del § 2. 5 pasos consolidados (cada paso detallado
en § 7):
1. Paciente · 2. Servicio + Ubicación · 3. Doctor + Fecha + Horario
· 4. Pago · 5. Confirmar.

Layout: stepper sticky top, contenido principal lg:col-span-2,
summary sticky derecha lg:col-span-1.

Extras:
- Badge "Sugerido" en items autoseleccionados (1 sola ubicación,
  1 solo doctor, fecha más próxima con disponibilidad).
- Stepper permite volver a pasos completados con click.
- En móvil summary lateral colapsa a chip "Ver resumen ↑" bottom
  que abre sheet.

Estados: loading durante envío "Creando tu cita…"; error con código
P0001 mapeado a mensaje ("El horario ya no está disponible.");
éxito → redirect /citas con toast sonner verde "Cita creada
exitosamente".

═══════════════════════════════════════════════════════════════════
PANTALLA 4 — MIS AVISOS (/dashboard/avisos)
═══════════════════════════════════════════════════════════════════

Secciones:
1. Header h1 "Avisos" + subtítulo + chip contador "X sin leer".
2. Tabs: "Todos" · "Sin leer" · "Archivados".
3. Lista de avisos como cards horizontales rounded-xl:
   - Dot indicator izquierda (primary si sin leer, gris si leído).
   - Título Poppins semibold + extracto Roboto sm 2 líneas truncado.
   - Fecha relativa derecha abajo.
   - Click navega /avisos/[id] (página, NUNCA modal).
4. Pagination si > 20.

Estados: skeleton 5 cards; empty "No tienes avisos aún"; error.

Responsive: <md full-width cards; md+ lista max-w-4xl.

═══════════════════════════════════════════════════════════════════
PANTALLA 5 — AVISO DETALLE (/dashboard/avisos/[id], reemplaza modal)
═══════════════════════════════════════════════════════════════════

Secciones:
1. Breadcrumb: "Avisos › [Título truncado]".
2. Header: botón outline "← Volver" izquierda; h1 título Poppins
   bold 28; meta: autor + fecha DD/MM/YYYY + chip categoría.
3. Contenido principal max-w-3xl:
   - Body prose typography (paragraphs, lists, links).
   - Imágenes embebidas si las hay.
4. Sidebar lg+ derecha:
   - Card "Más avisos" con 3 relacionados/recientes.
   - Card "Acciones": archivar, compartir.

Estados: skeleton; error 404 "Aviso no encontrado" + link volver.

Responsive: <lg sidebar al final; lg+ sidebar derecha.

Marca como leído al cargar (client-side).

═══════════════════════════════════════════════════════════════════
PANTALLA 6 — MIS BENEFICIOS (/dashboard/beneficios)
═══════════════════════════════════════════════════════════════════

Secciones:
1. Header h1 "Mis Beneficios" + subtítulo + chip "X beneficios
   activos".
2. Toolbar:
   - Search "Buscar beneficio…".
   - Chips filtros: "Todos", "Salud", "Bienestar", "Educación",
     "Otros".
3. Grid de cards (3 cols md, 4 cols xl):
   BeneficioCard:
   - Imagen aspect-video rounded-t-2xl.
   - Badge categoría arriba sobre imagen.
   - Título Poppins semibold.
   - Descripción Roboto sm 2 líneas truncada.
   - Fecha fin "Vigente hasta DD/MM/YYYY" sm gris.
   - Botón outline full-width "Ver detalles" link /beneficios/[id].

Estados: skeleton 8 cards; empty "No hay beneficios activos para tu
empresa"; error.

Responsive: 1 / 2 / 3 / 4 cols.

═══════════════════════════════════════════════════════════════════
PANTALLA 7 — BENEFICIO DETALLE (/dashboard/beneficios/[id])
═══════════════════════════════════════════════════════════════════

Secciones:
1. Breadcrumb "Beneficios › [Título]".
2. Header con botón "← Volver".
3. Layout md+ 2 cols (2/3 + 1/3):
   IZQ:
   - Imagen grande aspect-video rounded-2xl.
   - Título h1.
   - Descripción larga prose.
   - "¿Cómo usarlo?" con pasos numerados.
   - Términos y condiciones (collapsible).
   DER sidebar:
   - Card "Información": categoría badge, vigencia, proveedor.
   - Card "Tu beneficio":
     - Si tiene código: código grande monoespaciado +
       botón "Copiar" inline (toast verde al copiar).
     - Botón primary full-width "Activar / Reclamar".
   - Card "Ubicaciones" si aplica.

Estados: skeleton; error 404; beneficio expirado: banner gris arriba
"Este beneficio venció el DD/MM/YYYY".

═══════════════════════════════════════════════════════════════════
PANTALLA 8 — MIS DOCUMENTOS (/dashboard/documentos)
═══════════════════════════════════════════════════════════════════

Secciones:
1. Header h1 "Mis Documentos Médicos" + subtítulo.
2. Toolbar:
   - Search "Buscar documento…".
   - Filtros: tipo (chips), año (select).
   - Toggle lista/grid.
3. Grid o lista de cards:
   DocumentoCard:
   - Ícono grande tipo archivo (FileText/Image).
   - Nombre Poppins semibold.
   - Tipo badge + fecha del documento DD/MM/YYYY.
   - Acciones: download (Download) + preview (Eye) si PDF/imagen.
4. Pagination.

Estados: skeleton 6 cards; empty "Tu empresa aún no ha subido
documentos"; error.

Preview: click → nueva pestaña o navega /documentos/[id]/ver.
NUNCA modal. Móvil: sheet inferior con viewer embedded.

Responsive: 1 / 2 / 3 cols.

═══════════════════════════════════════════════════════════════════
PANTALLA 9 — MI FAMILIA (/dashboard/familia)
═══════════════════════════════════════════════════════════════════

Secciones:
1. Header:
   - h1 "Mi Familia" + chip "X / Y miembros usados".
   - Botón primary "+ Agregar Familiar" navega /familia/nuevo
     (página, NUNCA modal).
2. Barra de progreso de cupos usados (si plan con límite).
3. Grid de familiares (2 cols md, 3 cols lg):
   FamiliarCard rounded-2xl shadow-sm:
   - Avatar iniciales 56 con border-2 border-white shadow-sm.
   - Nombre Poppins semibold.
   - Relación (Hijo/a, Cónyuge, etc.) badge.
   - Fecha nacimiento DD/MM/YYYY + edad.
   - Acciones: Editar (link /familia/[id]/editar) + Eliminar
     (confirm-in-place).

Estados: skeleton 4 cards; empty "Agrega familiares para incluirlos
en tu plan"; error; cupo lleno: banner warning "Has alcanzado el
límite. Contacta a tu empresa para ampliar."

Responsive: 1 / 2 / 3 cols.

═══════════════════════════════════════════════════════════════════
PANTALLA 10 — MIS AJUSTES (/dashboard/ajustes)
═══════════════════════════════════════════════════════════════════

NO modal — página de configuración personal con navegación interna.

Layout:
- Sidebar interno izquierdo (lg+) con navegación de secciones:
  "Perfil", "Seguridad", "Notificaciones", "Idioma".
- Contenido principal: form de la sección actual.

Secciones (cada una en su propia card con botón Guardar):

1. PERFIL:
   - Avatar 96 con botón "Cambiar foto" debajo.
   - Nombre completo, cédula (readonly), email (readonly),
     teléfono +505, fecha nacimiento DD/MM/YYYY, sexo (select).

2. SEGURIDAD:
   - Cambiar contraseña: actual + nueva + confirmar + medidor
     fortaleza (segmentos débil/medio/fuerte/excelente).
   - MFA: estado + botón activar/desactivar (link /mfa/verificar).
   - Sesiones activas: lista dispositivo + ubicación + última
     actividad + botón "Cerrar".

3. NOTIFICACIONES:
   - Switches por canal (Email · WhatsApp · In-app) y por categoría
     (citas, avisos, beneficios).

4. IDIOMA:
   - Select: Español · English.

Estados: loading global al guardar; toast sonner verde "Guardado";
error: banner rojo arriba del form.

Responsive:
- <md: nav lateral colapsa a tabs horizontales scroll-x.
- md+: sidebar + contenido.
```

---

## 5. Empresa_admin

> **Un único prompt** para las 5 pantallas del rol empresa_admin. Tono operacional, denso, neutral: *"Control total del ecosistema Club SOS Medical."*, *"Gestiona los registros, citas y beneficios de tu equipo de un vistazo."*.

### Prompt § 5 — Generar las 5 pantallas del empresa_admin

```
Genera 5 mockups responsive para el rol "empresa_admin" de clubSOS.
Aplica el design system, los patrones del § 2, voz operacional y
densa (no usa el tono friendly del miembro). Locale es-NI.

Layout shell común: sidebar + topbar glass; content padding 16/24/32.

═══════════════════════════════════════════════════════════════════
PANTALLA 1 — HOME EMPRESA (/dashboard/empresa)
═══════════════════════════════════════════════════════════════════

Secciones:
1. Hero saludo: "Hola, {Nombre}" h1 + "Panel de {Nombre Empresa}"
   subtítulo.
2. CARD DESTACADA "Uso del contrato":
   - Background bg-surface, border, shadow-sm (NO gradiente).
   - Título "Uso del contrato" Poppins semibold.
   - Métricas: "Contratados X · Activos Y · Disponibles Z"
     (separador ·).
   - Barra de progreso grande h-4 rounded-full bg-secondary.
   - Texto sm "Renovación: DD/MM/YYYY".
3. Alert banner condicional (citas_pendientes > 0):
   warning amarillo + AlertTriangle + texto "Tienes X citas
   pendientes de aprobación" + botón outline "Revisar".
4. KPI cards (grid 2x2 móvil, 4x1 md+):
   - Total miembros (Users)
   - Miembros activos (UserCheck)
   - Miembros pendientes (UserX, color warning si > 0)
   - Citas del mes (CalendarDays)
   Cada card: ícono lucide 24 en círculo color/10, número 32
   Poppins bold, label sm Roboto neutral. Border-gray-100 +
   shadow-sm + hover:shadow-md hover:-translate-y-0.5.
5. Quick actions row (3 pills):
   "Nuevo Miembro" (UserPlus) → /empresa/usuarios/nuevo,
   "Ver Reportes" (BarChart3) → /empresa/reportes,
   "Ajustes" (Settings) → /empresa/ajustes.
6. Grid 2 cols lg+:
   A. Citas pendientes: lista 5 con nombre miembro + servicio +
      fecha + badge estado + acciones (Aprobar/Rechazar
      confirm-in-place).
   B. Miembros recientes: lista 5 con avatar + nombre + email +
      chip estado.
7. Gráfica "Citas por servicio" (donut o bar) en card propia.
   Series con colores secondary (#2266A7) y primary (#CD2129).

Estados: skeleton por sección; empty por lista vacía; error por
bloque.

Responsive: <md 1 col; md KPIs 2x2; lg+ KPIs 4x1 + listas 2 cols.

═══════════════════════════════════════════════════════════════════
PANTALLA 2 — CITAS EMPRESA (/dashboard/empresa/citas)
═══════════════════════════════════════════════════════════════════

Usa patrón Tabla 3:1 del § 2.

Columnas tabla:
- Miembro (avatar + nombre)
- Servicio
- Doctor
- Fecha y hora (DD/MM/YYYY, 12h a.m./p.m.)
- Estado (badge: pendiente_empresa warning, pendiente info,
  confirmado success, completado neutral, cancelado/rechazado error)
- Acciones (icon buttons: ver, aprobar, rechazar)

Panel MODO A (sin selección):
- KPIs mini: Total mes / Pendientes / Confirmadas / Canceladas.
- Filtros expandidos: estado (multi), servicio (select), rango
  fechas (date range), miembro (search).
- Acciones: Exportar CSV.

Panel MODO B (con selección):
- Avatar miembro + nombre + email.
- Servicio · Doctor · Ubicación · Fecha · Cita ID.
- Estado actual badge grande.
- Acciones contextuales:
  - Si pendiente_empresa: "Aprobar" (primary) + "Rechazar" (outline
    destructive) ambos confirm-in-place con textarea mensaje
    opcional.
  - Otros estados: "Ver historial" + "Contactar miembro".

Hereda estados y responsive del patrón Tabla 3:1.

═══════════════════════════════════════════════════════════════════
PANTALLA 3 — USUARIOS EMPRESA (/dashboard/empresa/usuarios)
═══════════════════════════════════════════════════════════════════

Usa patrón Tabla 3:1.

Columnas: avatar+nombre, email, cédula, rol badge (miembro/
empresa_admin), estado badge, fecha registro DD/MM/YYYY,
acciones (ver/editar/suspender).

Panel MODO A:
- KPIs: Total / Activos / Pendientes / Suspendidos.
- Filtros: estado, rol, búsqueda.
- Botones: Exportar CSV, Importar masivo (link a
  /empresa/usuarios/importar, NO modal).

Panel MODO B:
- Avatar + datos resumen.
- Acciones: Editar (link /empresa/usuarios/[id]/editar, NO modal),
  Ver historial citas, Suspender/Activar (confirm-in-place),
  Reenviar invitación.

Botón primary toolbar: "+ Nuevo Miembro" link /empresa/usuarios/nuevo
(página dedicada usando patrón Página-Formulario del § 2).

═══════════════════════════════════════════════════════════════════
PANTALLA 4 — REPORTES EMPRESA (/dashboard/empresa/reportes)
═══════════════════════════════════════════════════════════════════

Secciones:
1. Header h1 "Reportes" + subtítulo + selector rango fechas.
2. Tabs: "Resumen" (default) · "Citas" · "Beneficios" · "Documentos".

RESUMEN:
- 4 KPIs grandes (grid 2x2 móvil, 4x1 md+).
- Gráfica línea "Citas por mes" (12 meses) — series color secondary.
- Donut "Distribución por servicio".
- Tabla compacta "Top 5 miembros activos".

CITAS:
- KPIs específicos.
- Heatmap calendar (citas por día).
- Stacked bar (estados por mes).
- Tabla por servicio.

BENEFICIOS:
- Beneficios más usados (top 10 horizontal bar).
- Total reclamos / Tasa de uso / Activos.

DOCUMENTOS:
- Total / Promedio por miembro.
- Tabla por tipo.

Footer fixed: botón outline derecha "Exportar reporte (PDF)" →
genera PDF y dispara toast con link.

Estados: skeleton por gráfica; empty si rango sin datos; error.

Responsive: <md gráficas apiladas full-width; md+ grids 2 cols.

═══════════════════════════════════════════════════════════════════
PANTALLA 5 — AJUSTES EMPRESA (/dashboard/empresa/ajustes)
═══════════════════════════════════════════════════════════════════

Layout: sidebar interno con secciones (lg+) / tabs scroll-x móvil.

Secciones:
1. DATOS GENERALES:
   - Logo upload (avatar 96 + botón cambiar).
   - Nombre legal, RUC, dirección, teléfono +505, email contacto.
2. CONTRATO (mostly readonly):
   - Tipo plan, total contratado, fechas inicio/fin DD/MM/YYYY.
   - Si admin global lo permite: botón "Solicitar ampliación".
3. BRANDING:
   - Color primario opcional (color picker dentro de límites).
4. NOTIFICACIONES:
   - Switches por tipo (nuevo miembro, cita pendiente, etc.).
   - Multi-email input para destinatarios.

Cada sección guarda independiente.

Estados: loading guardar; toast verde "Guardado"; error banner.

Responsive: <md tabs scroll-x; md+ sidebar + contenido.
```

---

## 6. Admin

> **Un único prompt** para las 16 pantallas del admin global. Tono operacional, neutral, denso. Es un prompt extenso — Claude Design lo procesa en serie generando cada pantalla como un mockup independiente.

### Prompt § 6 — Generar las 16 pantallas del admin

```
Genera 16 mockups responsive para el rol "admin global" de clubSOS
(SOS Medical staff). Aplica design system + patrones del § 2.
Voz operacional, locale es-NI.

═══════════════════════════════════════════════════════════════════
PANTALLA 1 — HOME ADMIN (/dashboard/admin)
═══════════════════════════════════════════════════════════════════

1. Hero "Hola, {Nombre}" + "Panel global".
2. Alert banner si citas_pendientes > 0 (warning + CTA "Revisar").
3. KPIs (6 cards: grid 2 móvil, 3 md, 6 lg):
   Total empresas, Empresas activas, Total usuarios, Usuarios activos,
   Citas pendientes (warning si > 0), Citas del mes.
   Card aparte abajo: Documentos totales + Beneficios activos.
4. Quick actions row (4 pills):
   "Nueva Empresa" (Building2) → /admin/empresas/nuevo
   "Nuevo Doctor" (Stethoscope) → /admin/doctores/nuevo
   "Subir Documento" (FileText) → /admin/documentos/subir
   "Crear Beneficio" (Gift) → /admin/beneficios/nuevo
5. Grid 2 cols lg+:
   A. Citas pendientes globales (8): miembro + empresa + servicio +
      fecha + acciones (Aprobar/Rechazar confirm-in-place + Ver
      detalle link).
   B. Empresas recientes (5): logo + nombre + contrato + fecha.
6. Gráfica "Citas por servicio" global.

Estados: skeleton por sección; empty / error por bloque.

═══════════════════════════════════════════════════════════════════
PANTALLA 2 — USUARIOS ADMIN (/dashboard/admin/usuarios)
═══════════════════════════════════════════════════════════════════

Patrón Tabla 3:1.

Columnas: avatar+nombre, email, cédula, empresa badge, rol
(admin/empresa_admin/miembro), estado, fecha registro.

Panel A: KPIs Total/Activos/Pendientes/Suspendidos; filtros
empresa multi + rol + estado + búsqueda; exportar/importar masivo
(link a página).

Panel B: datos resumen; acciones Editar (link), Ver citas,
Suspender (confirm-in-place), Cambiar rol (confirm-in-place con
select inline), Eliminar (link a /admin/usuarios/[id]/eliminar
página dedicada con warning de impacto).

Crear/editar = páginas /admin/usuarios/nuevo y /[id]/editar.

═══════════════════════════════════════════════════════════════════
PANTALLA 3 — DOCTORES LISTA (/dashboard/admin/doctores)
═══════════════════════════════════════════════════════════════════

Patrón Tabla 3:1.

Columnas: avatar+nombre, especialidad, ubicación principal,
servicios cubiertos (chips truncados a 2 + "+N"), estado, acciones.

Panel A: KPIs Total/Activos/Inactivos; filtros especialidad,
ubicación, servicio, estado.

Panel B: avatar grande + datos; servicios completos; horarios
resumen; acciones Ver detalle (link /admin/doctores/[id]), Editar,
Gestionar horarios (link /admin/doctores/[id]?tab=horarios),
Inactivar (confirm-in-place).

Botón primary: "+ Nuevo Doctor" link /admin/doctores/nuevo.

═══════════════════════════════════════════════════════════════════
PANTALLA 4 — DOCTOR DETALLE (/dashboard/admin/doctores/[id])
═══════════════════════════════════════════════════════════════════

Reemplaza modal. Layout con tabs.

- Breadcrumb "Doctores › [Nombre]".
- Header: avatar grande + nombre + especialidad + badges (estado,
  ubicación) + botones derecha (Editar link, Inactivar
  confirm-in-place).
- Tabs horizontales: "Información" · "Servicios" · "Horarios" ·
  "Excepciones" · "Citas".

Tabs:
1. INFORMACIÓN: card datos personales (cédula, email, teléfono +505,
   dirección); card datos profesionales (registro médico, biografía,
   idiomas).
2. SERVICIOS: lista habilitados con duración + tarifa; botón
   "+ Agregar servicio" abre select inline o lleva a página.
3. HORARIOS: calendario semanal con bloques de disponibilidad;
   botón "Agregar horario" link /admin/doctores/[id]/horarios/nuevo.
4. EXCEPCIONES: lista fechas excluidas; botón link /admin/excepciones/nuevo.
5. CITAS: mini-tabla últimas 20 citas del doctor.

Estados: skeleton del tab activo; empty para cada lista.

Responsive: <md tabs scroll-x; md+ tabs completos.

═══════════════════════════════════════════════════════════════════
PANTALLA 5 — DOCTOR CREAR/EDITAR (/dashboard/admin/doctores/nuevo y /[id]/editar)
═══════════════════════════════════════════════════════════════════

Página-Formulario del § 2.

Secciones scroll vertical:
1. Datos personales: avatar upload, nombre, cédula, email,
   teléfono +505.
2. Datos profesionales: registro médico, especialidad (select),
   idiomas (multi).
3. Ubicación principal y secundarias (multi-select).
4. Servicios habilitados (multi-select con duración por defecto).
5. Estado (switch activo/inactivo, solo en edición).
6. Biografía (textarea con counter).

Header: breadcrumb + h1 "Nuevo doctor" / "Editar [Nombre]".
Action bar: Cancelar (vuelve /admin/doctores) + Crear/Guardar.

Validación inline; resumen errores arriba al enviar; loading;
toast verde + redirect; error banner.

═══════════════════════════════════════════════════════════════════
PANTALLA 6 — SERVICIOS (/dashboard/admin/servicios + /nuevo + /[id]/editar)
═══════════════════════════════════════════════════════════════════

Patrón Tabla 3:1.

Columnas: nombre con ícono, categoría badge, duración slot (min),
tarifa, doctores que lo ofrecen (contador chip), estado, acciones.

Panel A: KPIs Total/Activos/Categorías; filtros categoría, estado.

Panel B: detalle servicio; acciones Editar (link),
Ver doctores (link /admin/doctores filtrado), Duplicar (link
/nuevo precargado), Inactivar (confirm-in-place).

Botón primary "+ Nuevo Servicio" → /admin/servicios/nuevo.

Crear/Editar (Página-Formulario):
- nombre, descripción, categoría select, duración slot (number min),
  tarifa (number), ícono (selector visual de íconos lucide),
  color de badge (color picker simple).

═══════════════════════════════════════════════════════════════════
PANTALLA 7 — UBICACIONES (/dashboard/admin/ubicaciones + /nuevo + /[id]/editar)
═══════════════════════════════════════════════════════════════════

Patrón Tabla 3:1.

Columnas: nombre, dirección truncada, ciudad, doctores asignados
(contador), estado.

Panel A: KPIs Total/Activas; filtros ciudad, estado.

Panel B: mapa mini placeholder + dirección completa; lista doctores
en esa ubicación; acciones Editar, Inactivar.

Crear/Editar (página): nombre, dirección con autocompletado
(placeholder de Google Places), ciudad, código postal, teléfono +505,
horario apertura, coordenadas lat/lng, foto principal upload.

═══════════════════════════════════════════════════════════════════
PANTALLA 8 — EMPRESAS (/dashboard/admin/empresas + /nuevo + /[id]/editar)
═══════════════════════════════════════════════════════════════════

Patrón Tabla 3:1.

Columnas: logo + nombre, RUC, plan/contrato, miembros activos/
contratados "X/Y", renovación DD/MM/YYYY, estado.

Panel A: KPIs Total/Activas/En renovación próxima (<30d)/Vencidas;
filtros estado, plan, búsqueda.

Panel B: logo + nombre + RUC + dirección; métricas (miembros,
citas mes, beneficios reclamados); acciones Editar (link), Ver
miembros (link filtrado), Ver contratos (link), Suspender
(confirm-in-place), Eliminar (link a /admin/empresas/[id]/eliminar
página con resumen de impacto: miembros suspendidos, contratos
cerrados).

Crear/Editar (Página-Formulario) con secciones:
1. Datos legales (nombre, RUC, dirección).
2. Contacto (email, teléfono +505).
3. Contrato (tipo plan, fecha inicio, fecha fin DD/MM/YYYY, número
   de contratados).
4. Branding (logo upload).

═══════════════════════════════════════════════════════════════════
PANTALLA 9 — CITAS ADMIN (/dashboard/admin/citas)
═══════════════════════════════════════════════════════════════════

Patrón Tabla 3:1.

Columnas: ID corto, miembro (avatar + nombre + empresa chip),
servicio, doctor, ubicación, fecha y hora (DD/MM/YYYY +
12h a.m./p.m.), estado badge, pago chip
(pendiente/verificado/n.a.), acciones (ver, aprobar, rechazar).

Panel A: KPIs Total mes/Pendientes/Confirmadas/Canceladas/
Verificación pago; filtros estado + empresa + servicio + doctor +
rango fechas + estado pago; tab toggle "Lista" · "Calendario"
(calendario = pantalla 10); exportar/importar masivo.

Panel B (reemplaza AdminCitaDetalleModal):
- Avatar miembro + ID + estado badge grande.
- Sección Detalle: servicio, doctor, ubicación, fecha, duración;
  miembro nombre/empresa/contacto; paciente (si para_titular=false):
  nombre/teléfono/cédula.
- Sección Pago: estado + monto + método + ver comprobante.
- Sección Notificaciones: timeline cita_eventos
  (creada → confirmada → recordatorio).
- Acciones:
  - Si pendiente_admin: Confirmar (primary) / Rechazar (outline
    destructive) confirm-in-place con textarea mensaje.
  - Si pago pendiente: link "Verificar pago" → página
    /admin/citas/[id]/verificar-pago.
  - Cancelar (confirm-in-place).
  - Editar (link a página si aplica).

═══════════════════════════════════════════════════════════════════
PANTALLA 10 — CALENDARIO DE CITAS (/dashboard/admin/citas/calendario)
═══════════════════════════════════════════════════════════════════

Layout:
- Header sticky: tabs vista Día/Semana (default)/Mes; selector fecha
  con flechas anterior/siguiente + botón Hoy; filtros derecha doctor/
  ubicación/estado; botón "Nueva cita".
- Cuerpo calendario:
  SEMANAL: grid 7 cols (lun-dom), filas 30 min de 06:00 a 22:00;
  cada cita = bloque rounded color por estado con nombre miembro +
  servicio. Click sobre bloque abre sheet lateral md+ o sheet
  inferior móvil con detalle/acciones (reusa panel B de pantalla 9).
  DÍA: 1 col grande.
  MES: cells de día con dots/contadores por estado; click día → vista
  día.

Realtime: citas actualizan en vivo (suscripción supabase_realtime).

Responsive: <md solo vista día; md+ vistas completas.

REGLAS: detalle NO abre modal — abre sheet lateral o panel flotante.

═══════════════════════════════════════════════════════════════════
PANTALLA 11 — BENEFICIOS ADMIN (/dashboard/admin/beneficios + /nuevo + /[id]/editar)
═══════════════════════════════════════════════════════════════════

Patrón Tabla 3:1.

Columnas: imagen mini + título, categoría badge, empresas asignadas
("Todas" o contador), vigencia rango DD/MM/YYYY, estado (activa,
expirada, programada), reclamos contador.

Panel A: KPIs Total/Activos/Más reclamado; filtros categoría,
empresa, estado.

Panel B: imagen + título; descripción corta, código (si aplica),
vigencia; stats (vistas, reclamos, tasa); acciones Editar (link),
Duplicar, Pausar/Reactivar (confirm-in-place), Eliminar
(confirm-in-place).

Crear/Editar (Página-Formulario) con secciones:
1. Contenido: título, descripción larga (rich text), imagen upload
   (aspect 16:9).
2. Categorización: categoría select, tags.
3. Beneficiarios: "Todas las empresas" / "Empresas específicas"
   (multi-select).
4. Vigencia: fecha inicio + fecha fin DD/MM/YYYY.
5. Mecánica: con código (input + generador) / sin código.
6. Estado: switch activo.

═══════════════════════════════════════════════════════════════════
PANTALLA 12 — DOCUMENTOS ADMIN (/dashboard/admin/documentos + /subir)
═══════════════════════════════════════════════════════════════════

Patrón Tabla 3:1.

Columnas: ícono tipo + nombre, tipo badge, usuario destinatario
(avatar + nombre), empresa, fecha documento DD/MM/YYYY, tamaño,
acciones (descargar, preview, eliminar).

Panel A: KPIs Total / por tipo top; filtros tipo, empresa, usuario,
rango fechas; botón primary toolbar "+ Subir Documento" link
/admin/documentos/subir (NO modal).

Panel B: preview thumbnail + metadata completa; acciones Descargar,
Re-asignar (link /editar), Eliminar (confirm-in-place).

Subir documento (página dedicada):
- Drag-and-drop area grande (con fallback click).
- Form metadata: nombre, tipo, usuario destinatario (search), fecha
  documento DD/MM/YYYY.
- Bulk: subir múltiples con metadata común editable por archivo.
- Action bar Cancelar / Subir.
- Progress bar por archivo.

═══════════════════════════════════════════════════════════════════
PANTALLA 13 — EXCEPCIONES (/dashboard/admin/excepciones + /nuevo + /[id]/editar)
═══════════════════════════════════════════════════════════════════

Patrón Tabla 3:1.

Columnas: título/motivo, scope (Global/Doctor/Ubicación/Servicio),
fecha inicio, fecha fin, duración (días), estado (vigente, futura,
pasada), citas afectadas (contador).

Panel A: KPIs Total vigentes / Futuras / Citas afectadas próximos
30d; filtros scope, rango.

Panel B: detalle excepción; lista citas afectadas con badge si
fueron auto-canceladas; acciones Editar (link), Eliminar
(confirm-in-place).

Crear/Editar (Página-Formulario) con secciones:
1. Tipo: select Global / Doctor específico / Ubicación específica /
   Servicio específico.
2. Selector(es) según tipo (multi-select).
3. Fechas: rango (date range) o día completo + recurrencia
   (semanal/mensual opcional).
4. Motivo (textarea) + tipo (vacaciones / feriado / capacitación /
   otro).
5. Acciones automáticas: switch "Auto-cancelar citas afectadas y
   notificar".

Banner warning antes de guardar si afecta a > 0 citas.

═══════════════════════════════════════════════════════════════════
PANTALLA 14 — REPORTES ADMIN (/dashboard/admin/reportes)
═══════════════════════════════════════════════════════════════════

Header h1 "Reportes" + selector rango fechas + botón "Exportar".
Tabs: "Resumen" · "Empresas" · "Citas" · "Documentos" · "Beneficios"
· "Usuarios".

RESUMEN:
- 6 KPIs grandes.
- Gráfica línea crecimiento usuarios por mes — color secondary.
- Donut distribución empresas por plan.
- Tabla top 5 empresas más activas.

Sub-reportes: cada tab = página interna con gráficas específicas
(donut, bar, line, heatmap, mini-tablas) y filtros propios.

Estados: skeleton por gráfica; empty si rango sin datos; error.

Responsive: <md gráficas apiladas; md+ grids 2 cols.

Exportar = PDF + toast con link.

═══════════════════════════════════════════════════════════════════
PANTALLA 15 — AUDITORÍA (/dashboard/admin/auditoria)
═══════════════════════════════════════════════════════════════════

Patrón Tabla 3:1 (modo lectura — sin edit/delete inline).

Columnas: timestamp (relativo + tooltip absoluto DD/MM/YYYY HH:mm),
actor (avatar + nombre + rol), acción badge (created/updated/deleted/
login/etc.), recurso badge (tipo + ID), IP / dispositivo.

Panel A: KPIs Eventos hoy / semana / Actores únicos / Acciones
fallidas; filtros expandidos siempre (actor search, acción multi,
recurso tipo, rango fechas, resultado éxito/fallo); exportar
JSON / CSV.

Panel B: detalle completo evento:
- Actor + rol + IP + user agent.
- Recurso + ID + nombre legible.
- Diff (si update): JSON viewer antes/después.
- Metadata adicional.
- Acciones: copiar JSON, link al recurso.

═══════════════════════════════════════════════════════════════════
PANTALLA 16 — SISTEMA (/dashboard/admin/sistema)
═══════════════════════════════════════════════════════════════════

Layout: sidebar interno (lg+) / tabs scroll-x móvil con secciones
"General", "Citas", "Notificaciones", "Integraciones",
"Mantenimiento".

1. GENERAL: nombre plataforma, logo global, color brand (limitado),
   idiomas habilitados, links a /terminos y /privacidad.
2. CITAS: ventana cancelación (horas) input number, auto-confirmación
   switch, recordatorio 24h switch.
3. NOTIFICACIONES: templates WhatsApp habilitados (lista con estado
   approved), email FROM, RESEND key (mask), canales activos.
4. INTEGRACIONES: status Supabase / Resend / WhatsApp Cloud API;
   edge functions estado.
5. MANTENIMIENTO: modo mantenimiento switch (banner global), limpieza
   logs antiguos, reindexar search.

Cada sección guarda independiente con botón Guardar; toast verde;
error banner.
```

---

## 7. Wizards expandidos

> **Un único prompt** para los 10 pasos detallados (5 del wizard de citas + 5 del wizard de signup). Estos prompts complementan los overviews de las pantallas 4.3 y 3.2 — detallan el contenido de cada paso individual asumiendo que el shell del wizard (stepper, summary, footer) ya está renderizado.

### Prompt § 7 — Generar los 10 pasos expandidos

```
Genera 10 mockups, en serie, para los pasos individuales de los dos
wizards de clubSOS. Aplica design system, patrón Wizard del § 2,
copy es-NI con tuteo (miembro) o neutral (signup).

═══════════════════════════════════════════════════════════════════
PARTE A — WIZARD DE NUEVA CITA (5 pasos)
═══════════════════════════════════════════════════════════════════

Cada paso renderiza dentro de la columna principal del wizard
(la izquierda en lg+, full-width en móvil).

──────────────────────────────────────────
PASO 1/5 — PACIENTE
──────────────────────────────────────────

Título: "¿Para quién es la cita?".
Subtítulo: "Selecciona el paciente que recibirá la atención".

Toggle grande (2 cards lado a lado md+, stack móvil):
- "Para Mí (Titular)": avatar del miembro + nombre.
- "Para un Familiar": ícono Users.
Card activa: border-primary border-2 + bg-primary/5.

Si "Para un familiar":
- Grid de cards con familiares registrados.
- Cada card: avatar + nombre + relación badge + edad.
- Card final: "+ Agregar nuevo familiar" link /familia/nuevo (página,
  NUNCA modal).
- Si no hay familiares: empty state inline con CTA.

Validación: avanzar requiere selección (titular o un familiar).

──────────────────────────────────────────
PASO 2/5 — SERVICIO + UBICACIÓN
──────────────────────────────────────────

Título: "¿Qué servicio necesitas?".

Servicios: grid de cards (2 cols md, 3 cols lg):
- Ícono lucide grande en círculo bg-primary/10 text-primary.
- Nombre Poppins semibold.
- Descripción corta sm.
- Badge "Cubierto" si está en el plan.
- Hover: border-primary + shadow-md hover:-translate-y-0.5.
- Selected: border-primary border-2 + bg-primary/5 + check.

Tras seleccionar servicio, aparece sub-sección Ubicación:
- Si 1 sola disponible: card pre-seleccionada con badge "Sugerido"
  (color primary) + nombre + dirección + botón "Ver más opciones"
  (oculto si solo 1).
- Si > 1: grid de cards con nombre + dirección + distancia
  (opcional) + badge.

Validación: avanzar requiere servicio + ubicación.

──────────────────────────────────────────
PASO 3/5 — DOCTOR + FECHA + HORARIO UNIFICADO
──────────────────────────────────────────

Título: "Elige tu cita".

Layout lg+: 3 cols (2/3 + 1/3). Móvil stack.

Selector horizontal de doctores sticky arriba:
- Avatars en row scroll-x con nombre debajo.
- Si solo 1 doctor: card grande con info + badge "Sugerido".
- Click cambia doctor y refresca slots (mantiene fecha).

Col izquierda (calendario):
- Calendario mensual interactivo.
- Días con disponibilidad: dot indicator primary.
- Día sin disponibilidad: gris claro disabled.
- Día seleccionado: bg-primary text-white circular.
- Navegación de mes con flechas + label "Mayo 2026".
- Auto-selección: primera fecha con disponibilidad si no hay
  selección previa, badge "Más próxima".

Col derecha (slots):
- Header fecha amigable "Miércoles, 28 de mayo".
- Grid de slot buttons (2-3 cols):
  - Cada slot: bloque rounded-xl con hora "09:00 a.m.".
  - Disponible: border + hover bg-primary/10.
  - Seleccionado: bg-primary text-white.
  - No disponible: gris disabled.
- Empty: "No hay horarios disponibles este día. Prueba otra fecha."

Realtime: slots actualizan en vivo si alguien más reserva.

Validación: requiere doctor + fecha + slot.

──────────────────────────────────────────
PASO 4/5 — PAGO
──────────────────────────────────────────

Título: "Método de pago".

Si cubierto 100%: banner verde "Esta cita está cubierta por tu plan.
No se requiere pago." + skip step automático con badge.

Si requiere pago:
- Total a pagar: card destacada con monto Poppins bold 32 +
  desglose (servicio + IVA si aplica).
- Tabs de métodos:
  - Tarjeta (Pasarela): logo + texto "Serás redirigido a checkout
    seguro al confirmar".
  - Transferencia bancaria: datos cuenta (banco, número, beneficiario)
    + drag-and-drop "Subir comprobante" + input opcional referencia.
  - Efectivo en sede (si aplica): card con instrucciones.

Validación: si requiere pago, método obligatorio. Si transferencia,
comprobante obligatorio. Loading durante upload.

──────────────────────────────────────────
PASO 5/5 — CONFIRMAR
──────────────────────────────────────────

Título: "Confirma tu cita".
Subtítulo: "Revisa la información antes de confirmar".

Resumen estructurado (card grande):
- Sección Paciente: avatar + nombre + relación + edad + botón
  "Editar".
- Sección Servicio y ubicación: ícono + nombre + ubicación + edit.
- Sección Doctor: avatar + nombre + especialidad + edit.
- Sección Fecha y horario: CalendarClock + fecha completa + hora
  12h + duración + edit.
- Sección Pago: método + monto + edit (si aplica).

Avisos:
- Política de cancelación: "Puedes cancelar hasta 24 horas antes"
  en card info azul.
- Confirmaciones: "Recibirás un email + WhatsApp con la confirmación".

Términos:
- Checkbox "He leído y acepto los [términos y condiciones]"
  con link /terminos.
- Sin aceptar = botón Confirmar deshabilitado.

Footer: "← Anterior" + "Confirmar y Enviar" (primary grande).

Estados:
- Loading: spinner + "Creando tu cita…".
- Error: banner con código mapeado (SLOT_TAKEN → "Ese horario ya no
  está disponible. Te llevamos al paso 3 para elegir otro").
- Éxito: redirect /citas + toast verde + animación check.

═══════════════════════════════════════════════════════════════════
PARTE B — WIZARD DE SIGNUP (5 pasos)
═══════════════════════════════════════════════════════════════════

Cada paso renderiza dentro del split-screen del signup (form a la
izquierda, brand a la derecha en lg+).

──────────────────────────────────────────
PASO 1/5 — DATOS PERSONALES
──────────────────────────────────────────

Título: "Cuéntanos sobre ti".
Subtítulo: "Esta información nos ayuda a personalizar tu cuenta".

Campos (2 cols md+, 1 col móvil):
- Nombre completo (requerido, mínimo 2 palabras).
- Cédula / DNI (texto con máscara según país, requerido, verificar
  único debounce 500ms con spinner inline + check verde).
- Fecha de nacimiento DD/MM/YYYY (date picker, no futuro, edad
  mínima 18 o señalar si menor).
- Sexo (select: Femenino / Masculino / Otro / Prefiero no decir).

Validación en vivo por campo. Glifo ⚠ + mensaje en errores.

──────────────────────────────────────────
PASO 2/5 — CONTACTO
──────────────────────────────────────────

Título: "¿Cómo te contactamos?".

Campos:
- Email (requerido, formato + único validado contra Supabase con
  debounce). Si ya existe: link "¿Ya tienes cuenta? Inicia sesión".
- Teléfono (requerido, selector país bandera + código, default +505,
  validación formato). Helper "Te enviaremos confirmaciones por
  WhatsApp".
- Dirección (opcional): calle, ciudad, código postal.

Checkboxes:
- "Quiero recibir notificaciones por WhatsApp" (default ON).
- "Quiero recibir newsletters" (default OFF).

──────────────────────────────────────────
PASO 3/5 — EMPRESA / CONTRATO
──────────────────────────────────────────

Título: "¿Cuál es tu empresa?".

Campos:
- Empresa (input con autocompletado buscando empresas activas).
  Cada opción: logo + nombre + tipo plan.
  Si solo 1 preseleccionada por código de invitación URL:
  card preseleccionada con badge "Sugerido" + opción "Cambiar
  empresa".
- Código de invitación / contrato (opcional o requerido según
  empresa):
  - Input monoespaciado.
  - Validar en vivo (debounce): si válido → preview "Plan: X,
    Cobertura: Y" en card verde.
  - Si inválido: error rojo + ⚠.

Si no hay empresa: banner azul "¿Tu empresa no aparece? Habla con
RRHH para que se registre en clubSOS".

Validación: empresa requerida. Código validado si la empresa lo
requiere.

──────────────────────────────────────────
PASO 4/5 — SEGURIDAD
──────────────────────────────────────────

Título: "Asegura tu cuenta".

Campos:
- Password (requerido):
  - Input con toggle Eye/EyeOff.
  - Medidor de fortaleza en vivo (barra horizontal segmentos
    débil/medio/fuerte/excelente coloreados).
  - Checklist de requisitos en vivo (cada uno check o cross):
    mínimo 8 caracteres, una mayúscula, un número, un símbolo.
- Confirmar password (debe coincidir, validación inline).

Sección MFA (opcional):
- Switch "Activar autenticación en dos pasos (recomendado)".
- Si ON: texto "Lo configurarás al iniciar sesión por primera vez".

Checkbox requerido:
- "Acepto los términos y condiciones y política de privacidad"
  con links /terminos y /privacidad.

──────────────────────────────────────────
PASO 5/5 — RESUMEN EDITABLE
──────────────────────────────────────────

Título: "Confirma tus datos".
Subtítulo: "Revisa que todo esté correcto antes de crear tu cuenta".

Cards resumen (uno por paso, scroll vertical):
Cada card:
- Header con número de paso + título + botón "Editar" mini (link
  al paso).
- Contenido lista key-value. Datos sensibles ocultos con bullets.
- Border-l-4 primary cuando paso completo.

Sección final:
- Card destacada "Tu plan": empresa + tipo plan + beneficios.
- Mini-banner: "Al crear tu cuenta, recibirás un email de
  confirmación".

Footer: "← Anterior" + "Crear Mi Cuenta" (primary grande con check).

Estados:
- Loading: spinner + "Creando tu cuenta…".
- Error: banner con código (email duplicado → te llevamos al paso 2).
- Éxito: redirect /dashboard + toast verde "¡Bienvenido a clubSOS!"
  + tour onboarding opcional.
```

---

## 8. Apéndices

### 8.1 Tabla de migración modal → página

| Modal actual (archivo) | Ruta nueva | Pantalla dentro del prompt |
|---|---|---|
| `AdminDoctorFormModal.tsx` | `/admin/doctores/nuevo` y `/admin/doctores/[id]/editar` | § 6 · Pantalla 5 |
| `AdminServicioFormModal.tsx` | `/admin/servicios/nuevo` · `/admin/servicios/[id]/editar` | § 6 · Pantalla 6 |
| `AdminUbicacionFormModal.tsx` | `/admin/ubicaciones/nuevo` · `/admin/ubicaciones/[id]/editar` | § 6 · Pantalla 7 |
| `AdminExcepcionFormModal.tsx` | `/admin/excepciones/nuevo` · `/admin/excepciones/[id]/editar` | § 6 · Pantalla 13 |
| `BeneficioFormModal.tsx` | `/admin/beneficios/nuevo` · `/admin/beneficios/[id]/editar` | § 6 · Pantalla 11 |
| `SubirDocumentoModal.tsx` | `/admin/documentos/subir` | § 6 · Pantalla 12 |
| `AdminCitaDetalleModal.tsx` | Panel lateral 3:1 de `/admin/citas` | § 6 · Pantalla 9 (Panel Modo B) |
| `EditarUsuarioModal.tsx` (empresa) | `/empresa/usuarios/[id]/editar` | § 5 · Pantalla 3 |
| `DetalleModal.tsx` (empresa) | Panel lateral 3:1 | § 5 · Pantallas 2 y 3 (Panel Modo B) |
| `AvisoDetailModal.tsx` (miembro) | `/avisos/[id]` | § 4 · Pantalla 5 |
| `BeneficioDetailModal.tsx` (miembro) | `/beneficios/[id]` | § 4 · Pantalla 7 |
| `AdminPagoVerificacion` (si modal) | `/admin/citas/[id]/verificar-pago` | § 6 · Pantalla 9 (link) |

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
> Para añadir un nuevo prompt (o pantalla nueva dentro de un prompt existente), respeta las **reglas duras del preámbulo § 0.3**, el **vocabulario y voz del § 0.2**, y reutiliza los patrones del § 2 referenciándolos por nombre en vez de redescribirlos.
