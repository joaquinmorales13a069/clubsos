# Spec — Rediseño visual de clubSOS vía Claude Design

**Fecha:** 2026-05-28
**Autor:** Joaquín Morales
**Tipo:** Diseño / blueprint de prompts (no implementación de código)

## 1. Objetivo

Producir un archivo `docs/design/claude-design-prompts.md` que contenga prompts curados para alimentar **Claude Design** y obtener mockups consistentes que rediseñen la interfaz de clubSOS. El archivo es el deliverable; no se modificará código de la app en esta fase.

## 2. Alcance

Cubre **todas las pantallas detectadas** (~40), agrupadas por rol y por flujo. Cada pantalla tiene su propio prompt, pero los prompts relacionados comparten un bloque de contexto al inicio de su sección para que puedan generarse en lote.

Pantallas por bloque:

- **Auth (3)**: login, signup wizard, MFA.
- **Miembro (7)**: inicio, citas (lista), wizard de cita, avisos, beneficios, documentos, familia, ajustes.
- **Empresa_admin (5)**: inicio, citas, usuarios, reportes, ajustes.
- **Admin (14)**: inicio, usuarios, doctores, doctor detalle, servicios, ubicaciones, empresas, citas (lista), calendario citas, beneficios, documentos, excepciones, reportes, sistema, auditoría.
- **Wizards expandidos (≈13)**: cada paso del wizard de citas (5 nuevos pasos) y del signup (4-5 pasos) como prompts individuales.
- **Patrones transversales (5)**: shell, tabla 3:1, wizard, página-formulario, estados vacíos.

## 3. No-objetivos

- No se generan los componentes en código en esta fase.
- No se refactoriza el design system de Tailwind/shadcn actual.
- No se altera lógica de RLS, RPCs ni rutas de API.
- No se traduce contenido (los prompts se escriben en español, alineados a la UI actual; el output visual usará copy en español por defecto y mencionará que existe `messages/{es,en}.json`).

## 4. Principios de diseño

1. **No modales para formularios.** Toda creación/edición que hoy es un modal pasa a ser página dedicada con ruta propia. Sheets móviles para detalles dentro de listas son permitidos (no son modales de formulario).
2. **Mobile-first con breakpoints estándar de Tailwind** (`sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`). Cada prompt declara comportamiento en `<md`, `md-lg`, `lg+`.
3. **Patrón tabla 3:1 (xl+).** Grid de 4 columnas: 3 para tabla, 1 para panel contextual stateful (KPIs+filtros sin selección; detalle+acciones con selección). En `md`–`xl` el panel se apila debajo de la tabla; en `<md` se usa lista de cards + sheet inferior.
4. **Wizards consolidados y con resumen lateral sticky.** Citas pasa de 8 a 5 pasos. Signup mantiene split-layout con resumen final editable.
5. **Identidad visual actual.** Paleta `#CD2129` (rojo primario), `#2266A7` (azul secundario), `#616161` (neutro). Tipografías Poppins (headers) / Roboto (body). Rounded `xl`/`2xl`. Glassmorphism sutil en cards flotantes.

## 5. Estructura del archivo `claude-design-prompts.md`

```
0. Preámbulo
   0.1  Cómo usar este archivo con Claude Design
   0.2  Convenciones globales (responsive, no-modal, brand)

1. PROMPT FOUNDATIONAL — Design System
   Paleta, tipografía, sombras, radios, espaciados, motion, tokens,
   componentes base (Button, Input, Card, Badge, Avatar, Tabs, Stepper,
   Toast pattern, Sheet, Sidebar, Topbar, EmptyState, Skeleton).

2. PATRONES TRANSVERSALES
   2.1  Layout shell (sidebar colapsable + topbar)
   2.2  Tabla 3:1 (lista + panel contextual)
   2.3  Wizard genérico (stepper + sticky summary)
   2.4  Página-Formulario (reemplaza modal)
   2.5  Estados vacíos / Skeleton / Error / Confirm-in-place

3. AUTH
   3.1 Login
   3.2 Signup — overview wizard
   3.3 MFA (verificar + enrolar)

4. MIEMBRO
   4.1 Home miembro
   4.2 Mis citas (lista + detalle)
   4.3 Wizard nueva cita (overview)
   4.4 Mis avisos · 4.5 Aviso detalle (página)
   4.6 Mis beneficios · 4.7 Beneficio detalle (página)
   4.8 Mis documentos
   4.9 Mi familia
   4.10 Mis ajustes

5. EMPRESA_ADMIN
   5.1 Home empresa
   5.2 Citas empresa
   5.3 Usuarios empresa (lista + crear/editar páginas)
   5.4 Reportes empresa
   5.5 Ajustes empresa

6. ADMIN
   6.1 Home admin
   6.2 Usuarios admin
   6.3 Doctores (lista) · 6.4 Doctor detalle
   6.5 Doctor crear/editar (página)
   6.6 Servicios (lista + crear/editar)
   6.7 Ubicaciones (lista + crear/editar)
   6.8 Empresas (lista + crear/editar)
   6.9 Citas admin (lista 3:1)
   6.10 Calendario de citas
   6.11 Beneficios admin (lista + crear/editar)
   6.12 Documentos admin (lista + subir)
   6.13 Excepciones horario (lista + crear/editar)
   6.14 Reportes admin (overview + sub-reportes)
   6.15 Auditoría
   6.16 Sistema (configuración)

7. WIZARDS EXPANDIDOS
   7.1 Wizard Citas — Paso 1 Paciente
   7.2 Wizard Citas — Paso 2 Servicio + Ubicación
   7.3 Wizard Citas — Paso 3 Doctor + Fecha + Horario unificado
   7.4 Wizard Citas — Paso 4 Pago
   7.5 Wizard Citas — Paso 5 Confirmar
   7.6 Wizard Signup — Paso 1 Datos personales
   7.7 Wizard Signup — Paso 2 Contacto
   7.8 Wizard Signup — Paso 3 Empresa / Contrato
   7.9 Wizard Signup — Paso 4 Seguridad
   7.10 Wizard Signup — Paso 5 Resumen editable

8. APÉNDICES
   8.1 Tabla de migración modal → página
   8.2 Glosario de términos del dominio (cita, empresa, contrato, etc.)
```

## 6. Plantilla de prompt individual

Cada prompt sigue esta plantilla para que Claude Design reciba siempre la misma forma de input:

```
### {N}. {Nombre de pantalla}

**Ruta:** `/{locale}/dashboard/...`
**Rol:** admin | empresa_admin | miembro | público
**Patrones referenciados:** [Layout shell, Tabla 3:1, …]

**Contexto del proyecto:**
clubSOS es una plataforma médica multi-tenant para empresas y sus
afiliados. Brand: rojo #CD2129 + azul #2266A7. Poppins/Roboto.
Rounded xl/2xl. Mobile-first con Tailwind.

**Objetivo de la pantalla:**
{1-2 frases sobre qué hace esta pantalla y para quién.}

**Secciones requeridas (de arriba abajo):**
1. {sección} — {qué contiene}
2. …

**Datos a mostrar (mock):**
- {entidad}: {ejemplos}

**Acciones primarias / secundarias:**
- Primaria: {acción + dónde}
- Secundarias: {…}

**Estados a diseñar:**
- Loading (skeleton)
- Vacío
- Error
- Éxito (donde aplique)

**Responsive:**
- `<md` (móvil): {layout}
- `md` a `lg`: {layout}
- `lg+`: {layout}

**Reglas duras:**
- No modales para formularios.
- Stepper sticky en wizards.
- Tabla 3:1 con panel contextual.
- Toasts con `sonner`.

**Pantallas hermanas que pueden generarse en la misma sesión:**
{ids de otras pantallas relacionadas}
```

## 7. Patrón Tabla 3:1 — especificación

Grid `lg:grid-cols-4 gap-6`. Tabla ocupa 3 columnas; panel lateral 1 columna **sticky** (top-24).

**Estados del panel lateral:**

- **Sin selección:** muestra (a) KPI cards stack vertical con los 2-3 indicadores de la tabla y (b) filtros avanzados expandidos siempre visibles + (c) botones de export/bulk-actions.
- **Con selección de una fila:** reemplaza el contenido por (a) detalle resumido del registro (avatar/icono + nombre + meta) y (b) lista vertical de acciones contextuales (Editar, Ver historial, etc.) y (c) botón de cerrar selección.
- **Selección múltiple:** muestra bulk-actions y conteo de seleccionados.

**Responsive:**

- `<md`: tabla colapsa a lista de cards. Al tocar una card aparece un **sheet inferior** (no modal) con detalle + acciones. KPIs y filtros se mueven a la parte superior antes de la lista (filtros colapsables en un drawer botón "Filtros").
- `md` a `xl`: tabla en ancho completo; panel se ubica debajo como sección sticky en scroll cuando hay selección. Sin selección, KPIs van arriba y filtros en barra horizontal.
- `xl+` (≥1280): layout 3:1 lado a lado (grid `xl:grid-cols-4`).

**Acciones destructivas:** **confirm-in-place** — el botón "Eliminar" se transforma en línea en `¿Confirmar? · Sí · No`. Para flujos críticos (eliminar empresa, eliminar usuario activo) se navega a `/{recurso}/{id}/eliminar` como página dedicada con resumen del impacto.

## 8. Patrón Wizard — especificación

**Stepper horizontal sticky-top** con números, estado (completado / actual / pendiente) y navegación no-lineal a pasos previos completados. En móvil colapsa a `Paso N de M` con barra de progreso.

**Sticky summary lateral** en `lg+`: card a la derecha que lista cada paso con su selección y un botón "Editar" que salta al paso. En `<lg` se convierte en un chip fijo en la parte inferior `Ver resumen ↑` que abre un sheet.

**Wizard de citas — consolidación 8 → 5:**

| Paso nuevo | Reemplaza pasos actuales | Justificación |
|---|---|---|
| 1. Paciente | `PasoPaciente` | Sin cambio. Titular vs familiar como tabs. |
| 2. Servicio + Ubicación | `PasoServicio` + `PasoUbicacion` | Si una sola ubicación → autoseleccionar. Servicios se muestran como cards grid; ubicación aparece debajo o autocompleta. |
| 3. Doctor + Fecha + Horario | `PasoDoctor` + `PasoFecha` + `PasoHorario` | Vista unificada: switch/select de doctor arriba, calendario izquierda, slots derecha. Cambiar de doctor refresca slots manteniendo fecha. |
| 4. Pago | `PasoPago` + `PasoTransferencia` | Transferencia inline cuando se elige ese método. |
| 5. Confirmar | `PasoConfirmar` | Sin cambio. Incluye términos. |

**Wizard signup — pasos cortos:**

1. Datos personales (nombre, cédula, fecha nacimiento, sexo)
2. Contacto (email, teléfono)
3. Empresa / contrato (selector empresa + contrato si aplica; si solo hay 1 → autoselect)
4. Seguridad (password con medidor en vivo, MFA opcional)
5. Resumen editable (cada sección con botón "Editar" que salta al paso)

**Smart defaults:**

- Solo 1 ubicación → autoselect.
- Solo 1 doctor para el servicio → autoselect.
- Doctor usado anteriormente → marcado como "Frecuente".
- Fecha por defecto = hoy si hay slots, sino próximo día con disponibilidad.

## 9. Homes por rol — estructura

**Home Admin** (`/admin`):

1. Hero saludo + greeting personalizado + acción primaria.
2. Banner de alerta si `citas_pendientes > 0`.
3. Grid de 6 KPIs (`grid-cols-2 md:grid-cols-3 lg:grid-cols-6`).
4. Quick actions row (4 pills): Nueva empresa, Nuevo doctor, Subir documento, Crear beneficio.
5. Grid 2 cols (`lg:grid-cols-2`): Citas pendientes (lista) | Empresas recientes (lista).
6. Gráfica `Citas por servicio` (donut o bar).

**Home Empresa_admin** (`/empresa`):

1. Hero saludo + uso de contratos (barra de progreso destacada).
2. Banner alerta pendientes.
3. Grid 4 KPIs (`grid-cols-2 md:grid-cols-4`).
4. Quick actions row (3 pills): Nuevo miembro, Ver reportes, Ajustes.
5. Grid 2 cols: Citas pendientes | Miembros recientes.
6. Gráfica `Citas por servicio` empresa.

**Home Miembro** (`/dashboard`):

1. Hero + credential card flotante (estilo carnet con glassmorphism).
2. MFA banner si no enrolado.
3. Próxima cita destacada (card grande con acciones agregar-a-calendario).
4. Quick actions row (Pedir cita, Ver beneficios, Mis documentos, Mi familia).
5. Grid 3 cols (`md:grid-cols-3`): Últimos avisos · Beneficios recientes · Documentos recientes.
6. Sección "Mis servicios cubiertos" (lista con uso/cuota).

## 10. Migración modal → página

| Modal actual | Ruta nueva |
|---|---|
| `AdminDoctorFormModal` | `/admin/doctores/nuevo` y `/admin/doctores/[id]/editar` |
| `AdminServicioFormModal` | `/admin/servicios/nuevo` · `/admin/servicios/[id]/editar` |
| `AdminUbicacionFormModal` | `/admin/ubicaciones/nuevo` · `/admin/ubicaciones/[id]/editar` |
| `AdminExcepcionFormModal` | `/admin/excepciones/nuevo` · `/admin/excepciones/[id]/editar` |
| `BeneficioFormModal` | `/admin/beneficios/nuevo` · `/admin/beneficios/[id]/editar` |
| `SubirDocumentoModal` | `/admin/documentos/subir` |
| `AdminCitaDetalleModal` | Panel lateral 3:1 de `/admin/citas` |
| `EditarUsuarioModal` (empresa) | `/empresa/usuarios/[id]/editar` |
| `DetalleModal` (empresa) | Panel lateral 3:1 |
| `AvisoDetailModal` (miembro) | `/avisos/[id]` |
| `BeneficioDetailModal` (miembro) | `/beneficios/[id]` |
| `AdminPagoVerificacion` (si es modal) | `/admin/citas/[id]/verificar-pago` |

**Excepciones permitidas (siguen siendo modal o no aplica):**

- `HelpModal` (ayuda contextual, no es formulario).
- Confirm-in-place inline (no es modal real).
- Sheets móviles del patrón 3:1 (son sheets, no modales de formulario).
- Auth screens propias.

## 11. Plan de elaboración

1. Crear el archivo `docs/design/claude-design-prompts.md` con el esqueleto del índice (sección 5 arriba).
2. Escribir el prompt 1 (Design System) y los 5 patrones transversales (sección 2). Estos son la base referenciada.
3. Escribir los prompts de auth (3 pantallas).
4. Escribir los prompts de miembro (7 pantallas + wizard expandido).
5. Escribir los prompts de empresa_admin (5 pantallas).
6. Escribir los prompts de admin (14 pantallas).
7. Escribir wizards expandidos (5 citas + 5 signup).
8. Apéndices: tabla migración modal→página, glosario.
9. Revisión final: que cada prompt referencie patrones existentes y no se duplique contenido.

## 12. Aceptación

El archivo se considera completo cuando:

- Todas las pantallas listadas en sección 5 tienen su prompt.
- Cada prompt sigue la plantilla de sección 6.
- Patrones transversales están definidos una sola vez y se referencian por nombre.
- Cada prompt declara comportamiento responsive en los 3 breakpoints (`<md`, `md-lg`, `lg+`).
- Cero modales de formulario en el output (excepto los listados como excepciones).
- La tabla de migración modal→página de sección 10 está completa en apéndices.
- El archivo abre con instrucciones de uso (sección 0) para que cualquier humano pueda invocar los prompts en Claude Design sin contexto adicional.

## 13. Riesgos / supuestos

- **Supuesto:** Claude Design acepta prompts en español con referencias a marca y produce mockups consistentes a través de múltiples sesiones. Si la consistencia entre sesiones falla, el prompt foundational (Design System) deberá repetirse al inicio de cada sesión.
- **Supuesto:** Los pasos consolidados del wizard de citas no pierden información requerida por la RPC `crear_cita_atomic`. La consolidación es solo visual: el state interno sigue capturando todos los campos.
- **Riesgo:** Convertir todos los modales a páginas aumenta la cantidad de rutas y la complejidad del sidebar / breadcrumbs. Mitigación: cada página-formulario incluye breadcrumb y botón "Cancelar" que regresa a la lista; el sidebar no lista las páginas de form (solo el listado).
- **Riesgo (resuelto):** El panel lateral del patrón 3:1 puede no caber en `lg` (1024px) cómodamente. **Decisión:** el layout 3:1 lado a lado se activa solo en `xl+` (≥1280px). En `md`–`xl` el panel se apila debajo de la tabla. Esto está reflejado consistentemente en secciones 4.2 y 7.
