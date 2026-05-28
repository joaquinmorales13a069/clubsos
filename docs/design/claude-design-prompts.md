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
