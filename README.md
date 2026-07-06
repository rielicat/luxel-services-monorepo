# Servicios Luxel — Monorepo

Cleaning services platform for the Chilean market (es-CL). Instant square-meter
pricing, online booking + subscriptions, and **Lux** — an AI concierge (Claude)
that quotes, checks coverage/availability, and hands off to a human on WhatsApp.

## Strategy & design docs

The founding strategy, brand system, AI design, and analytics plan live in
[`docs/`](docs/):

| Doc                                  | What's inside                                                               |
| ------------------------------------ | --------------------------------------------------------------------------- |
| [`docs/GOAL.md`](docs/GOAL.md)       | North-star goal, user journey, unit economics, roadmap, KPIs                |
| [`docs/BRAND.md`](docs/BRAND.md)     | Brand identity, "Fresh Teal + Lime" design system, asset-generation prompts |
| [`docs/AI.md`](docs/AI.md)           | The "Lux" concierge — architecture, tools, guardrails, prompt design        |
| [`docs/METRICS.md`](docs/METRICS.md) | Event taxonomy, funnels, cohorts, instrumentation map                       |

## Layout

```
luxel-services-monorepo/
├── apps/
│   ├── web/                  # Next.js 15 customer app (App Router) → Vercel
│   └── admin/                # Next.js 15 operator app (metrics/leads/telemetry) → Vercel
├── workers/
│   └── whatsapp/             # Cloudflare Worker — WhatsApp Cloud API webhook
├── packages/
│   ├── shared/               # i18n catalogs, Zod schemas, shared types
│   ├── pricing/              # Pure pricing engine (unit-tested)
│   └── config/               # ESLint/TS/Tailwind presets
├── infra/
│   └── cloudflare/           # Pulumi (TS) IaC — DNS + Email Routing, R2 state
├── supabase/                 # SQL migrations + seed + local config
└── .github/workflows/        # CI
```

## Stack

| Concern        | Tool                                                                  |
| -------------- | --------------------------------------------------------------------- |
| Hosting (web)  | Vercel                                                                |
| Hosting (edge) | Cloudflare (DNS, Workers)                                             |
| Auth           | Clerk (Supabase JWT template)                                         |
| Database       | Supabase (Postgres + RLS + Realtime)                                  |
| Payments       | MercadoPago (primary CL) + Stripe                                     |
| AI concierge   | Anthropic Claude (`claude-opus-4-8`)                                  |
| Messaging      | WhatsApp Business Cloud API                                           |
| Monitoring     | In-house event store + `/admin` dashboard (Sentry + PostHog optional) |
| Source control | GitHub                                                                |

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

The only locale today is `es` (es-CL). All user-facing strings live in
[`packages/shared/src/i18n/es-CL.json`](packages/shared/src/i18n/es-CL.json).
Never hardcode strings in components — even one-off labels go in the catalog
under a namespace (`landing.*`, `account.*`, etc.) so adding `en` later is a
single-file addition.

## In-house monitoring (owned data)

**Capture lives in `apps/web`; the dashboard is a separate app (`apps/admin`).**

The customer app captures every meaningful action into **our own Supabase**
(`analytics_events`) via `track()` (client, `sendBeacon` → `/api/events`) and
`capture()` (server) — so traffic, funnel, and revenue metrics don't depend on
PostHog or survive-ad-blocker concerns. Unconverted contact intent (out-of-area,
chat→human) is captured as `leads`. PostHog remains an optional external mirror.

The **operator app** [`apps/admin`](apps/admin) (a distinct Next.js site, port
3001, not shipped in the customer bundle) reads that data with the Supabase
service role and Clerk auth. Pages: **Panel** (KPIs, conversion funnel, traffic
chart), **Leads** (inbox with status management), **Sesiones** (session records +
per-session journey), **Telemetría** (raw filterable event explorer). Heavy
aggregation runs in SQL (`admin_traffic` / `admin_event_counts` /
`admin_daily_events` / `admin_sessions`). Access is gated by Clerk organization
membership (`LUXEL_ADMIN_ORG_SLUG`; unset = locked). Run it with
`pnpm --filter @luxel/admin dev`.

## External setup (one-time, owned by the operator)

These cannot be unblocked by writing more code:

- [ ] Register `serviciosluxel.cl`
- [ ] Create projects: Supabase, Clerk, Vercel, Cloudflare, Sentry, PostHog
- [ ] Configure Clerk JWT template named `supabase` with claims
      `{ "role": "authenticated", "aud": "authenticated", "sub": "{{user.id}}" }`
- [ ] Verify a Meta Business account → enable WhatsApp Cloud API → add a phone number
- [ ] Open MercadoPago and Stripe merchant accounts (CLP)
- [ ] Set GitHub repo secrets for CI: `SENTRY_AUTH_TOKEN`, etc.

## License

Private — © Servicios Luxel.
