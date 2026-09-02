# Servicios Luxel — Analytics, Events & Data Strategy

> In-house event store (`analytics_events` in Supabase) + optional PostHog
> mirror + Sentry. Events are emitted from the client (`track()`) and the
> server (`capture()`). This doc defines the taxonomy, the funnels and the
> instrumentation map. Ties back to [`GOAL.md`](./GOAL.md).

---

## 1. Measurement philosophy

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
   `amount_clp`, the plan as `plan` (`fixed | hybrid | commission`), location by
   `commune`.
2. **Plan and channel events are captured server-side** — a plan request, a
   plan activation and a connected listing are emitted from server actions and
   the sync pass, never trusted from the client (see §6).

---

## 2. Event taxonomy

Property conventions: `plan` (`fixed | hybrid | commission`), `amount_clp`
(integer CLP), `listings` (integer), `commune`, `session_id`, `tool`, `source`.

### Instrumented today

| Event (snake_case)    | Fires when                                              | Key properties                                                                                      | Funnel stage               |
| --------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------- |
| `$pageview`           | Every path change (PostHog auto-pageview is off)        | `$current_url`                                                                                      | Awareness / Plans          |
| `chat_opened`         | User opens the Lux widget                               | `session_id`                                                                                        | Assist (cross-stage)       |
| `chat_message_sent`   | A user message reaches `/api/chat` or `/api/chat/human` | `session_id`, `mode: 'human'` on the human bridge                                                   | Assist                     |
| `ai_tool_called`      | Lux invokes a tool (one per call)                       | `tool` (`get_airbnb_quote` / `get_host_status` / `share_links` / `escalate_to_human`), `session_id` | Assist                     |
| `ai_handoff_to_human` | A tool sets `handoff` (`escalate_to_human`)             | `session_id`                                                                                        | Assist → Human             |
| `cta_clicked`         | A button inside a chat widget card is clicked           | `source` (`chat_airbnb` / `chat_links`), `cta`                                                      | Assist → Funnel            |
| `lead_captured`       | A `leads` row is inserted (server)                      | `source` (`chat_handoff` / `newsletter` / `contact`)                                                | Lead                       |
| `account_viewed`      | `/account` rendered                                     | —                                                                                                   | Sign-up (activation proxy) |

### Planned, not instrumented today

The `plan_subscriptions`, `listing_assignments` and `checkins` rows are the
record until these ship. Add each name to `EVENTS` when it lands.

| Event                  | Fires when                                              | Key properties                   | Funnel stage   |
| ---------------------- | ------------------------------------------------------- | -------------------------------- | -------------- |
| `plan_estimate_viewed` | `/calculator` shows a total (client)                    | `plan`, `listings`, `amount_clp` | Plans          |
| `plan_requested`       | `requestMyPlan` upserts `requested` (server)            | `plan`                           | Plan requested |
| `plan_activated`       | An operator sets `active` (server)                      | `plan`                           | Plan active    |
| `plan_cancelled`       | `cancelMyPlan` or an operator sets `cancelled` (server) | `plan`                           | Churn          |
| `channel_connected`    | A listing gets an owner (`listing_assignments`, server) | `provider`                       | Connected      |
| `checkin_submitted`    | A guest submits the check-in form (server)              | `property_id`                    | Operations     |

Guidance: keep one event per real action. `plan_requested` and `plan_activated`
are two events, because two different people trigger them.

---

## 3. Key funnels

1. **Visitor → Active plan**
   `$pageview` (`/`) → `$pageview` (`/calculator`) → sign-up (Clerk user
   created; `account_viewed` is the proxy today) → `plan_requested` →
   `plan_activated`. The core conversion funnel. Break it down by `plan` and
   `listings`.

2. **Requested → Connected → Active**
   `plan_requested` → `channel_connected` → `plan_activated`. Measures how fast
   Luxel onboards a host after the request. Today read it from
   `plan_subscriptions.updated_at` and `listing_assignments.created_at`.

3. **Chat → Plan-influenced**
   `chat_opened` / `ai_tool_called{tool=get_airbnb_quote}` → later
   `plan_requested` in the same `session_id` / person. Compares conversion for
   **AI-assisted** and **self-serve** sessions.

Supporting leak analyses: `ai_handoff_to_human` rate (what Lux cannot answer),
`lead_captured` by `source` (recovered demand), and the drop-off between
`plan_requested` and `plan_activated`.

---

## 4. Cohorts & segments

- **By listing count** — one listing, 2–5, small portfolios. Drives the sales
  conversation and the plan mix.
- **By plan** — `fixed` vs `hybrid` vs `commission`: revenue and churn.
- **AI-assisted vs self-serve** — sessions that used Lux vs those that did not,
  compared on plan requests.
- **Active vs requested** — hosts with an `active` plan vs hosts still waiting.
- **By comuna** — occupancy and revenue per comuna, from the property mirror.

---

## 5. KPIs / North-Star tie-in & dashboards

The North Star and its input metrics are defined in [`GOAL.md`](./GOAL.md) §5.
The operator panel (`apps/admin`) reads the in-house store directly: traffic,
daily events, event counts, leads and sessions (`converted` = the session
reached `/account`).

Dashboards to build:

1. **Acquisition funnel** — Visitor → Active plan with per-stage conversion,
   sliced by plan and listing count.
2. **MRR** — `planMonthlyCost(plan, revenue)` summed over active
   `plan_subscriptions`. Fixed fees today; revenue share once the revenue mirror
   exists.
3. **Occupancy & ADR** — from the Hospitable calendar (`calendar_blocks`), per
   listing and per comuna.
4. **Operations health** — AI answer rate (`guest_messages.source = 'ai'` vs
   `needs_host` threads), check-in completion (`checkins.status`), cleaning
   confirmation (`cleanings.crew_confirmed_at`).
5. **Concierge impact** — AI-assisted vs self-serve conversion;
   `ai_tool_called` by `tool`; `ai_handoff_to_human` rate.

---

## 6. Data governance

- **PII.** Email, phone and `full_name` live in `customers`. Property addresses
  and access data live in `properties` and `property_access`. Guest identity
  documents live encrypted in `checkin_identity` (`LUXEL_PII_KEY`) and are nulled
  90 days after departure. All of it sits under Supabase RLS. **Do not send raw
  PII to PostHog.** Identify persons by a stable id (Clerk user id). Send
  `commune` for geo analysis, never the street address. Chat and guest-message
  bodies are not forwarded to analytics; only metadata like `tool` and
  `session_id`.
- **Retention.** Set a defined retention window on raw analytics events in
  PostHog. The authoritative business record (`customers`, `properties`,
  `plan_subscriptions`, `checkins`, `cleanings`) is Supabase.
- **Server-side capture for trustworthy funnel steps.** `plan_*`,
  `channel_connected`, `checkin_submitted`, `lead_captured` and the `ai_*`
  events are captured server-side with `capture()` or `recordEvent()`, keyed by
  the person's Clerk user id (or the session id when signed out). Client-only
  capture is unreliable (ad-blockers, tab closes, spoofing). Client events
  (`$pageview`, `chat_opened`, `cta_clicked`, `account_viewed`,
  `plan_estimate_viewed`) are fine from the browser.

---

## 7. Instrumentation map

Each event and the file that emits it. Paths are relative to the repo root.

| Event                 | Emit from                                                                                                                 | Client / Server |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `$pageview`           | `apps/web/src/components/analytics/track-view.tsx` (`PostHogPageview`), mounted in `apps/web/src/app/[locale]/layout.tsx` | Client          |
| `chat_opened`         | `apps/web/src/components/chat/chat-widget.tsx` (open toggle)                                                              | Client          |
| `chat_message_sent`   | `apps/web/src/app/api/chat/route.ts`; `apps/web/src/app/api/chat/human/route.ts` (`mode: 'human'`)                        | Server          |
| `ai_tool_called`      | `apps/web/src/app/api/chat/route.ts` (tool loop, per tool execution)                                                      | Server          |
| `ai_handoff_to_human` | `apps/web/src/app/api/chat/route.ts` (when a tool result sets `handoff`)                                                  | Server          |
| `cta_clicked`         | `apps/web/src/components/chat/chat-widget.tsx` (Airbnb quote and link cards)                                              | Client          |
| `lead_captured`       | `apps/web/src/lib/leads.ts` (`createLead`, after insert)                                                                  | Server          |
| `account_viewed`      | `apps/web/src/app/[locale]/(site)/account/page.tsx` (`<TrackView event="account_viewed" />`)                              | Client          |

Planned emit points: `plan_estimate_viewed` from
`apps/web/src/app/[locale]/(site)/calculator/plan-comparison.tsx`; `plan_requested`
and `plan_cancelled` from
`apps/web/src/app/[locale]/(site)/properties/plan-actions.ts`; `plan_activated`
from the operator action once it exists in `apps/admin`; `channel_connected`
from `apps/web/src/lib/channels/auto-assign.ts` and the `/admin/listings`
assignment actions; `checkin_submitted` from
`apps/web/src/app/[locale]/checkin/[token]/actions.ts`.
