# Servicios Luxel — Analytics, Events & Data Strategy

> In-house event store (`analytics_events` in Supabase) + optional PostHog
> mirror + Sentry. Events are emitted today from the client (`track()`) and the
> server (`capture()`). This doc defines the taxonomy, the funnels, and the
> instrumentation map. Ties back to [`GOAL.md`](./GOAL.md).

---

## 1. Measurement Philosophy

**Every meaningful action is an event.** If it moves the North Star or explains
why it moved, it emits a typed event with consistent properties. Names live in
`apps/web/src/lib/analytics/events.ts` (`EVENTS`). Client and server import the
same constants, so names never drift.

The store is ours. `track()` (`lib/analytics/client.ts`) sends client events to
`/api/events` with `sendBeacon`. `capture()` (`lib/analytics/server.ts`) writes
server events. Both land in `analytics_events`. Both mirror to PostHog when
`NEXT_PUBLIC_POSTHOG_KEY` is set. PostHog is initialized in
`apps/web/src/lib/posthog/provider.tsx` with `person_profiles: 'identified_only'`,
`capture_pageview: false` and `capture_pageleave: true`. Page views are sent
explicitly.

Two non-negotiables:

1. **Consistent property naming** — `snake_case` keys, CLP integers named
   `amount_clp`, service identified by `service_slug`, location by `commune`.
2. **Revenue-bearing events are captured server-side** — bookings and payments
   are emitted from server actions and webhooks, never trusted from the client
   (see §6).

---

## 2. Event Taxonomy

Property conventions: `service_slug` (`regular|deep`), `amount_clp` (integer
CLP), `frequency` (`one_time|weekly|biweekly|monthly`), `commune`,
`payment_provider` (`mercadopago|transbank|stripe`), `booking_id`,
`session_id`, `tool`.

| Event (snake_case)           | Fires when                                              | Key properties                                                                                                                                              | Funnel stage         |
| ---------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `$pageview`                  | Every path change (PostHog auto-pageview is off)        | `$current_url`                                                                                                                                              | Awareness            |
| `quote_started`              | The calculator has enough input to quote                | `service_slug`, `square_meters`                                                                                                                             | Quote                |
| `quote_calculated`           | The server returns a successful quote                   | `amount_clp`, `service_slug`, `square_meters`, `frequency`, `tools_provided_by`                                                                             | Quote                |
| `quote_out_of_area`          | The quote resolves to `out_of_area`                     | `service_slug`                                                                                                                                              | Quote (leak)         |
| `lead_out_of_area_submitted` | An out-of-area visitor leaves contact details           | `commune`, `service_slug`                                                                                                                                   | Quote (leak → lead)  |
| `booking_started`            | The booking form mounts with a quote                    | `frequency` and the quote fields                                                                                                                            | Book                 |
| `booking_created`            | Booking row inserted (server)                           | `square_meters`, `tools_provided_by`, `payment_provider`, `commune`, …                                                                                      | Book                 |
| `checkout_started`           | Redirect to a provider checkout (server)                | `booking_id`, `amount_clp`, `payment_provider`                                                                                                              | Pay                  |
| `payment_succeeded`          | A provider confirms payment (server)                    | `booking_id`, `amount_clp`, `payment_provider`                                                                                                              | Pay (activation)     |
| `subscription_created`       | A subscription row is created (server)                  | `subscription_id`, `booking_id`, `frequency`, `amount_per_visit_clp`                                                                                        | Retention            |
| `chat_opened`                | User opens the Lux widget                               | `session_id`                                                                                                                                                | Assist (cross-stage) |
| `chat_message_sent`          | A user message reaches `/api/chat` or `/api/chat/human` | `session_id`, `mode: 'human'` on the human bridge                                                                                                           | Assist               |
| `ai_tool_called`             | Lux invokes a tool (one per call)                       | `tool` (`check_coverage` / `get_quote` / `get_airbnb_quote` / `get_host_status` / `share_links` / `check_availability` / `escalate_to_human`), `session_id` | Assist               |
| `ai_handoff_to_human`        | A tool sets `handoff` (`escalate_to_human`)             | `session_id`                                                                                                                                                | Assist → Human       |
| `cta_clicked`                | A button inside a chat widget card is clicked           | `source` (`chat_quote` / `chat_availability` / `chat_airbnb` / `chat_links`), `cta`                                                                         | Assist → Funnel      |
| `account_viewed`             | `/account` rendered                                     | —                                                                                                                                                           | Retention            |

Guidance: keep one event per real action. `quote_calculated` and
`quote_out_of_area` are mutually exclusive outcomes of one request.

**Not instrumented today:** failed payments, subscription pause and
subscription cancel emit no event. The `bookings` and `subscriptions` rows in
Supabase are the record for those.

---

## 3. Key Funnels

1. **Quote → Book → Pay**
   `quote_calculated` → `booking_created` → `checkout_started` →
   `payment_succeeded`. The core conversion funnel. Break it down by
   `service_slug`, `commune`, and `frequency`.

2. **Visitor → Activated**
   `$pageview` → `quote_started` → `quote_calculated` → `booking_created` →
   `payment_succeeded` (first ever = activation). This is the acquisition
   funnel. Its last step is the activation definition from
   [`GOAL.md`](./GOAL.md) §4.

3. **Chat → Booking-influenced**
   `chat_opened` / `ai_tool_called{tool=get_quote}` → later `booking_created`
   in the same `session_id` / person. Compares conversion for **AI-assisted**
   and **self-serve** sessions.

Supporting leak analyses: `quote_out_of_area` rate (coverage gaps by comuna),
`lead_out_of_area_submitted` (recovered demand), and the drop-off between
`booking_created` and `payment_succeeded`.

---

## 4. Cohorts & Segments

- **By comuna** — conversion, out-of-area rate, and demand density per comuna.
  Drives SEO landing-page and next-operation-point decisions.
- **By service type** — `regular` vs `deep` economics and volume.
- **One-time vs subscriber** — the retention split; track attach rate and LTV.
- **AI-assisted vs self-serve** — sessions that used Lux vs those that did not,
  compared on conversion and average `amount_clp`.
- **Activated vs not** — customers with ≥1 `payment_succeeded`.
- **Tools policy** — `customer` vs `company` (surcharge attach rate).

---

## 5. KPIs / North-Star Tie-In & Dashboards

The North Star and its input metrics are defined in [`GOAL.md`](./GOAL.md) §8.
This event taxonomy makes each of them measurable. The operator panel
(`apps/admin`) reads the in-house store directly.

Dashboards to build:

1. **Acquisition funnel** — the Visitor → Activated funnel with per-stage
   conversion, sliced by comuna and service type.
2. **Activation cohort** — new customers → first `payment_succeeded`, cohorted
   by signup week.
3. **Retention & MRR-equivalent** — active-subscriber count, attach rate, and
   summed `amount_per_visit_clp` × frequency from the `subscriptions` table.
4. **Concierge impact** — AI-assisted vs self-serve conversion and revenue;
   `ai_tool_called` by `tool`; `ai_handoff_to_human` rate.
5. **Coverage health** — `quote_out_of_area` and `lead_out_of_area_submitted`
   by comuna.

---

## 6. Data Governance

- **PII.** Email, phone, `full_name`, and street address are PII. They live in
  `customers` / `addresses` under Supabase RLS. **Do not send raw PII to
  PostHog.** Identify persons by a stable id (Clerk user id). Send `commune` for
  geo analysis, never the street `line`. Chat `body` text is not forwarded to
  analytics; only metadata like `tool` and `session_id`.
- **Retention.** Set a defined retention window on raw analytics events in
  PostHog. The authoritative business record (bookings, payments,
  subscriptions) is Supabase.
- **Server-side capture for trustworthy revenue.** `booking_created`,
  `checkout_started`, `payment_succeeded`, `subscription_created` and the `ai_*`
  events are captured server-side with `capture()`, keyed by the person's Clerk
  user id (or the booking / session id when signed out). Client-only capture is
  unreliable (ad-blockers, tab closes, spoofing). Client events (`$pageview`,
  `quote_*`, `booking_started`, `chat_opened`, `cta_clicked`, `account_viewed`,
  `lead_out_of_area_submitted`) are fine from the browser.

---

## 7. Instrumentation Map

Each event and the file that emits it. Paths are relative to the repo root.

| Event                        | Emit from                                                                                                                                                                                                            | Client / Server |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `$pageview`                  | `apps/web/src/components/analytics/track-view.tsx` (`PostHogPageview`), mounted in `apps/web/src/app/[locale]/layout.tsx`                                                                                            | Client          |
| `quote_started`              | `apps/web/src/app/[locale]/(site)/calculator/calculator-form.tsx`                                                                                                                                                    | Client          |
| `quote_calculated`           | `apps/web/src/app/[locale]/(site)/calculator/calculator-form.tsx` (after `getQuoteAction` returns `ok`)                                                                                                              | Client          |
| `quote_out_of_area`          | `apps/web/src/app/[locale]/(site)/calculator/calculator-form.tsx` (`out_of_area` branch)                                                                                                                             | Client          |
| `lead_out_of_area_submitted` | `apps/web/src/app/[locale]/(site)/calculator/out-of-area-form.tsx`                                                                                                                                                   | Client          |
| `booking_started`            | `apps/web/src/app/[locale]/(site)/book/booking-form.tsx`                                                                                                                                                             | Client          |
| `booking_created`            | `apps/web/src/app/[locale]/(site)/book/actions.ts` (`createBookingAction`, after insert)                                                                                                                             | Server          |
| `checkout_started`           | `apps/web/src/app/[locale]/(site)/book/actions.ts` (before the redirect to `/api/checkout/<provider>`)                                                                                                               | Server          |
| `payment_succeeded`          | `apps/web/src/app/api/webhooks/stripe/route.ts`, `apps/web/src/app/api/webhooks/mercadopago/route.ts`, `apps/web/src/app/api/checkout/transbank/commit/route.ts`; `apps/web/src/lib/payments/dev-mock.ts` (dev only) | Server          |
| `subscription_created`       | `apps/web/src/lib/subscriptions.ts` (`ensureSubscriptionForBooking`)                                                                                                                                                 | Server          |
| `chat_opened`                | `apps/web/src/components/chat/chat-widget.tsx` (open toggle)                                                                                                                                                         | Client          |
| `chat_message_sent`          | `apps/web/src/app/api/chat/route.ts`; `apps/web/src/app/api/chat/human/route.ts` (`mode: 'human'`)                                                                                                                   | Server          |
| `ai_tool_called`             | `apps/web/src/app/api/chat/route.ts` (tool loop, per tool execution)                                                                                                                                                 | Server          |
| `ai_handoff_to_human`        | `apps/web/src/app/api/chat/route.ts` (when a tool result sets `handoff`)                                                                                                                                             | Server          |
| `cta_clicked`                | `apps/web/src/components/chat/chat-widget.tsx` (quote, availability, Airbnb and link cards)                                                                                                                          | Client          |
| `account_viewed`             | `apps/web/src/app/[locale]/(site)/account/page.tsx` (`<TrackView event="account_viewed" />`)                                                                                                                         | Client          |

**Idempotency note:** `payment_succeeded` fires from webhooks that already
deduplicate via the `payment_events` ledger (`0002_payments.sql`). The event is
emitted inside the non-duplicate branch, so a retried webhook delivery does not
double-count revenue.
