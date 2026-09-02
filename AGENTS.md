# AGENTS.md

How to work in this repository. Human docs: [`README.md`](README.md),
[`docs/DEPLOY.md`](docs/DEPLOY.md), [`docs/ENV.md`](docs/ENV.md).

## Prose

Write plans, docs and PR descriptions in ASD-STE100 Simplified Technical English:
one idea per sentence, active voice, present tense, one term per concept, sentences
under 20 words. Product copy stays `es-CL` and follows [`docs/BRAND.md`](docs/BRAND.md).

## Project

**Servicios Luxel** automates short-term-rental hosting in Santiago, Chile. Hosts
connect their Hospitable account; the app mirrors listings and reservations, sends
each guest a check-in link, renders the check-in page in the guest's language
(es/en/pt), answers guest messages with AI ("Lux"), and tells conserjes and the
cleaning crew what they need over WhatsApp. Professional cleaning is a secondary
service line. pnpm + Turborepo monorepo: Next.js 15 apps, a Cloudflare Worker,
shared packages, Supabase, Pulumi IaC.

## Toolchain

`pnpm` on `PATH` is a broken Node 16 corepack shim. Always run:

```bash
PATH="/opt/homebrew/bin:$PATH" npx --yes pnpm@11.0.9 <args>
```

Node 22 (`.nvmrc`). Husky's pre-commit runs the broken shim: run the checks by hand,
then `git commit --no-verify`.

## Commands

| Task     | Command                                                         |
| -------- | --------------------------------------------------------------- |
| Install  | `pnpm install`                                                  |
| Dev      | `pnpm dev` or `pnpm --filter @luxel/web dev`                    |
| Checks   | `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test` |
| Build    | `pnpm build`                                                    |
| Format   | `pnpm format`                                                   |
| Supabase | `pnpm supabase:start` / `:stop` / `:reset` / `:diff`            |

Web tests need local Supabase and `apps/web/.env.local` sourced. Scope with
`--filter <package>`.

## Layout

```
apps/web         @luxel/web              customer app → Vercel (serviciosluxel.cl)
apps/admin       @luxel/admin            operator panel → Vercel
workers/whatsapp @luxel/whatsapp-worker  Cloudflare Worker: WhatsApp webhook + /send
packages/shared  @luxel/shared           i18n catalogs, Zod schemas, shared types
packages/pricing @luxel/pricing          pure pricing engine
packages/config  @luxel/config           ESLint / TS / Tailwind presets
infra/cloudflare @luxel/infra-cloudflare Pulumi: DNS + Email Routing (R2 state)
infra/vercel     @luxel/infra-vercel     Pulumi: Vercel projects, CI-driven
supabase/        migrations + seed + local config
```

## Stack

| Concern       | Tool                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Hosting       | Vercel (one project per app root)                                                                           |
| Edge          | Cloudflare Workers, DNS, Email Routing                                                                      |
| Auth          | Clerk. Web `/admin` = Clerk `admin` role; `apps/admin` = Clerk org membership (`LUXEL_ADMIN_ORG_ID`/`SLUG`) |
| Database      | Supabase Postgres + RLS                                                                                     |
| Channel (PMS) | Hospitable, as a plugin behind `apps/web/src/lib/channels/registry.ts`                                      |
| Messaging     | WhatsApp Cloud API (worker), Resend email fallback                                                          |
| AI            | OpenAI `gpt-4o-mini` (`OPENAI_MODEL` override)                                                              |
| Pricing       | PriceLabs (optional add-on)                                                                                 |
| Payments      | MercadoPago (CLP), Stripe, Transbank                                                                        |
| Analytics     | In-house `analytics_events` + `leads`                                                                       |

## Conventions

- **No code comments.** Source carries no comments; the code and the tests explain
  themselves. Only tool directives stay (`eslint-disable`, `@ts-expect-error`).
- **i18n.** No hardcoded user-facing strings. Site copy lives in
  `packages/shared/src/i18n/es-CL.json`; the guest check-in page also has
  `checkin.en.json` and `checkin.pt.json` with the same key set. Locale prefix is
  `never`.
- **Routes are English.** `/calculator`, `/book`, `/account`,
  `/properties`, `/checkin/[token]`. Never a Spanish path segment.
- **TypeScript strict.** Extend `@luxel/config/tsconfig/{next,library,base}.json`.
  `infra/cloudflare` is standalone CommonJS for Pulumi.
- **Commits.** Conventional Commits. End the message with
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Branch off `main`.
- **Before pushing** run format:check, typecheck, lint, test, build. CI enforces
  exactly that.

## Data and security rules

- Properties are an **import-only mirror** of Hospitable. There is no manual
  property create or edit path. Do not add one.
- `property_contacts` (conserjes, cleaning crew) is an **import-only mirror** of
  Hospitable Teammates, rewritten on every sync pass (`mirrorTeammates`). Service
  Cleaning or Laundry → role `cleaning`; Concierge, Check-in or Check-out → role
  `concierge`; all services → both; Owner, Manager, Maintenance → no row. The UI
  links to Hospitable → Equipo. Do not add a manual contact form.
- Webhook payloads are **identifiers only**. Every value acted on is fetched back
  from Hospitable with our credential (`app/api/channels/[provider]/route.ts`).
  Webhook auth is Hospitable's source-IP range, never a secret in the URL.
- **No cron.** Time-based guest messages (reminder, check-in details at T-3,
  check-out, review) are Hospitable message rules authored in its dashboard.
  Code handles events only.
- Door codes and wifi passwords live in Hospitable custom codes and in
  `property_access`; the AI redacts them (`lib/ai/redact.ts`). Never log them.
  The guest receives the door code only through Hospitable's T-3 message rule.
  Never show it on the check-in page or send it from our code.
- Guest documents are encrypted with `LUXEL_PII_KEY`, nulled 90 days after
  departure by the sync pass, and reach conserjes only through the approved
  WhatsApp template.
- Secrets never enter the repo. `.env*` files stay untracked. Operators set
  Vercel vars and `wrangler secret put`.

## Temporary: remove before public launch

Stealth gate: in production the middleware rewrites every page to
`app/[locale]/gate` until the `luxel_gate` cookie exists. Typing `0612` unlocks.
To lift it, delete `apps/web/src/app/[locale]/gate/` and the `withStealthGate`
block in `apps/web/src/middleware.ts`.

## Product constraints (user-set)

- Airbnb management leads in nav, homepage and service picker. No "primary" badge.
- Marketing nav: `Servicios ▾` (Administración Airbnb, Plan de Aseo) · `Precios`
  (`/calculator`) · `Nosotros` (`/about`). One `Ingresar` button. No header CTA.
- Service icons share one color (`bg-primary/10 text-primary`).
- Never say "m²" or "metros cuadrados" in marketing copy. Say "tu espacio".
- Airbnb pricing is two flat tiers per listing per month
  (`apps/web/src/lib/plan-pricing.ts`): 39.900 Esencial, 99.900 Con respaldo
  humano. No per-booking commission.
- Competitor reference: `airhost.cl`, `airhostchile.com`. Our angle: same outcomes,
  automation, flat fee.

## CI and deployment

`.github/workflows/ci.yml`: frozen install → format:check → typecheck → lint →
test → build. `db-migrate.yml` applies migrations to prod Supabase.
`infra.yml` / `infra-vercel.yml` run Pulumi. Vercel deploys `apps/web` and
`apps/admin` from their roots; the worker deploys with `wrangler deploy`.
Details and env vars: [`docs/DEPLOY.md`](docs/DEPLOY.md), [`docs/ENV.md`](docs/ENV.md).

Open follow-ups that need operator credentials: Clerk production instance (prod
runs the dev instance), Meta WhatsApp go-live (portfolio, number, templates).

## Gotchas

- Supabase local image pulls can 403 from `public.ecr.aws`; mirror from Docker Hub.
- Clerk **keyless** mode breaks next-intl routing. Use real dev keys and set
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `..._SIGN_UP_URL=/sign-up` so auth
  stays on localhost. Test user: `you+clerk_test@example.com`, OTP `424242`.
- Keep Clerk **Organizations optional** on the instance. Admin gating is
  app-level.
- Supabase free tier auto-pauses. A paused project looks deleted and blocks prod
  migrations while CI stays green.
- Vercel Hobby rejects sub-daily crons in `vercel.json` and silently blocks every
  deploy. Do not add a `vercel.json` cron.
- Playwright e2e (`apps/web/e2e`) runs against the dev server; CI needs
  `E2E_SKIP_AUTH`.
- Cloudflare and Vercel IaC adoption is import-based. Run `gen-imports`, then
  `pulumi preview`, and confirm no changes before `pulumi up`.
