# BC Ops Hub — DESIGN.md

> Source of truth visual y de interacción. Cualquier cambio futuro se valida contra este documento. Última revisión: 2026-05-07 (Friction Hunter v2 sweep).

---

## 1. Overview & Creative North Star

**Producto:** Dashboard operacional interno consumido por dueños y jefes de local de BlackChicken. No es marketing, no es consumer-facing — es **una sala de control** que tiene que dar respuesta legible en 10 segundos.

**Categoría de referencia:** Ops/Admin SaaS — alineado con **Linear**, **Stripe Dashboard**, **Vercel**, **Raycast**.

**Tono visual:** *Terminal premium*. Dark mode con acentos de oro (gold #D4A843), tipografía mono para datos, sans-serif solo en titulares. Cero decoración gratuita. La interfaz desaparece cuando el usuario lee bien.

**Principios:**
1. **Datos legibles a las 22:30 con pulgar y un ojo cerrado.** Si no se lee en mobile cansado, no es production-ready.
2. **Color, peso y tamaño cargan información.** Nunca decoran.
3. **Una alerta es una alerta. Un logro es un logro.** Nunca al mismo nivel visual.
4. **Iconos consistentes (Lucide-style SVG inline).** Cero emoji.
5. **Auto-refresh transparente.** El usuario no debería preguntarse si el dato es fresco.

---

## 2. Colors — Tonal Atmosphere

### Background system
| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#080808` | Fondo base de la app |
| `--surface` | `#0F0F0F` | Sub-superficies (nav-tabs container) |
| `--card` | `#111111` | Cards, KPI containers |
| `--card-hover` | `#181818` | Hover state de cards |
| `--border` | `#1F1F1F` | Bordes default (subido desde #1c1c1c) |
| `--border-hover` | `#2E2E2E` | Bordes en hover |

### Text system (semántico, no estético)
| Token | Hex | Contraste vs --bg | Uso |
|---|---|---|---|
| `--text-primary` | `#F2F2F2` | 14.6:1 | Titulares, KPI values |
| `--text` | `#E0E0E0` | 12.5:1 | Body, valores numéricos |
| `--text-secondary` | `#B8B8B8` | 8.2:1 | Metadata legible — **nuevo, reemplaza el #999/#aaa anterior** |
| `--text-tertiary` | `#888888` | 4.6:1 | Solo para timestamps/labels nominales — mínimo WCAG AA |
| ~~`--text-muted: #999`~~ | (deprecado) | (cumple AA) | Reemplazado por `--text-secondary` |

> **Regla:** ningún texto operacional baja de `--text-tertiary` (#888). Por debajo (gris #555, #666) solo decoración no funcional o se elimina.

### State colors
| Token | Hex | Background dim | Uso |
|---|---|---|---|
| `--gold` | `#D4A843` | `rgba(212,168,67,0.15)` | Acento marca, KPIs principales |
| `--green` | `#4ADE80` | `rgba(74,222,128,0.12)` | Success / sobre meta |
| `--red` | `#F87171` | `rgba(248,113,113,0.12)` | Error / bajo meta / urgente |
| `--yellow` | `#FBBF24` | `rgba(251,191,36,0.12)` | Warning / en límite |
| `--blue` | `#60A5FA` | `rgba(96,165,250,0.12)` | Info / BC2 |

> **Regla:** ningún estado se comunica solo con color. Siempre acompañado de icono SVG semántico (CheckCircle, AlertTriangle, AlertOctagon, X).

---

## 3. Typography — Editorial Authority

### Font stack
- **Display (Syne)** — solo H1 ("OPS HUB") y dash-section-title con uppercase + letter-spacing.
- **Sans (Inter)** — body, descripciones, párrafos. **Reemplaza el uso anterior de Syne como body**.
- **Mono (JetBrains Mono)** — números, KPIs cuantitativos, labels técnicos, badges, time stamps.

### Type scale
| Rol | Size | Line-height | Weight | Family |
|---|---|---|---|---|
| Display H1 | `24px` | `1.1` | 800 | Syne |
| Section title | `13px` | `1.2` | 600 | JetBrains Mono (uppercase, letter-spacing 1.5px) |
| Card title | `15px` | `1.3` | 700 | Inter |
| KPI value (large) | `28px` | `1.0` | 700 | JetBrains Mono |
| KPI value (medium) | `22px` | `1.1` | 700 | JetBrains Mono |
| Body | `14px` | `1.5` | 400 | Inter (subido desde 11–12px) |
| Metadata / sub | `13px` | `1.5` | 400 | JetBrains Mono (subido desde 10–11px) |
| Micro / timestamp | `12px` | `1.4` | 400 | JetBrains Mono (subido desde 10px; nunca menos) |
| Badge | `11px` | `1.0` | 500 | JetBrains Mono (subido desde 10px) |

### Reglas
- **`line-height`** del body es **1.5**, no `normal` (que default a ~1.2).
- **Mínimo absoluto: 12px**. Cualquier texto bajo 12px se elimina o se promueve.
- **Tabular figures** — `font-variant-numeric: tabular-nums` aplicado a todas las tablas con KPI numéricos para que las columnas no salten al cambiar valores.

---

## 4. Elevation & Depth

| Nivel | Box-shadow | Uso |
|---|---|---|
| `0` (flat) | none | Bg base, surfaces |
| `1` (card hover) | `0 4px 16px rgba(0,0,0,0.3)` | Card en hover |
| `2` (modal) | `0 24px 48px rgba(0,0,0,0.6)` | Modal overlay (con backdrop-filter: blur(6px)) |
| `3` (toast) | `0 8px 32px rgba(0,0,0,0.5)` | Toast notifications |

> **Regla:** El "lift" en hover (`translateY(-2px)` + shadow nivel 1) es **el único** efecto de movimiento sobre un card. Sin spotlight, sin glow proximal, sin parallax.

---

## 5. Components — Tactile Precision

### Buttons

#### Primary (`btn-confirm`, `btn-trigger`)
- **Min size:** 44×44pt en mobile / 40×40pt en desktop.
- **Padding:** `12px 18px`.
- **Default:** `transparent` bg + `1px solid var(--gold)` + `var(--gold)` text.
- **Hover:** `bg: var(--gold)` + `color: #000`.
- **Active:** `transform: scale(0.98)`.
- **Disabled:** `opacity: 0.4` + `cursor: not-allowed`.
- **Loading:** `opacity: 0.7` + spinner inline (11px) + sin `pointer-events`.
- **Texto:** capitalización normal ("Ejecutar"), nunca uppercase yelling ("EJECUTAR").

#### Secondary (`btn-cancel`, `btn-logs`, `refresh-btn`)
- **Padding:** `12px 16px`.
- **Border:** `1px solid var(--border-hover)`.
- **Color:** `var(--text-secondary)`.
- **Hover:** border `var(--border-hover)` → `var(--text)` color.

#### Icon-only (`modal-close`)
- **Size:** **40×40px mínimo**. Hit-area inflada con padding aunque visualmente sea más chico.
- **Aria-label obligatorio** ("Cerrar modal").

### Tabs (`nav-tab`)
- **Min height:** 44px.
- **Padding:** `12px 22px`.
- **Active:** `bg: var(--gold-dim)` + `color: var(--gold)` + `border 1px solid rgba(212,168,67,0.25)`.
- **Inactive:** `color: var(--text-secondary)` + hover bg `rgba(255,255,255,0.04)`.

### Cards (`card`, `kpi-card`, `cr-card`)
- **Padding:** `20px`.
- **Border:** `1px solid var(--border)`.
- **Border-radius:** `10px`.
- **Hover:** `translateY(-2px)` + shadow nivel 1 + border `var(--border-hover)`.
- **Status accent:** barra vertical 3px en el borde izquierdo (`success` verde, `failure` rojo, `running` amarillo con glow sutil).
- **Disabled:** `opacity: 0.55` + cursor not-allowed.

### Modal
- **Width:** max 420px, padding 28px, border-radius 14px.
- **Trigger transition:** scale + translate desde Y+16px (240ms cubic-bezier elastic).
- **Backdrop:** `rgba(0,0,0,0.85)` + `backdrop-filter: blur(6px)`.
- **Close:** Escape key, click on backdrop, X button (44×44pt hit-area).
- **CTA primario:** `Ejecutar` (no `EJECUTAR`).

### Status indicator (`status-dot`)
- Tamaño dot: 7px, color `var(--green)` con glow `box-shadow: 0 0 6px var(--green)`.
- Pulse animation 2.5s.
- Texto: 12px JetBrains Mono, color `var(--text-secondary)`.
- **En estado ERROR:** dot rojo + texto "DESCONECTADO" en `var(--red)`.

### Iconography
- **Sistema:** Lucide-style SVG inline (definidos como JS helpers `svgIcon(name)` en el script).
- **Nunca:** emojis Unicode (🛑✅❌⚠️🍳🍽️📋🔄🗑️🚨⚡⏱⊘▶✕↗▼▲).
- **Stroke width estándar:** 1.75.
- **Tamaño default:** 16×16px (inline en texto), 20×20 (en cards), 24×24 (en headers).
- **Color:** heredado del contenedor (`currentColor`) excepto cuando estado semántico exige tinte específico.

---

## 6. Motion

| Token | Duración | Easing | Uso |
|---|---|---|---|
| `--motion-fast` | 150ms | ease-out | Hover states |
| `--motion-base` | 200ms | ease-out | Toggles, tab switch |
| `--motion-slow` | 300ms | cubic-bezier(0.34, 1.56, 0.64, 1) | Modal entrance |
| `--motion-data` | 600ms–1000ms | ease | Bar fills, sparkline progress |

**Reglas:**
- `prefers-reduced-motion: reduce` desactiva fadeUp inicial, animaciones de spinner y pulse-dot. Mantiene transitions sub-150ms (no perceptibles).
- Spin del refresh-btn solo durante fetch (no decorativo).
- FadeUp inicial: max 8 cards staggered 50ms cada una (no infinito en grids grandes).

---

## 7. Layout

### Grid
- **Container:** `max-width: 1280px`, padding `0 24px 60px`.
- **Card grid:** 3 cols en >960px, 2 cols 600–960px, 1 col <600px.
- **Dashboard grid:** auto-fit minmax(200px, 1fr).
- **Spacing rhythm:** múltiplos de 4 (4, 8, 12, 16, 20, 24, 32, 48).

### Responsive breakpoints
- Mobile: `≤600px` (1 col, touch-first sizes)
- Tablet: `601–960px` (2 cols)
- Desktop: `>960px` (3 cols)

### Safe areas
- Padding inferior 60px para que el último elemento no pegue al borde.
- Header padding top 28px para air sobre logo.

---

## 8. States — Pre-Delivery Checklist

Cada vista debe diseñar (o pasar correctamente):

| Estado | Implementación obligatoria |
|---|---|
| **Empty** | Texto "Sin datos disponibles" + sugerencia accionable, no card vacío. |
| **Loading** | Skeleton shimmer (no spinner gigante centrado salvo init global). |
| **Error** | Mensaje específico + retry button visible. Nunca "Algo salió mal". |
| **Partial** | Cuando una sección falla pero otras cargan: mostrar las que sí + placeholder específico para las que no. |
| **Reduced motion** | Animaciones deshabilitadas vía `@media (prefers-reduced-motion: reduce)`. |
| **Mobile 375px** | Sin scroll horizontal, touch targets ≥ 44pt, text ≥ 12px. |
| **Dark mode** | Único modo soportado. Light mode: TBD (issue abierto). |

---

## 9. Do's and Don'ts

### ✅ DO
- Usar `--text-secondary` como mínimo para cualquier texto que el usuario tenga que leer.
- Acompañar cada estado de color con un icono semántico SVG.
- Inflate hit-area ≥ 44pt en todo control interactivo, incluso si visualmente es más chico.
- Usar `tabular-nums` en cualquier tabla con números que puedan cambiar.
- Mantener `line-height: 1.5` en todo body text.
- Auto-refresh con timestamp visible y actualizado, no solo polling silencioso.

### ❌ DON'T
- **No uses emojis como iconos del sistema.** Diferente render por OS, fuera de paleta, rompen consistencia.
- **No texto bajo 12px.** Si no se ve a un metro de distancia, no es información.
- **No `EJECUTAR` en mayúsculas.** Yelling sin justificación.
- **No mezcles alertas y logros en la misma sección con el mismo peso visual.** Una alerta es una alerta.
- **No expongas nombre completo del cliente.** Iniciales o primer nombre + inicial.
- **No animes `width`/`height`/`top`/`left`.** Solo `transform` y `opacity`.
- **No uses `--text-muted` (deprecado).** Reemplazado por `--text-secondary`.

---

## 10. Agent prompt guide

Cuando un agente (Friction Hunter, frontend-design, AI assistant) trabaje sobre este producto:

1. **Lee este DESIGN.md primero.** Es source of truth.
2. **Usa los tokens de :root**, no hex literales en componentes.
3. **Verifica contra el Pre-Delivery Checklist** antes de cualquier merge.
4. **Cualquier desviación necesita justificación** documentada en el commit message.
5. **Si introduces un color, font, o sizing nuevo**, agregalo al DESIGN.md primero, después al CSS.

---

## Mantra

> Si el dueño cansado a las 22:30 con el celular sucio en la mano no entiende el dato en 3 segundos, no es production-ready.
