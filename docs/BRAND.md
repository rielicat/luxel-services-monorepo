# Servicios Luxel — Brand Identity & Design System

> "Fresh Teal + Lime" — clean, hygienic, modern, trustworthy, premium-but-accessible.
> The color tokens documented here are the source of truth for
> `apps/web/src/app/globals.css`. Prose is English; example UI copy is es-CL.

---

## 1. Brand Essence

**Essence:** _Light that leaves a space renewed._ Luxel makes cleanliness feel
effortless, transparent, and a little bit premium — the calm of walking into a
freshly cleaned room, delivered by software that respects your time.

**Personality (adjectives):** Fresh · Trustworthy · Effortless · Modern ·
Warm-professional · Precise.

**Positioning statement:**

> For busy households, hosts, and small offices in Santiago who want a spotless
> space without the hassle of managing a cleaner, **Servicios Luxel** is the
> online cleaning platform that gives an honest price instantly and a service you
> can schedule and trust — unlike informal WhatsApp referrals with opaque pricing
> and no guarantee.

---

## 2. Voice & Tone

**Voice:** Chilean, warm, and clear. We speak like a competent friend who happens
to run an excellent cleaning service — never a corporate call center, never
slangy to the point of unprofessional. We use **tú**, not **usted**. We keep
sentences short. We are honest about coverage and never oversell.

**Tone by context:** upbeat and confident on the landing page; calm and precise in
the quote/booking flow; reassuring and human in error and support moments.

### Do / Don't (es-CL example copy)

| Context       | ✅ Do                                                                               | ❌ Don't                                         |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Hero CTA      | "Cotizar mi servicio"                                                               | "SOLICITE UNA COTIZACIÓN AHORA"                  |
| Price shown   | "Precio claro al instante. Sin sorpresas."                                          | "Precios sujetos a evaluación posterior."        |
| Out of area   | "Aún no llegamos a esta zona. Estamos creciendo — déjanos tus datos y te avisamos." | "Error: ubicación no válida."                    |
| Chat greeting | "¡Hola! Soy Lux, tu asistente. ¿Te ayudo a cotizar?"                                | "Bienvenido al chatbot. Seleccione una opción."  |
| Confirmation  | "Listo, agendado para el jueves en la mañana. Te esperamos."                        | "Su transacción ha sido procesada exitosamente." |
| Human handoff | "Te paso con una persona por WhatsApp al toque."                                    | "Su solicitud será derivada a un ejecutivo."     |
| Empty state   | "Aún no tienes reservas. ¿Cotizamos tu primer aseo?"                                | "No hay datos disponibles."                      |

**Style rules:** Prices with Chilean thousands separator (`35.020 CLP`, never
`$35,020`). Time blocks as **mañana (08:00–12:00)** / **tarde (14:00–18:00)**.
Never hardcode strings in components — all copy lives in
`packages/shared/src/i18n/es-CL.json`.

---

## 3. Name, Wordmark & Logo

**"Luxel"** reads as **lux** (Latin for _light_) + a modern product suffix. Light
connotes clean, bright, hygienic, and premium — exactly the feeling of a
freshly-cleaned space. The name is short, brandable, and `.cl`-friendly
(`serviciosluxel.cl`).

**Wordmark:** "Luxel" set in **Manrope**, semibold, tight tracking, with a
**sparkle/shine mark** integrated near the "L" or replacing the dot energy of the
"x". The sparkle (a 4-point shine / "destello") is the core motif — it appears as
favicon, loading state, and success/confirmation micro-illustration.

> **⚠️ All brand imagery below is a placeholder.** The current build ships CSS
> gradients and a dotted-grid backdrop (`.bg-dot-grid`, `.bg-brand-glow` in
> `globals.css`) in place of real art. The specs in §4 are generation-ready
> instructions for a designer or an image model.

---

## 4. Assets to Create Separately (placeholders today)

Palette hexes to use across all assets:
Teal-700 `#0F766E` · Teal-500 `#14B8A6` · Deep ink `#0B3B39` · Lime `#D8F84B` ·
Text-on-lime `#14532D` · Surface `#F6FBF9` · White `#FFFFFF`.

### 4.1 Logo / wordmark

- **Deliverables:** horizontal lockup, stacked lockup, icon-only (sparkle).
  Formats: SVG (primary), PNG @1x/2x/3x. Light and dark variants.
- **Prompt/spec:** "Minimal, modern wordmark 'Luxel' in a geometric sans
  (Manrope-like), semibold, tight tracking, deep teal `#0F766E`. A single clean
  4-point sparkle/shine mark in lime `#D8F84B` integrated to the upper-right of
  the final letter. Flat, no gradients in the mark, generous whitespace, vector,
  transparent background. Conveys clean, bright, premium, trustworthy."

### 4.2 Favicon

- **Sizes:** 16, 32, 48 px `.ico` + 180 px `apple-touch-icon.png` + 512 px
  maskable PNG.
- **Prompt/spec:** "The Luxel sparkle mark only, lime `#D8F84B` on a teal `#0F766E`
  rounded-square background, centered, high contrast, legible at 16px, no text,
  flat." Keep the icon identical across sizes.

### 4.3 Hero background image / illustration

- **Dimensions:** 2560×1440 (16:9), plus a mobile 1080×1920 crop.
- **Prompt/spec:** "Bright, airy, sunlit modern Santiago apartment interior after
  cleaning — soft teal and white palette, gentle depth of field, a subtle lime
  accent object (a plant, a cloth). Calm, premium, hygienic mood. Faint sparkle
  particles in the light. Leave the upper-left third uncluttered for headline
  text overlay. Photographic or clean semi-flat illustration, no clutter, no
  visible brands." Must sit behind teal `#0F766E` text at AA contrast.

### 4.4 OG / social share image

- **Dimensions:** 1200×630.
- **Prompt/spec:** "Teal `#0F766E` → teal `#14B8A6` gradient background, the Luxel
  wordmark centered, tagline 'Aseo profesional, sin complicaciones.' in white
  Inter, a lime `#D8F84B` sparkle accent. Clean, high-contrast, readable as a
  thumbnail." One default + per-comuna variants for SEO pages.

### 4.5 Service-type illustrations (×3)

- **Dimensions:** 480×480 each, matching set, transparent PNG/SVG.
- **Prompt/spec:** "Set of three cohesive semi-flat icons on soft teal wash
  `#F6FBF9`: (1) **Aseo regular** — a sparkling living room; (2) **Aseo profundo**
  — a scrub brush with deep-clean shine lines; (3) **Aseo de entrega** — an empty
  handed-over apartment with keys and a sparkle. Consistent line weight, teal
  primary `#0F766E`, lime `#D8F84B` accents, rounded, friendly, premium."

### 4.6 Operator / trust photography

- **Prompt/spec:** "Warm, authentic photos of professional cleaners (diverse,
  Chilean context) in clean uniforms with a subtle teal accent, smiling, working
  in bright real homes/offices. Natural light, trustworthy and respectful — real
  people, not stock-cheesy. Used for the 'Operadores certificados' trust section."
  Use consented, real operator photography before launch; stock is placeholder.

---

## 5. Color System

Colors are stored in `globals.css` as **HSL channels** so Tailwind can compose
alpha via `hsl(var(--token) / <alpha>)`. Hex values below are the rendered
equivalents.

### Light mode

| Token                    | HSL           | Hex (approx) | Usage                                    |
| ------------------------ | ------------- | ------------ | ---------------------------------------- |
| `background`             | `160 44% 99%` | `#F6FDFB`    | App background — off-white w/ teal tint  |
| `foreground`             | `178 52% 11%` | `#0D2B2A`    | Primary text (deep ink)                  |
| `card`                   | `0 0% 100%`   | `#FFFFFF`    | Card / raised surface                    |
| `card-foreground`        | `178 52% 11%` | `#0D2B2A`    | Text on cards                            |
| `popover`                | `0 0% 100%`   | `#FFFFFF`    | Popover / dropdown surface               |
| `primary`                | `175 78% 26%` | `#0F766E`    | Brand teal-700 — buttons, links, headers |
| `primary-foreground`     | `0 0% 100%`   | `#FFFFFF`    | Text/icons on primary                    |
| `secondary`              | `173 71% 39%` | `#1DAA9D`    | Teal-500 — secondary emphasis            |
| `secondary-foreground`   | `0 0% 100%`   | `#FFFFFF`    | Text on secondary                        |
| `lime` (accent)          | `71 92% 63%`  | `#D6F94B`    | CTA highlights, energy, sparkle          |
| `lime-foreground`        | `138 55% 20%` | `#175231`    | Text on lime (deep green)                |
| `muted`                  | `165 30% 96%` | `#F0F6F4`    | Muted surface / subtle fill              |
| `muted-foreground`       | `178 13% 40%` | `#597370`    | Secondary/help text                      |
| `accent`                 | `172 55% 93%` | `#DFF6F2`    | Soft teal wash (hover, chips)            |
| `accent-foreground`      | `175 78% 22%` | `#0C635D`    | Text on accent wash                      |
| `success`                | `158 64% 38%` | `#23A06C`    | Confirmations, paid state                |
| `success-foreground`     | `0 0% 100%`   | `#FFFFFF`    | Text on success                          |
| `warning`                | `38 92% 48%`  | `#EB9C09`    | Warnings, low-availability               |
| `warning-foreground`     | `40 60% 12%`  | `#31240C`    | Text on warning                          |
| `destructive`            | `0 72% 51%`   | `#DC2F2F`    | Errors, cancel/refund                    |
| `destructive-foreground` | `0 0% 100%`   | `#FFFFFF`    | Text on destructive                      |
| `border`                 | `168 28% 89%` | `#DAE9E6`    | Borders / dividers                       |
| `input`                  | `168 28% 89%` | `#DAE9E6`    | Input borders                            |
| `ring`                   | `175 78% 30%` | `#118A80`    | Focus ring                               |

### Dark mode

| Token                    | HSL           | Hex (approx)        | Usage                            |
| ------------------------ | ------------- | ------------------- | -------------------------------- |
| `background`             | `185 47% 6%`  | `#081617`           | App background (deep teal-black) |
| `foreground`             | `160 30% 96%` | `#F0F8F5`           | Primary text                     |
| `card`                   | `187 42% 8%`  | `#0C1E1F`           | Card surface                     |
| `card-foreground`        | `160 30% 96%` | `#F0F8F5`           | Text on cards                    |
| `popover`                | `187 42% 8%`  | `#0C1E1F`           | Popover surface                  |
| `primary`                | `172 76% 44%` | `#1BC6B4`           | Teal, brightened for dark        |
| `primary-foreground`     | `185 60% 7%`  | `#071B1C`           | Text on primary                  |
| `secondary`              | `173 60% 34%` | `#22896F`→`#228B7E` | Secondary emphasis               |
| `secondary-foreground`   | `160 40% 96%` | `#EFF9F5`           | Text on secondary                |
| `lime` (accent)          | `71 88% 60%`  | `#D0F642`           | CTA highlight                    |
| `lime-foreground`        | `140 60% 10%` | `#0A2917`           | Text on lime                     |
| `muted`                  | `186 30% 14%` | `#192E2F`           | Muted surface                    |
| `muted-foreground`       | `170 15% 62%` | `#8FAFAB`           | Secondary text                   |
| `accent`                 | `186 34% 16%` | `#1A3739`           | Soft teal wash                   |
| `accent-foreground`      | `160 40% 92%` | `#E2F2EC`           | Text on accent                   |
| `success`                | `158 60% 44%` | `#2DB47C`           | Confirmations                    |
| `success-foreground`     | `185 60% 7%`  | `#071B1C`           | Text on success                  |
| `warning`                | `38 90% 55%`  | `#F1AC24`           | Warnings                         |
| `warning-foreground`     | `40 60% 10%`  | `#291D0A`           | Text on warning                  |
| `destructive`            | `0 63% 47%`   | `#C22C2C`           | Errors                           |
| `destructive-foreground` | `0 0% 100%`   | `#FFFFFF`           | Text on destructive              |
| `border`                 | `186 28% 17%` | `#1F3B3D`           | Borders                          |
| `input`                  | `186 28% 19%` | `#234245`           | Input borders                    |
| `ring`                   | `172 76% 44%` | `#1BC6B4`           | Focus ring                       |

**Brand utilities** (in `globals.css`): `.text-gradient-brand` (teal→teal→green
gradient text for hero accent words), `.bg-brand-glow` (ambient radial glow),
`.bg-dot-grid` (dotted backdrop placeholder for hero imagery), and a lime
`::selection`.

---

## 6. Typography

**Display / headings:** **Manrope** (geometric, confident, modern).
**Body / UI:** **Inter** (highly legible at small sizes).

| Role            | Font    | Size (desktop) | Weight  | Line-height | Tracking     |
| --------------- | ------- | -------------- | ------- | ----------- | ------------ |
| H1 (hero)       | Manrope | 48–60 px       | 700–800 | 1.05        | −0.02em      |
| H2 (section)    | Manrope | 32–36 px       | 700     | 1.15        | −0.01em      |
| H3              | Manrope | 24 px          | 600     | 1.2         | −0.01em      |
| H4              | Manrope | 20 px          | 600     | 1.3         | 0            |
| Body            | Inter   | 16 px          | 400     | 1.6         | 0            |
| Small / caption | Inter   | 13–14 px       | 400–500 | 1.5         | 0            |
| Price / numeric | Manrope | contextual     | 700     | 1.1         | tabular-nums |

Enable `font-feature-settings: 'rlig' 1, 'calt' 1, 'ss01' 1` (already set on
`body`). Use `tabular-nums` for prices so CLP amounts align.

---

## 7. Spacing, Radius, Elevation, Motion

- **Spacing:** 4 px base scale (`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`). Section
  vertical rhythm 64–96 px on desktop, 40–56 px on mobile.
- **Radius:** base `--radius: 0.75rem` (12 px). Derived: buttons/inputs `0.75rem`,
  cards `1rem`, pills/badges full, chat bubbles `0.75rem`.
- **Elevation / shadow:** keep shadows soft and teal-tinted, not neutral gray.
  - `sm` — resting cards: `0 1px 2px hsl(178 52% 11% / 0.06)`
  - `md` — hover/raised: `0 6px 20px hsl(178 52% 11% / 0.10)`
  - `lg` — chat panel / modals: `0 12px 40px hsl(178 52% 11% / 0.18)`
- **Motion:** purposeful and quick. 150–200 ms for hovers/toggles, 250–300 ms for
  panels (chat open/close, quote reveal). Standard ease `cubic-bezier(0.2, 0, 0,
1)`. The sparkle motif may animate a subtle one-shot shine on success — never
  looping, never distracting. Respect `prefers-reduced-motion`.

---

## 8. Component Style Guidance

- **Buttons.** Primary = solid teal `primary` / white text. **High-intent CTAs**
  (Cotizar, Agendar, Pagar) = **lime `lime` background / deep-green
  `lime-foreground` text** — lime is reserved for the money-making action so it
  reads as _the_ next step. Secondary = outline teal. Ghost for tertiary. Radius
  `0.75rem`, min height 44 px.
- **Cards.** White (`card`) on tinted `background`, `border` hairline, `sm`
  shadow, `1rem` radius, 20–24 px padding. Quote-result and booking-summary cards
  use an `accent` (soft teal) header band.
- **Inputs.** `input` border, `0.75rem` radius, focus = 2 px `ring` with a soft
  offset. The m² **slider** uses a teal track with a lime-accented thumb.
- **Badges.** Status badges map to semantic tokens: `pending` → muted, `confirmed`
  → primary, `in_progress` → secondary, `completed` → success, `cancelled` →
  destructive; `payment_status: paid` → success, `refunded` → warning.
- **Chat widget "Lux".** Fixed bottom-right (`bottom-5 right-5`), 56 px teal FAB
  with the sparkle mark. Panel 360×480, `card` surface, `lg` shadow, `0.75rem`
  radius. Bot bubbles `muted`; user bubbles `primary` right-aligned. A persistent
  "Hablar con una persona por WhatsApp" affordance at the base. Streaming replies
  show a typing shimmer.

---

## 9. Accessibility

- **Contrast:** body text and interactive labels meet **WCAG AA (≥ 4.5:1)**; large
  headings ≥ 3:1. Note: **lime `#D6F94B` is a background-only accent** — never
  place lime text on white or teal on lime; always pair lime with
  `lime-foreground` (deep green `#175231`), which passes AA.
- **Focus:** always-visible focus ring using `ring`; never `outline: none` without
  a replacement. Keyboard order follows visual order in the quote → book flow.
- **Tap targets:** minimum 44×44 px for all interactive elements (buttons, slider
  thumb, chat FAB, time-block selectors).
- **Motion:** honor `prefers-reduced-motion` — disable the sparkle shine and panel
  scale animations.
- **Semantics:** label every input (`aria-label`/`<label>`), announce quote
  results and errors politely to screen readers, and ensure the color-coded status
  badges also carry a text label (never color alone).
