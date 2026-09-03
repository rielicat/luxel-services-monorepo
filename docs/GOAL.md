# Servicios Luxel — North-Star Goal & Product Strategy

> Strategy document for the Airbnb full-management service. Locale: **es-CL**
> (Región Metropolitana, Santiago). Prose is English; example copy is Spanish.

---

## 1. North Star

> **Become the default operator for Airbnb listings in Santiago — measured by
> the listings under an active Luxel plan and the booking revenue those listings
> produce each month.**

Two numbers matter. **Active managed listings** counts the listings whose owner
has a `plan_subscriptions` row in status `active`. **Monthly managed revenue**
sums the booking revenue of those listings in the month. The first number shows
growth. The second shows the health of each listing. Luxel bills 12% of that
revenue, so the second number is also the revenue base.

---

## 2. Value proposition & target hosts

### Value proposition

**"Tu Airbnb, administrado por completo."** A host hands the listing to Luxel
and receives the income and a monthly report. Luxel does the work:

- **Precios dinámicos** — nightly rates follow demand, season and competition
  (PriceLabs, included in the plan).
- **Huéspedes 24/7** — Lux answers in the Airbnb thread from the listing's own
  data. Luxel humans take over when Lux cannot answer.
- **Aseo y lavandería** — every imported check-out schedules a cleaning. The crew
  confirms by WhatsApp.
- **Resolución de conflictos** — claims, damages and Airbnb disputes.
- **Inventario y reposición** — amenities, linen and basics stay complete.
- **Reparaciones menores** and **puesta a punto** — furnishing and preparation
  when a unit is not ready to list.
- **Check-in** — each guest registers through a link in their language. The
  conserje receives the guest list by WhatsApp.

The host keeps the calendar (blocked dates) and the income. Airbnb pays the host
directly. Luxel invoices the plan at the end of the month.

### Target hosts

| Segment              | Who                                                                              | Job-to-be-done                                                         |
| -------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **One listing**      | An owner with one apartment in Providencia, Las Condes, Ñuñoa or Santiago Centro | "Earn from my unit without answering guests or coordinating cleaners." |
| **2–5 listings**     | An investor or a family with several units                                       | "Run all units with one operator and one monthly report."              |
| **Small portfolios** | An administrator who wants to keep the clients and outsource the operation       | "Keep the income, drop the operations."                                |

---

## 3. Host journey

Each stage lists the surface in `apps/web`, the job-to-be-done and the metric.

| Stage                     | Surface                                                                                           | Job-to-be-done                               | Metric                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| **1. Landing**            | `/` (hero, seven services, gallery, how it works, the price, FAQ) and `/services/airbnb`          | "Understand what Luxel does for my listing." | `$pageview` on `/` → `/calculator` rate        |
| **2. Price**              | `/calculator` (monthly revenue slider, listings stepper, the fee and what the host keeps)         | "See what the service costs me."             | `/calculator` → sign-up rate                   |
| **3. Sign-up**            | `/sign-up` (Clerk)                                                                                | "Create my account."                         | new customers                                  |
| **4. Plan request**       | `/properties` plan bar → `requestMyPlan` (status `requested`)                                     | "Ask for the plan."                          | `plan_subscriptions` in `requested`            |
| **5. Hospitable connect** | The host grants Luxel access in Hospitable. An operator assigns the listing at `/admin/listings`. | "Connect my listing."                        | listings with an owner                         |
| **6. Luxel operates**     | Sync, check-in links, AI replies, cleanings, crew and conserje WhatsApp                           | "Nothing to do."                             | occupancy, AI answer rate, cleanings confirmed |
| **7. Monthly report**     | Luxel invoices the plan and sends the report. Both are manual today.                              | "See what I earned and what I paid."         | active plans, churn                            |

A Luxel operator sets the plan to `active` after the first conversation. There
is no self-serve activation and no trial.

### Concierge overlay

Lux, the site chat, works across stages 1–4. Its tools are `get_airbnb_quote`
(the fee for a monthly revenue), `get_host_status` (real data for a signed-in
host), `share_links` (buttons to real routes) and `escalate_to_human`
(WhatsApp). See [`AI.md`](./AI.md).

---

## 4. The plan & unit economics

There is one plan. The constant lives in `packages/shared/src/plan-pricing.ts`.

| Plan key     | Name       | Price                                 |
| ------------ | ---------- | ------------------------------------- |
| `commission` | Plan Luxel | 12% of the booking revenue, per month |

The price is per listing, per month, IVA included. Luxel earns only when the
host earns. A month without bookings costs the host nothing. Worked example, one
listing with 1.750.000 CLP of monthly booking revenue (the managed unit in
Providencia bills about that at half occupancy): the fee is 210.000 CLP. At
600.000 CLP the fee is 72.000 CLP. The `/calculator` page turns a monthly
revenue into that fee and shows what the host keeps. It compares nothing,
because there is nothing to compare.

The guest pays the cleaning through the listing's cleaning fee. Billing is
off-platform today: Airbnb pays the host, and Luxel invoices at the end of the
month. Airbnb co-host payout splitting is not configured, so no copy may say
that Airbnb pays Luxel. The revenue figure comes from the Hospitable calendar.

---

## 5. Success metrics

| Metric                      | Definition                                                  | Source                                            |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| **Active managed listings** | properties whose owner has an `active` plan                 | `plan_subscriptions` + `properties`               |
| **Monthly managed revenue** | booking revenue of active listings in the month             | Hospitable calendar (`listHospitableCalendar`)    |
| **Occupancy / ADR**         | nights booked / nights available; revenue per booked night  | Hospitable calendar                               |
| **AI answer rate**          | guest messages answered by Lux / all inbound guest messages | `guest_messages` (`source: 'ai'`) vs `needs_host` |
| **Check-in completion**     | check-ins `submitted` or `notified` / reservations          | `checkins`                                        |
| **Cleaning confirmation**   | cleanings with `crew_confirmed_at` / scheduled cleanings    | `cleanings`                                       |
| **Plan funnel**             | landing → `/calculator` → sign-up → `requested` → `active`  | analytics events + `plan_subscriptions`           |
| **Churn**                   | plans moved to `cancelled` / active base                    | `plan_subscriptions`                              |

See [`METRICS.md`](./METRICS.md) for the event taxonomy.

---

## 6. Roadmap

### Now — full management, one city

The landing, the price page and the host mirror ship. Luxel operates with
Hospitable, PriceLabs, the WhatsApp worker and `apps/admin`.

### Next — operations tooling

- A Luxel-side crew and cleanings view in `apps/admin` (crew confirmations per
  cleaning).
- Plan activation from `apps/admin` instead of SQL.
- A monthly report generated from the calendar data.
- A revenue mirror, so the 12% invoice comes from data.
- Airbnb co-host payout splitting, if an operator sets it up. Until then Luxel
  invoices off-platform.

### Later — growth

- Host referrals.
- Occupancy proof and Airbnb review quality as marketing signals.
- A second city once the operation is repeatable.
