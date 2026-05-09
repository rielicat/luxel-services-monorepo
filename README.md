# Servicios Luxel — Monorepo

Cleaning services platform for the Chilean market (es-CL).

## Layout

```
luxel-services-monorepo/
├── apps/
│   └── web/                  # Next.js 15 (App Router) → Vercel
├── workers/
│   └── whatsapp/             # Cloudflare Worker — WhatsApp Cloud API webhook
├── packages/
│   ├── shared/               # i18n catalogs, Zod schemas, shared types
│   ├── pricing/              # Pure pricing engine (unit-tested)
│   └── config/               # ESLint/TS/Tailwind presets
├── supabase/                 # SQL migrations + seed + local config
└── .github/workflows/        # CI
```

## Stack

| Concern        | Tool                                       |
| -------------- | ------------------------------------------ |
| Hosting (web)  | Vercel                                     |
| Hosting (edge) | Cloudflare (DNS, Workers)                  |
| Auth           | Clerk (Supabase JWT template)              |
| Database       | Supabase (Postgres + RLS + Realtime)       |
| Payments       | MercadoPago (primary CL) + Stripe          |
| Messaging      | WhatsApp Business Cloud API                |
| Monitoring     | Sentry + PostHog                           |
| Source control | GitHub                                     |

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

| Command           | Description                              |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | Run all apps in dev (Turbo)              |
| `pnpm build`      | Build all packages and apps              |
| `pnpm lint`       | Lint everything                          |
| `pnpm typecheck`  | Typecheck all packages                   |
| `pnpm test`       | Run all unit/integration tests           |
| `pnpm format`     | Prettier --write across the monorepo     |

## i18n

The only locale today is `es` (es-CL). All user-facing strings live in
[`packages/shared/src/i18n/es-CL.json`](packages/shared/src/i18n/es-CL.json).
Never hardcode strings in components — even one-off labels go in the catalog
under a namespace (`landing.*`, `account.*`, etc.) so adding `en` later is a
single-file addition.

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
