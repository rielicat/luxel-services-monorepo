# Servicios Luxel — Brand Identity & Design System

> "Fresh Teal + Lime" — calm, hospitable, precise, modern, trustworthy,
> premium-but-accessible. The color tokens documented here are the source of
> truth for `apps/web/src/app/globals.css`. Prose is English; example UI copy
> is es-CL.

---

## 1. Brand Essence

**Essence:** _Light that keeps a home ready._ Luxel makes hosting feel
effortless: the calm of a unit that runs itself, delivered by a team and by
software that respect the owner's time.

**Mission (operator's words):**

> "Devolverles el tiempo a los anfitriones. Que tener un Airbnb sea recibir
> ingresos, no coordinar personas."

We give the host their time back. An Airbnb must pay the host, not employ them.
The host receives income. Luxel coordinates the people.

**Vision (operator's words):**

> "Ser la administradora de Airbnb más confiable: la que de verdad se hace cargo
> de todo."

We want to be the Airbnb management company that hosts trust most. We earn that
trust because we truly handle everything, not one part of it.

**The core contrast:** a real passive income, not a second job. Receiving income,
not coordinating people. Every surface must _feel_ this contrast. Do not quote
the mission on every page. Show it: what the host stops doing, and what still
arrives in their account.

**Personality (adjectives):** Calm · Trustworthy · Effortless · Modern ·
Warm-professional · Precise.

**Positioning statement:**

> For Airbnb hosts in Chile who want the income without the work,
> **Servicios Luxel** manages the whole listing — pricing, guests, cleaning,
> repairs and inventory — for one transparent fee on the booking revenue,
> unlike informal administrators with opaque fees and no reporting.

---

## 2. Voice & Tone

**Voice:** Chilean, warm, and clear. We speak like a competent friend who happens
to run an excellent property-management team — never a corporate call center,
never slangy to the point of unprofessional. We use **tú**, not **usted**. We
keep sentences short. We are honest about what we do and never oversell.

**Tone by context:** upbeat and confident on the landing page; calm and precise
on the price page and in the onboarding flow; reassuring and human in error and
support moments.

**Stance: partner, not vendor.** We write from the host's side of the table. The
host and Luxel want the same thing: the property earns more and the host does
less. So we say "nosotros nos encargamos", never "el cliente debe". We report a
problem together with the action we already took. We never sound like a supplier
who files a ticket and waits.

### Do / Don't — partner stance (es-CL example copy)

| Context          | ✅ Do                                                | ❌ Don't                                            |
| ---------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Who does what    | "Nosotros contestamos a los huéspedes."              | "El cliente debe coordinar con el proveedor."       |
| Shared goal      | "Tu departamento arrienda mejor y tú no haces nada." | "Ofrecemos un servicio integral de administración." |
| Bad news         | "Se cayó una reserva. Ya bajamos el precio."         | "Le informamos que se registró una cancelación."    |
| The time promise | "Tu Airbnb debería ser tu ingreso pasivo."           | "Optimiza tus procesos con nuestra plataforma."     |
| Monthly report   | "Te mandamos el resumen del mes."                    | "Adjuntamos el reporte para su revisión."           |
| Asking a favor   | "¿Nos das acceso en Hospitable y seguimos nosotros?" | "El propietario deberá otorgar los accesos."        |

### Do / Don't (es-CL example copy)

| Context       | ✅ Do                                                      | ❌ Don't                                         |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| Hero CTA      | "Ver el precio"                                            | "SOLICITE UNA COTIZACIÓN AHORA"                  |
| Price shown   | "12% de lo que genera tu propiedad cada mes."              | "Precios sujetos a evaluación posterior."        |
| Billing       | "Airbnb te paga a ti. Te cobramos a fin de mes."           | "Airbnb nos paga y te descuenta la comisión."    |
| Plan status   | "Plan solicitado — te contactamos para activarlo."         | "Su solicitud está en proceso."                  |
| Chat greeting | "¡Hola! Soy Lux. ¿Te cuento cómo administramos tu Airbnb?" | "Bienvenido al chatbot. Seleccione una opción."  |
| Confirmation  | "Listo, tu Airbnb ya está conectado."                      | "Su transacción ha sido procesada exitosamente." |
| Human handoff | "Te paso con una persona por WhatsApp al toque."           | "Su solicitud será derivada a un ejecutivo."     |
| Empty state   | "Aún no tienes propiedades conectadas."                    | "No hay datos disponibles."                      |

**Style rules:** Amounts with the Chilean thousands separator (`$210.000`, never
`$210,000`), IVA included. The fee is one number: `12%` of "tus ingresos". The
guest cleaning fee is 100% for the crew and carries no commission. Never
say "0% comisión", "tarifa plana", "14 días gratis", "prueba gratis" or "m²".
Never say that Airbnb pays Luxel or deducts the fee: Airbnb pays the host, and
Luxel charges at the end of the month. The host never "answers guests" or
"manages the crew": Luxel does. Never hardcode strings in components — all copy
lives in `packages/shared/src/i18n/es-CL.json`.

**Never name a city.** No city appears in any copy a person reads: no hero, no
positioning line, no FAQ, no meta description, no alt text, no email. "Chile" is
allowed. A comuna is allowed only as real data about a real unit, such as the
gallery caption for the managed apartment in Providencia. This rule is about
copy only. Never touch the timezone string `America/Santiago`, the identifiers
that carry it (`santiagoToday`, `santiagoMonth`, `todaySantiago`), or the
address fixtures and seeds.

---

## 3. Name, Wordmark & Logo

**"Luxel"** reads as **lux** (Latin for _light_) + a modern product suffix. Light
connotes a bright, well-kept home that is ready for its next guest. The name is
short, brandable, and `.cl`-friendly (`serviciosluxel.cl`).

**Wordmark:** "Luxel" set in **Manrope**, semibold, tight tracking, with a
**sparkle/shine mark** integrated near the "L" or replacing the dot energy of the
"x". The sparkle (a 4-point shine / "destello") is the core motif — it appears as
favicon, loading state, and success/confirmation micro-illustration.

> **⚠️ Logo, favicon and OG image are placeholders.** The current build ships
> CSS gradients and a dotted-grid backdrop (`.bg-dot-grid`, `.bg-brand-glow` in
> `globals.css`) in place of logo art. The photography is real: see §4.3.

---

## 4. Assets

Palette hexes to use across all assets:
Teal-700 `#0F766E` · Teal-500 `#14B8A6` · Deep ink `#0B3B39` · Lime `#D8F84B` ·
Text-on-lime `#14532D` · Surface `#F6FBF9` · White `#FFFFFF`.

### 4.1 Logo / wordmark (placeholder today)

- **Deliverables:** horizontal lockup, stacked lockup, icon-only (sparkle).
  Formats: SVG (primary), PNG @1x/2x/3x. Light and dark variants.
- **Prompt/spec:** "Minimal, modern wordmark 'Luxel' in a geometric sans
  (Manrope-like), semibold, tight tracking, deep teal `#0F766E`. A single clean
  4-point sparkle/shine mark in lime `#D8F84B` integrated to the upper-right of
  the final letter. Flat, no gradients in the mark, generous whitespace, vector,
  transparent background. Conveys calm, bright, premium, trustworthy."

### 4.2 Favicon (placeholder today)

- **Sizes:** 16, 32, 48 px `.ico` + 180 px `apple-touch-icon.png` + 512 px
  maskable PNG.
- **Prompt/spec:** "The Luxel sparkle mark only, lime `#D8F84B` on a teal `#0F766E`
  rounded-square background, centered, high contrast, legible at 16px, no text,
  flat." Keep the icon identical across sizes.

### 4.3 Hero and gallery photography (real, shipped)

The hero image is a real unit that Luxel manages: José Manuel Infante 1045,
depto 401, Providencia. The photos live in `apps/web/public/img/jmi/*.jpg`
(1800 px wide, 200–400 KB each). Use `next/image` with `sizes`; `priority` only
on the hero.

| File                                                                                     | Use                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `terrace-sunset.jpg`                                                                     | Hero (skyline at dusk, BBQ). Warm, aspirational. |
| `living.jpg`, `bedroom-main.jpg`, `kitchen.jpg`, `hot-tub.jpg`, `dining.jpg`, `bath.jpg` | Gallery grid (6).                                |
| `living-piano.jpg`, `bedroom-2.jpg`, `terrace-night.jpg`                                 | Secondary: services section, about page.         |
| `entry.jpg`, `laundry.jpg`, `bath-2.jpg`, `bedroom-3.jpg`                                | Available, optional.                             |

Alt text in es-CL describes the room and the management: "Terraza con parrilla
y vista al atardecer en un departamento administrado por Luxel". Gallery
caption: "Departamento en Providencia, administrado por Luxel." Frames use
`rounded-3xl` and `shadow-soft`. In dark mode the frame keeps a dark border, no
white halo.

### 4.4 OG / social share image (placeholder today)

- **Dimensions:** 1200×630.
- **Prompt/spec:** "Teal `#0F766E` → teal `#14B8A6` gradient background, the Luxel
  wordmark centered, tagline 'Tu Airbnb, administrado.' in white Inter, a lime
  `#D8F84B` sparkle accent. Clean, high-contrast, readable as a thumbnail."
  Alternative: the hero photo with a teal overlay and the same tagline.

### 4.5 Service icons

The seven services (precios dinámicos, huéspedes 24/7, aseo y lavandería,
resolución de conflictos, inventario y reposición, reparaciones menores, puesta
a punto) use lucide icons in one color: `bg-primary/10 text-primary`. No
custom illustrations.

### 4.6 Crew and host trust photography (to shoot)

- **Prompt/spec:** "Warm, authentic photos of the Luxel crew (cleaning, laundry,
  small repairs) and of a host reading a report on a phone, in bright real
  Chilean apartments. Natural light, trustworthy and respectful — real people,
  not stock-cheesy. Used for the 'Luxel se encarga' trust section." Use
  consented, real crew photography before launch; stock is placeholder.

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
  (Ver el precio, Calcular mi cobro, Solicitar el plan) = **lime `lime`
  background / deep-green `lime-foreground` text** — lime is reserved for the
  next step toward the plan so it reads as _the_ action. Secondary = outline
  teal. Ghost for tertiary. Radius `0.75rem`, min height 44 px.
- **Cards.** White (`card`) on tinted `background`, `border` hairline, `sm`
  shadow, `1rem` radius, 20–24 px padding. The price card and property cards use
  an `accent` (soft teal) header band. No "recomendado" badge: there is one
  plan, so no card competes with another.
- **Inputs.** `input` border, `0.75rem` radius, focus = 2 px `ring` with a soft
  offset. The listings stepper and the revenue input keep the same radius.
- **Status labels.** Map to semantic tokens: plan `requested` → warning,
  `active` → success, `cancelled` → muted; check-in `pending` → muted,
  `submitted` → primary, `notified` → success, `failed` → destructive; cleaning
  `scheduled` → primary, crew confirmed → success, crew declined → destructive.
  Cleaning states are operator-facing only.
- **Photos.** `rounded-3xl`, `shadow-soft`, `object-cover`. Gallery: 2 columns
  on mobile, 3 on desktop. Every section stays legible at 375 px.
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
  a replacement. Keyboard order follows visual order in the price → sign-in →
  connect flow.
- **Tap targets:** minimum 44×44 px for all interactive elements (buttons, the
  price card, stepper controls, chat FAB).
- **Motion:** honor `prefers-reduced-motion` — disable the sparkle shine and panel
  scale animations.
- **Semantics:** label every input (`aria-label`/`<label>`), announce the fee
  estimate and errors politely to screen readers, give every photo a
  descriptive `alt`, and ensure the color-coded status labels also carry a text
  label (never color alone).
