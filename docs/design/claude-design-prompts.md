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
