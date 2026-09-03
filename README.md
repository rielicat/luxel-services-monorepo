# Servicios Luxel — Monorepo

Servicios Luxel manages Airbnb listings in Chile end to end. The listing pays
the host; Luxel coordinates the people. A host asks for the plan and grants
Luxel access to the listing in Hospitable. There is one plan: 12% of the booking
revenue, IVA included, per listing per month. Luxel runs dynamic pricing, guest
replies 24/7, cleaning and laundry between stays, inventory and small repairs. The app mirrors the listings and reservations. A
Hospitable message rule sends the guest the check-in link; the check-in page
renders in `es`, `en`, or `pt`. **Lux**, the AI concierge (OpenAI
`gpt-4o-mini`), answers guest messages from the property's own data. It hands off
to a Luxel human when it cannot answer. Conserjes and the cleaning crew get
WhatsApp templates from Luxel. Airbnb pays the host, and Luxel invoices the fee
at the end of the month with a report.

## Strategy & design docs

The founding strategy, brand system, AI design, and analytics plan live in
[`docs/`](docs/):

| Doc                                                                      | What's inside                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [`docs/GOAL.md`](docs/GOAL.md)                                           | Mission, vision, north star, value proposition, host journey, the plan, KPIs       |
| [`docs/BRAND.md`](docs/BRAND.md)                                         | Brand identity, "Fresh Teal + Lime" design system, asset specs                     |
| [`docs/AI.md`](docs/AI.md)                                               | The "Lux" concierge and the guest-reply pipeline — architecture, tools, guardrails |
| [`docs/METRICS.md`](docs/METRICS.md)                                     | Event taxonomy, plan funnel, cohorts, instrumentation map                          |
| [`docs/ENV.md`](docs/ENV.md)                                             | Every environment variable, where it lives, what breaks without it                 |
| [`docs/DEPLOY.md`](docs/DEPLOY.md)                                       | Production setup: Vercel projects, external accounts, CI                           |
| [`docs/channel-provider-decision.md`](docs/channel-provider-decision.md) | Why Hospitable, and what a provider change costs                                   |

## Layout

```
luxel-services-monorepo/
├── apps/
│   ├── web/                  # Next.js 15 customer app (App Router) → Vercel
│   └── admin/                # Next.js 15 operator app (metrics/leads/telemetry) → Vercel
├── workers/
│   └── whatsapp/             # Cloudflare Worker `luxel-whatsapp-webhook` — WhatsApp Cloud API
├── packages/
│   ├── shared/               # i18n catalogs, WhatsApp template kinds, constants
│   └── config/               # ESLint/TS/Tailwind presets
├── infra/
│   ├── cloudflare/           # Pulumi (TS) IaC — DNS + Email Routing, R2 state
│   └── vercel/               # Pulumi (TS) IaC — Vercel projects (web adopted, admin created), CI-driven
├── supabase/                 # SQL migrations + local config
└── .github/workflows/        # CI, DB migrations, infra
```

## Stack

| Concern         | Tool                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| Hosting (web)   | Vercel                                                                    |
| Hosting (edge)  | Cloudflare (DNS, Workers)                                                 |
| Infrastructure  | Pulumi (TS): `infra/cloudflare` (zone), `infra/vercel` (projects)         |
| Auth            | Clerk                                                                     |
| Database        | Supabase (Postgres + RLS); the server uses the secret key                 |
| Channel (PMS)   | Hospitable — plugin behind `apps/web/src/lib/channels/registry.ts`        |
| AI concierge    | OpenAI (`gpt-5.6-terra`, pinned in `lib/ai/client.ts`)                    |
| Email           | Resend                                                                    |
| Dynamic pricing | PriceLabs (part of the plan)                                              |
| Messaging       | WhatsApp Business Cloud API, through the worker `luxel-whatsapp-webhook`  |
| Monitoring      | In-house event store + `apps/admin` dashboard (Sentry + PostHog optional) |
| Source control  | GitHub                                                                    |

## Getting started

```bash
# 1. Install
corepack enable
pnpm install

# 2. Configure env vars
cp .env.example apps/web/.env.local
# fill in keys

# 3. Local Supabase (Docker required)
pnpm supabase:start
# applies supabase/migrations/*

# 4. Dev server
pnpm dev
```

## Workspace scripts

| Command          | Description                          |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | Run all apps in dev (Turbo)          |
| `pnpm build`     | Build all packages and apps          |
| `pnpm lint`      | Lint everything                      |
| `pnpm typecheck` | Typecheck all packages               |
| `pnpm test`      | Run all unit/integration tests       |
| `pnpm format`    | Prettier --write across the monorepo |

## i18n

Site copy is es-CL. All site strings live in
[`packages/shared/src/i18n/es-CL.json`](packages/shared/src/i18n/es-CL.json).
Never hardcode strings in components. Put each label in the catalog under a
namespace (`landing.*`, `account.*`, etc.).

The guest check-in page is the one exception. It renders in the guest's
language: `es`, `en`, or `pt`. `checkin.en.json` and `checkin.pt.json` carry the
same key set as the `checkin` namespace of `es-CL.json`. The compiler checks that
key set in `packages/shared/src/i18n/index.ts`. A missing key is a build error.

## In-house monitoring (owned data)

**Capture lives in `apps/web`. The dashboard is a separate app (`apps/admin`).**

The customer app captures every meaningful action into our own Supabase table
(`analytics_events`). The client uses `track()` (`sendBeacon` → `/api/events`).
The server uses `capture()`. Traffic and funnel metrics do not depend on PostHog.
Unconverted contact intent (chat→human) is stored as `leads`. PostHog is an
optional external mirror.

The operator app [`apps/admin`](apps/admin) is a distinct Next.js site (port
3001). It reads that data with the Supabase secret key and Clerk auth. Pages:
**Panel** (traffic KPIs, daily event chart, event counts, lead counts), **Leads**
(inbox with status management), **Sesiones** (session records + per-session
journey; `converted` marks a session that reached `/account`), **Telemetría**
(raw filterable event explorer). Heavy aggregation runs in SQL (`admin_traffic`
/ `admin_event_counts` / `admin_daily_events` / `admin_sessions`). Access is gated
by Clerk organization membership (`LUXEL_ADMIN_ORG_ID` or `LUXEL_ADMIN_ORG_SLUG`,
set in `infra/vercel/admin.ts`; unset = locked). Run it with
`pnpm --filter @luxel/admin dev`.

The `/admin` pages inside `apps/web` use a different gate. The Clerk user needs
`publicMetadata.role = "admin"` (`apps/web/src/lib/auth/admin.ts`). They assign
imported listings to hosts (`/admin/listings`) and show sync diagnostics
(`/admin/debug`).

## External setup (one-time, owned by the operator)

These cannot be unblocked by writing more code:

- [ ] Register `serviciosluxel.cl`
- [ ] Create projects: Supabase, Clerk, Vercel, Cloudflare, Resend. PostHog and
      Sentry are optional
- [ ] In Clerk, set `publicMetadata.role = "admin"` on each site operator. Create
      the operator organization for `apps/admin` and add staff. Keep
      Organizations optional in the instance
- [ ] Connect the central Hospitable account. Set `PROVIDER_API_KEY`
- [ ] Register `https://<prod-host>/api/channels/hospitable` as the Hospitable
      webhook (Apps > Webhooks). No secret: the route authorises by source IP.
      See [`docs/ENV.md`](docs/ENV.md) § Inbound webhook access
- [ ] Author the time-based guest messages as Hospitable message rules. See
      [`docs/ENV.md`](docs/ENV.md) § Scheduled guest messages
- [ ] Add the Luxel crew in Hospitable → Operations → Teammates, each with a
      phone number. Services Cleaning or Laundry make the cleaning crew;
      Concierge, Check-in or Check-out make the conserjes. The app mirrors them;
      it has no contact form and hosts never see them
- [ ] Set `RESEND_API_KEY` and `RESEND_FROM`. Set `PRICELABS_API_KEY` for dynamic
      pricing
- [ ] Verify a Meta Business account → enable WhatsApp Cloud API → add a phone
      number → deploy `workers/whatsapp`
- [ ] Get the two WhatsApp templates approved: `luxel_conserje_registro` and
      `luxel_aseo_confirmacion`. Bodies in [`docs/ENV.md`](docs/ENV.md)
      § WhatsApp to the crew
- [ ] Set the GitHub repo secrets listed in [`docs/ENV.md`](docs/ENV.md)
      § GitHub

## License

Private — © Servicios Luxel.
