# Servicios Luxel — North-Star Goal & Product Strategy

> Founding strategy document. Locale: **es-CL** (Región Metropolitana, Santiago).
> Prose is in English; example user-facing copy is in Spanish.

---

## 1. North-Star Goal

> **Become the default way a Santiago household or office books a trusted cleaning
> service — measured by the number of _paid, completed_ cleanings per month, with
> at least 40% of that volume flowing through active subscriptions within 12 months.**

The single number we optimize is **paid completed cleanings / month** (the
"North Star Metric", NSM). It is honest — it only counts revenue we actually
delivered — and it composes every part of the funnel: coverage, quote accuracy,
booking friction, payment success, and service quality all move it. Subscriptions
are the leverage: a subscriber generates 4× (weekly) the completed cleanings of a
one-time customer for the same acquisition cost.

---

## 2. Value Proposition & Target Segments

### Core value proposition

**"Precio claro al instante, agenda en minutos, servicio impecable."**
Cleaning in Chile today is booked through informal WhatsApp referrals with opaque
pricing and no guarantee. Luxel replaces that with a transparent, self-serve
online experience:

- **Instant, itemized price** by square meters + location — no back-and-forth,
  no "te cotizo y te aviso". The price is computed by a pure, unit-tested engine
  (`packages/pricing`), so it is deterministic and defensible.
- **Book and pay online** in one flow — MercadoPago (local, primary) or card via
  Stripe.
- **Recurring plans** with real, tiered discounts (weekly 15% / biweekly 10% /
  monthly 5%) that turn a chore into a set-and-forget subscription.
- **Human backup** one tap away — the chat concierge escalates to a real person
  over WhatsApp.

### Target segments

| Segment                              | Who                                                                                             | Primary job-to-be-done                                                  | Signature service                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| **Busy professionals**               | Dual-income households, 40–120 m² apartments in Providencia, Ñuñoa, Las Condes, Santiago Centro | "Keep my home clean without managing a cleaner."                        | `regular`, weekly/biweekly subscription     |
| **Property managers / Airbnb hosts** | Short-stay hosts and small property administrators doing turnovers                              | "Get a unit spotless and ready-to-rent on a fixed date, reliably."      | `move_out`, on-demand + scheduled recurring |
| **Small offices**                    | 1–3 room offices, co-working suites, clinics                                                    | "A predictable, invoiced cleaning cadence without an in-house janitor." | `regular` weekly, `company`-provided tools  |

The three service tiers in the seed map cleanly to these jobs: `regular`
(15.000 CLP base, 250/m²), `deep` (30.000, 450/m²), `move_out` (40.000, 600/m²).

---

## 3. End-to-End Target User Journey

Each stage lists the **on-site surface** (the route/component that exists in
`apps/web`), the **job-to-be-done**, and the **primary metric**.

| Stage              | Surface                                                                                                     | Job-to-be-done                                                         | Primary metric                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| **1. Awareness**   | Landing `/[locale]` (`hero`, `how-it-works`, `features`, `pricing-teaser`, `faq`) + future comuna SEO pages | "Understand what Luxel does and whether it covers my zone and budget." | Landing → `quote_started` rate            |
| **2. Quote**       | `/calculator` (service type, m² slider, address autocomplete w/ Nominatim + Chile DPA comunas)              | "Get a real price for _my_ home in under a minute."                    | `quote_calculated` rate; out-of-area rate |
| **3. Book**        | `/book` (date + `mañana`/`tarde` block, capacity-checked, choose provider)                                  | "Lock a day and time I trust will be honored."                         | Quote → `booking_created` rate            |
| **4. Pay**         | Checkout redirect (`/api/checkout/{stripe,mercadopago}`)                                                    | "Pay securely and get confirmation."                                   | Booking → `payment_succeeded` rate        |
| **5. Service**     | Operator fulfills; booking `pending → confirmed → in_progress → completed`                                  | "Have the cleaning happen, on time, to standard."                      | On-time rate; completion rate             |
| **6. Rating**      | _(Phase 2)_ post-service review prompt                                                                      | "Tell Luxel how it went; build trust for the next buyer."              | Review submission rate; avg rating        |
| **7. Resubscribe** | `/account` (bookings, subscriptions, profile)                                                               | "Keep it going without re-entering everything."                        | Subscription attach rate; re-book rate    |

### Concierge overlay ("Lux")

The AI concierge (see [`AI.md`](./AI.md)) is not a separate stage — it is an
**assistive layer over stages 1–6**. It can quote (`get_quote`), check coverage
(`check_coverage`), recommend a tier (`recommend_service`), check slots
(`check_availability`), answer FAQs, and hand off to a human. Its job is to
compress the funnel: turn a hesitant visitor into a `booking_created` inside one
conversation.

---

## 4. Activation & Retention Model

### Activation

> **A customer is "activated" the moment their first booking reaches
> `payment_status = 'paid'` (their first paid booking).**

This is the truthful activation event: it means the pricing was clear enough, the
zone was covered, a slot existed, and checkout succeeded. It fires server-side
from the payment webhooks (`payment_succeeded`), never from the client — see
[`METRICS.md`](./METRICS.md) §"Data governance".

Everything before activation is the **acquisition funnel**; everything after is
the **retention flywheel**.

### Retention

Retention is driven almost entirely by **subscriptions**. The data model already
supports it: `subscriptions` (frequency `weekly|biweekly|monthly`, status
`active|paused|cancelled`) and `bookings.subscription_id` linking each generated
visit back to its plan.

Retention levers, in priority order:

1. **Subscription attach at booking** — the strongest lever. A one-time buyer who
   converts to weekly is worth ~4× per month at 15% off. The discount is the hook;
   the convenience is the retainer.
2. **On-time, high-quality service** — the pre-condition for everything. A missed
   or poor visit churns a subscriber instantly.
3. **Frictionless self-serve management** — pause/cancel/resume from `/account`
   (`setSubscriptionStatusAction`). Pausing is a _retention feature_: a customer
   who can pause for a month abroad does not cancel.
4. **WhatsApp re-engagement** — reminders, "¿reactivamos tu suscripción?" nudges
   through the same unified `messages` channel.

---

## 5. Business Model & Unit Economics

Luxel is a **managed marketplace**: it sets the price, collects payment, and
dispatches an operator. Revenue = the delivered price of each cleaning; margin =
that price minus the operator payout and payment/ops costs. (Operator payout terms
are an operations decision, not encoded in the schema yet — the take-rate framing
below is the model to instrument once payouts are tracked.)

### The pricing engine (verified from seed + `packages/pricing`)

```
total = base_rate(service)                       # by service type
      + per_m2_rate(service) × m²
      + round(distance_per_km_clp × distance_km) # haversine to nearest active op point
      + tools_surcharge      (if tools = "company")
      − subscription_discount(frequency)         # % of the subtotal above
```

All money is **integer CLP** (no minor unit). Distance uses the haversine to the
_nearest active_ operation point; outside every radius is a real error state
(`OutOfServiceAreaError` → `out_of_area`).

Seeded configuration:

| Parameter             | Value                                              |
| --------------------- | -------------------------------------------------- |
| `regular`             | base 15.000 CLP, 250 CLP/m²                        |
| `deep`                | base 30.000 CLP, 450 CLP/m²                        |
| `move_out`            | base 40.000 CLP, 600 CLP/m²                        |
| `tools_surcharge_clp` | 8.000 CLP                                          |
| `distance_per_km_clp` | 400 CLP/km                                         |
| Discounts             | weekly 15% · biweekly 10% · monthly 5%             |
| Operation point       | Santiago Centro (−33.4489, −70.6693), radius 25 km |

### Worked example — end-to-end

**Scenario:** 60 m² apartment, `regular` cleaning, Luxel brings supplies
(`company`), address ~8 km from Santiago Centro.

**One-time booking:**

| Line                  | Formula                 | CLP        |
| --------------------- | ----------------------- | ---------- |
| Base (regular)        | —                       | 15.000     |
| Per m²                | 250 × 60                | 15.000     |
| Distance              | round(400 × 8)          | 3.200      |
| Tools surcharge       | company brings supplies | 8.000      |
| **Subtotal**          |                         | **41.200** |
| Subscription discount | one-time → 0%           | 0          |
| **Total (una vez)**   |                         | **41.200** |

**Same job as a weekly subscription** (the discount applies to the whole subtotal):

| Line                   | CLP        |
| ---------------------- | ---------- |
| Subtotal               | 41.200     |
| Weekly discount (−15%) | −6.180     |
| **Total per visit**    | **35.020** |

_(Sanity check against the unit tests: 60 m² `regular`, `company` tools, distance
0, one-time = **38.000 CLP** — matches `packages/pricing/test/quote.test.ts`.)_

### One-time vs subscription LTV

Using the weekly example (35.020 CLP/visit):

|                  | One-time                  | Weekly subscriber (illustrative)       |
| ---------------- | ------------------------- | -------------------------------------- |
| Revenue / month  | 41.200 (single)           | 35.020 × ~4.3 ≈ **150.586**            |
| Acquisition cost | full CAC per booking      | CAC amortized across all future visits |
| Retention risk   | 100% "churns" after 1 job | churns only on cancel                  |

The strategic implication: **every point of subscription-attach rate is worth
multiples of an equivalent point of one-time conversion.** Growth spend should be
judged on _activated subscribers_, not raw signups.

---

## 6. Growth Loops

1. **Referral loop _(Phase 2)_** — a happy, activated customer invites a neighbor;
   both get a credit. Needs a `referrals` table + credit ledger. Powerful in
   Santiago's dense apartment buildings where one satisfied unit seeds the tower.
2. **WhatsApp re-engagement loop** — the `messages` table already unifies web +
   WhatsApp. Post-service follow-ups, subscription nudges, and win-back messages
   run through it and pull dormant customers back to `booking_created`.
3. **SEO comuna landing pages _(Phase 1.5)_** — "Aseo en Providencia", "Limpieza
   post-obra en Ñuñoa" pages, one per covered comuna, feeding organic traffic
   straight into `/calculator` with the comuna pre-filled. Cheap, compounding,
   and defensible because it maps to real coverage radii.
4. **Ratings → trust loop _(Phase 2)_** — reviews raise conversion for the _next_
   visitor, which raises volume, which produces more reviews. This is the
   marketplace flywheel; it is why ratings are a top Phase-2 priority.

---

## 7. Phased Roadmap

Each item is tied to tables/features that **exist today** or need to be **added**.

### Phase 1 — Foundation & Conversion (this build)

- **Brand system** ("Fresh Teal + Lime") — tokens already in
  `apps/web/src/app/globals.css`; documented in [`BRAND.md`](./BRAND.md).
- **AI concierge "Lux"** — replace the keyword FAQ matcher (`/api/chat`,
  `lib/faq.ts`) with a Claude-powered concierge (Anthropic TS SDK,
  `claude-opus-4-8`, streaming, tool-use). See [`AI.md`](./AI.md).
- **Analytics instrumentation** — PostHog is mounted (`lib/posthog/provider.tsx`)
  but events are not yet emitted. Ship the full event taxonomy in
  [`METRICS.md`](./METRICS.md), especially server-side `payment_succeeded`.
- **Tables in play:** all of `0001_init.sql` + `0002_payments.sql` (existing).

### Phase 2 — Trust & Retention

- **Ratings / reviews** — new `reviews` table (booking_id, rating, comment);
  post-service prompt; surface aggregate rating on landing + comuna pages.
- **Referrals** — new `referrals` + credit ledger tables; share flow.
- **Operator app** — operators today are admin-managed rows with no login. Add an
  operator-facing view (assigned bookings, mark `in_progress`/`completed`, on-time
  capture) — enables the on-time metric to be real.
- **Subscription self-serve** — the model + pause/cancel already exist
  (`setSubscriptionStatusAction`); complete create/edit self-serve and provider
  subscription sync (`subscriptions.provider_subscription_id`).

### Phase 3 — Scale & Supply

- **Multi-city expansion** — the model is already city-agnostic: add rows to
  `operation_points`. Expansion is an ops + supply problem, not a schema change.
- **Dynamic pricing** — `pricing_config` is a live, keyed table; introduce
  time/day/demand modifiers on top of the deterministic base engine.
- **Marketplace supply growth** — operator onboarding funnel, capacity dashboards,
  demand forecasting to decide where to open the next operation point.

---

## 8. Success Metrics Dashboard

**North-Star Metric:** paid completed cleanings / month (≥ 40% via active
subscriptions within 12 months).

### Input metrics

| Metric                       | Definition                                           | Instrumented from          |
| ---------------------------- | ---------------------------------------------------- | -------------------------- |
| **Landing → quote rate**     | sessions that reach `quote_started`                  | client (calculadora)       |
| **Quote → book rate**        | `quote_calculated` → `booking_created`               | server actions             |
| **Book → pay rate**          | `booking_created` → `payment_succeeded`              | payment webhooks (server)  |
| **Out-of-area rate**         | `quote_out_of_area` / `quote_started`                | server (quote action)      |
| **Activation rate**          | first `payment_succeeded` per new customer           | server (webhooks)          |
| **Subscription attach rate** | bookings with a `subscription_id` / all bookings     | server                     |
| **CAC**                      | paid spend / activated customers                     | ads + PostHog              |
| **NPS / avg rating**         | post-service survey _(Phase 2)_                      | reviews                    |
| **On-time rate**             | visits started within the promised block _(Phase 2)_ | operator app               |
| **Churn**                    | subscriptions → `cancelled` / active base            | server (`/account` action) |

### Dashboards to build (PostHog)

1. **Acquisition funnel:** pageview → `quote_started` → `quote_calculated` →
   `booking_created` → `payment_succeeded`.
2. **Activation cohort:** new customers → first paid booking, by comuna and
   service type.
3. **Retention flywheel:** subscription attach rate, active-subscriber count,
   churn, MRR-equivalent (sum of active `amount_per_visit_clp` × frequency).
4. **Concierge impact:** chat-influenced bookings vs self-serve (see
   [`METRICS.md`](./METRICS.md) §Funnels).

See [`METRICS.md`](./METRICS.md) for the complete event taxonomy and
instrumentation map.
