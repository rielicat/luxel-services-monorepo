# Servicios Luxel — Analytics, Events & Data Strategy

> PostHog (product analytics) + Sentry (monitoring). PostHog is already mounted;
> events are not yet emitted. This doc defines the taxonomy, funnels, and the
> instrumentation map to close that gap. Ties back to [`GOAL.md`](./GOAL.md).

---

## 1. Measurement Philosophy

**Every meaningful action is an event.** If it moves the North Star (paid
completed cleanings/month) or explains why it moved, it must emit a typed event
with consistent properties. PostHog is already initialized in
`apps/web/src/lib/posthog/provider.tsx` with `person_profiles: 'identified_only'`,
`capture_pageview: false` (we send page views explicitly), and
`capture_pageleave: true`.

Two non-negotiables:

1. **Consistent property naming** — `snake_case` keys, CLP integers named
   `amount_clp`, service identified by `service_slug`, location by `commune`.
2. **Revenue-bearing events are captured server-side** — bookings and payments are
   emitted from server actions / webhooks, never trusted from the client (see §6).

---

## 2. Event Taxonomy

Property naming conventions used throughout: `service_slug`
(`regular|deep|move_out`), `amount_clp` (integer CLP), `frequency`
(`one_time|weekly|biweekly|monthly`), `commune`, `timeblock` (`manana|tarde`),
`payment_provider` (`stripe|mercadopago`), `booking_id`, `session_id`, `source`
(`web|ai`).

| Event (snake_case)       | Fires when                                         | Key properties                                                                                                                                       | Funnel stage         |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `page_viewed`            | Any route render (explicit — auto-pageview is off) | `path`, `locale`, `referrer`                                                                                                                         | Awareness            |
| `quote_started`          | User opens/interacts with the calculator           | `source`, `service_slug?`                                                                                                                            | Quote                |
| `quote_calculated`       | Server returns a successful quote                  | `service_slug`, `square_meters`, `amount_clp`, `frequency`, `distance_km`, `tools_provided_by`, `out_of_area:false`, `commune`                       | Quote                |
| `quote_out_of_area`      | Quote resolves to `OutOfServiceAreaError`          | `commune`, `square_meters`, `service_slug`, `out_of_area:true`                                                                                       | Quote (leak)         |
| `booking_started`        | User lands on `/book` with a quote                 | `service_slug`, `amount_clp`, `frequency`                                                                                                            | Book                 |
| `booking_created`        | Booking row inserted (server)                      | `booking_id`, `service_slug`, `amount_clp`, `frequency`, `commune`, `timeblock`, `scheduled_date`, `tools_provided_by`, `subscription_attached:bool` | Book                 |
| `checkout_started`       | Redirect to a provider checkout                    | `booking_id`, `payment_provider`, `amount_clp`                                                                                                       | Pay                  |
| `payment_succeeded`      | Provider webhook confirms payment (server)         | `booking_id`, `payment_provider`, `amount_clp`, `provider_payment_id`                                                                                | Pay (activation)     |
| `payment_failed`         | Provider webhook reports failure/decline (server)  | `booking_id`, `payment_provider`, `reason`                                                                                                           | Pay (leak)           |
| `subscription_created`   | A subscription row is created                      | `subscription_id`, `frequency`, `amount_per_visit_clp`, `service_slug`, `payment_provider`                                                           | Retention            |
| `subscription_paused`    | Status → `paused`                                  | `subscription_id`, `frequency`                                                                                                                       | Retention            |
| `subscription_cancelled` | Status → `cancelled`                               | `subscription_id`, `frequency`, `tenure_days`                                                                                                        | Retention (churn)    |
| `chat_opened`            | User opens the Lux widget                          | `source`, `signed_in:bool`                                                                                                                           | Assist (cross-stage) |
| `chat_message_sent`      | User sends a message to Lux                        | `session_id`, `signed_in:bool`, `char_len`                                                                                                           | Assist               |
| `ai_tool_called`         | Lux invokes a tool (one per call)                  | `session_id`, `tool_name` (`get_quote`/`check_coverage`/`recommend_service`/`check_availability`/`answer_faq`/`escalate_to_human`), `success:bool`   | Assist               |
| `ai_handoff_to_human`    | `escalate_to_human` runs (WhatsApp handoff)        | `session_id`, `reason?`                                                                                                                              | Assist → Human       |
| `account_viewed`         | `/account` rendered                                | `has_subscription:bool`, `bookings_count`                                                                                                            | Retention            |

Guidance: keep one event per real action. Do not emit `quote_calculated` and
`quote_out_of_area` for the same request — they are mutually exclusive outcomes.

---

## 3. Key Funnels to Build in PostHog

1. **Quote → Book → Pay**
   `quote_calculated` → `booking_created` → `checkout_started` →
   `payment_succeeded`. The core conversion funnel; break down by `service_slug`,
   `commune`, and `frequency`.

2. **Visitor → Activated**
   `page_viewed` → `quote_started` → `quote_calculated` → `booking_created` →
   `payment_succeeded` (first ever = activation). This is the acquisition funnel;
   its final step is the activation definition from [`GOAL.md`](./GOAL.md) §4.

3. **Chat → Booking-influenced**
   `chat_opened` / `ai_tool_called{tool_name=get_quote}` → later
   `booking_created` in the same `session_id` / person. Quantifies Lux's funnel
   impact by comparing conversion for **AI-assisted** vs **self-serve** sessions.

Supporting leak analyses: `quote_out_of_area` rate (coverage gaps by comuna),
`payment_failed` rate (by provider), and drop-off between `booking_created` and
`payment_succeeded`.

---

## 4. Cohorts & Segments

- **By comuna** — conversion, out-of-area rate, and demand density per comuna;
  drives SEO landing-page and next-operation-point decisions.
- **By service type** — `regular` vs `deep` vs `move_out` economics and volume.
- **One-time vs subscriber** — the retention split; track attach rate and LTV.
- **AI-assisted vs self-serve** — sessions that used Lux vs those that did not,
  compared on conversion and average `amount_clp`.
- **Activated vs not** — customers with ≥1 `payment_succeeded`.
- **Tools policy** — `customer` vs `company` (surcharge attach rate).

---

## 5. KPIs / North-Star Tie-In & Dashboards

The North Star (**paid completed cleanings/month**, ≥40% via subscriptions) and
its input metrics are defined in [`GOAL.md`](./GOAL.md) §8. This event taxonomy is
what makes each of those measurable.

Dashboards to build:

1. **Acquisition funnel** — the Visitor → Activated funnel with per-stage
   conversion, sliced by comuna and service type.
2. **Activation cohort** — new customers → first `payment_succeeded`, cohorted by
   signup week.
3. **Retention & MRR-equivalent** — active-subscriber count, attach rate, churn
   from `subscription_cancelled`, and summed `amount_per_visit_clp` × frequency.
4. **Concierge impact** — AI-assisted vs self-serve conversion and revenue.
5. **Coverage & payment health** — `quote_out_of_area` by comuna;
   `payment_failed` by provider.

---

## 6. Data Governance

- **PII.** Email, phone, `full_name`, and street address are PII. They live in
  `customers` / `addresses` under Supabase RLS. **Do not send raw PII to PostHog.**
  Identify persons by a stable id (Clerk user id), send `commune` for geo analysis
  — never the full street `line`. Chat `body` text is not forwarded to analytics
  (only metadata like `tool_name`, `char_len`).
- **Retention.** Set a defined retention window on raw analytics events in
  PostHog; keep the authoritative business record (bookings, payments,
  subscriptions) in Supabase, which is the system of record for revenue.
- **Server-side capture for trustworthy revenue.** `booking_created`,
  `payment_succeeded`, `payment_failed`, and `subscription_*` **must** be captured
  server-side (from server actions and webhooks) using a PostHog server client
  keyed by the person's `distinct_id`. Client-only capture is unreliable
  (ad-blockers, tab closes, spoofing) and would make revenue metrics untrustworthy.
  Client events (`page_viewed`, `quote_started`, `chat_*`) are fine from the
  browser.

---

## 7. Instrumentation Map

Each event linked to the file/action that should emit it. Paths are relative to
the repo root.

| Event                                            | Emit from                                                                                                                                 | Client / Server           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `page_viewed`                                    | `apps/web/src/lib/posthog/provider.tsx` (route-change listener)                                                                           | Client                    |
| `quote_started`                                  | `apps/web/src/app/[locale]/calculator/calculator-form.tsx`                                                                                | Client                    |
| `quote_calculated`                               | `apps/web/src/app/[locale]/calculator/actions.ts` (`getQuoteAction`, `ok` branch)                                                         | Server                    |
| `quote_out_of_area`                              | `apps/web/src/app/[locale]/calculator/actions.ts` (`out_of_area` branch)                                                                  | Server                    |
| `booking_started`                                | `apps/web/src/app/[locale]/book/booking-form.tsx` (or `agendar/page.tsx`)                                                                 | Client                    |
| `booking_created`                                | `apps/web/src/app/[locale]/book/actions.ts` (`createBookingAction`, after insert)                                                         | Server                    |
| `checkout_started`                               | `apps/web/src/app/api/checkout/stripe/route.ts` + `.../checkout/mercadopago/route.ts`                                                     | Server                    |
| `payment_succeeded`                              | `apps/web/src/app/api/webhooks/stripe/route.ts` (`checkout.session.completed`) + `.../webhooks/mercadopago/route.ts` (`payment` approved) | Server                    |
| `payment_failed`                                 | same webhook routes (failure/decline branches)                                                                                            | Server                    |
| `subscription_created`                           | subscription-creation action (to be added) / `agendar/actions.ts` when a plan is chosen                                                   | Server                    |
| `subscription_paused` / `subscription_cancelled` | `apps/web/src/app/[locale]/account/actions.ts` (`setSubscriptionStatusAction`)                                                            | Server                    |
| `chat_opened`                                    | `apps/web/src/components/chat/chat-widget.tsx` (open toggle)                                                                              | Client                    |
| `chat_message_sent`                              | `apps/web/src/components/chat/chat-widget.tsx` (`send`)                                                                                   | Client                    |
| `ai_tool_called`                                 | `apps/web/src/app/api/chat/route.ts` (tool-use loop, per tool execution)                                                                  | Server                    |
| `ai_handoff_to_human`                            | `apps/web/src/app/api/chat/route.ts` (handoff branch / `escalate_to_human`)                                                               | Server                    |
| `account_viewed`                                 | `apps/web/src/app/[locale]/account/page.tsx`                                                                                              | Client (or server render) |

**Idempotency note:** `payment_succeeded` fires from webhooks that already
deduplicate via the `payment_events` ledger (`0002_payments.sql`). Emit the
analytics event **inside** the non-duplicate branch (after the ledger insert
succeeds, before/after the booking update) so retried webhook deliveries do not
double-count revenue.
