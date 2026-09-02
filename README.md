# Servicios Luxel — Monorepo

Servicios Luxel automates short-term-rental hosting in Santiago. A host connects
a Hospitable account. The app mirrors the listings and reservations. At booking,
it sends the guest a check-in link in the guest's language. The check-in page
renders in `es`, `en`, or `pt`. **Lux**, the AI concierge (OpenAI `gpt-4o-mini`),
answers guest messages from the property's own data. It hands off to the host
when it cannot answer. Conserjes and the cleaning crew get WhatsApp templates.
Professional cleaning is a second service line.

## Strategy & design docs

The founding strategy, brand system, AI design, and analytics plan live in
[`docs/`](docs/):

| Doc                                                                      | What's inside                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [`docs/GOAL.md`](docs/GOAL.md)                                           | North-star goal, user journey, unit economics, roadmap, KPIs                       |
| [`docs/BRAND.md`](docs/BRAND.md)                                         | Brand identity, "Fresh Teal + Lime" design system, asset-generation prompts        |
| [`docs/AI.md`](docs/AI.md)                                               | The "Lux" concierge and the guest-reply pipeline — architecture, tools, guardrails |
| [`docs/METRICS.md`](docs/METRICS.md)                                     | Event taxonomy, funnels, cohorts, instrumentation map                              |
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
│   ├── shared/               # i18n catalogs, Zod schemas, shared types
│   ├── pricing/              # Pure pricing engine (unit-tested)
│   └── config/               # ESLint/TS/Tailwind presets
├── infra/
│   ├── cloudflare/           # Pulumi (TS) IaC — DNS + Email Routing, R2 state
│   └── vercel/               # Pulumi (TS) IaC — Vercel projects (web adopted, admin created), CI-driven
├── supabase/                 # SQL migrations + seed + local config
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
| AI concierge    | OpenAI (`gpt-4o-mini`, cost-optimized; `OPENAI_MODEL` override)           |
| Email           | Resend                                                                    |
| Dynamic pricing | PriceLabs                                                                 |
| Payments        | MercadoPago (primary CL) + Stripe + Transbank (Webpay Plus)               |
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
# applies supabase/migrations/* and supabase/seed.sql

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
The server uses `capture()`. Traffic, funnel, and revenue metrics do not depend
on PostHog. Unconverted contact intent (out-of-area, chat→human) is stored as
`leads`. PostHog is an optional external mirror.

The operator app [`apps/admin`](apps/admin) is a distinct Next.js site (port
3001). It reads that data with the Supabase secret key and Clerk auth. Pages:
**Panel** (KPIs, conversion funnel, traffic chart), **Leads** (inbox with status
management), **Sesiones** (session records + per-session journey), **Telemetría**
(raw filterable event explorer). Heavy aggregation runs in SQL (`admin_traffic`
/ `admin_event_counts` / `admin_daily_events` / `admin_sessions`). Access is gated
by Clerk organization membership (`LUXEL_ADMIN_ORG_ID` or `LUXEL_ADMIN_ORG_SLUG`,
set in `infra/vercel/admin.ts`; unset = locked). Run it with
`pnpm --filter @luxel/admin dev`.

The `/admin` pages inside `apps/web` use a different gate. The Clerk user needs
`publicMetadata.role = "admin"` (`apps/web/src/lib/auth/admin.ts`).

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
- [ ] Set `RESEND_API_KEY` and `RESEND_FROM`. Optional: `PRICELABS_API_KEY`
- [ ] Verify a Meta Business account → enable WhatsApp Cloud API → add a phone
      number → deploy `workers/whatsapp`
- [ ] Get the two WhatsApp templates approved: `luxel_conserje_llegada` and
      `luxel_aseo_nueva_reserva`. Bodies in [`docs/ENV.md`](docs/ENV.md)
      § WhatsApp to the crew
- [ ] Open merchant accounts (CLP): MercadoPago, Stripe, Transbank
- [ ] Set the GitHub repo secrets listed in [`docs/ENV.md`](docs/ENV.md)
      § GitHub

## License

Private — © Servicios Luxel.
