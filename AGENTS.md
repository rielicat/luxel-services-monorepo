# AGENTS.md

Guidance for AI coding agents working in this repository. Human-oriented docs
live in [`README.md`](README.md) and [`docs/DEPLOY.md`](docs/DEPLOY.md); this file
is the practical "how to work here" for agents.

## Project

**Servicios Luxel** — a short-term-rental (Airbnb) automation platform for Chile
(`es-CL`), with professional cleaning as a second service line. A pnpm + Turborepo
monorepo of Next.js 15 (App Router) apps plus a Cloudflare Worker, shared packages,
Supabase, and Pulumi IaC. **Airbnb management is the primary service**; cleaning is
secondary. Core journeys: land → pick a service → quote → start. An AI concierge
("Lux") assists throughout.

## ⚠️ Toolchain: use the pinned pnpm

The `pnpm` on `PATH` is a **broken Node-16 corepack shim** (fails with
`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`). Always invoke pnpm as:

```bash
PATH="/opt/homebrew/bin:$PATH" npx --yes pnpm@11.0.9 <args>
```

- Node **22** (`.nvmrc`; `engines.node >=22.13.0`), pnpm **11.0.9**.
- Local commits: `husky` pre-commit runs the broken shim, so hand-run the checks
  and commit with `git commit --no-verify` (see Conventions).

## Commands

Run from the repo root (prefix each with the pnpm invocation above):

| Task                 | Command                                                 |
| -------------------- | ------------------------------------------------------- |
| Install              | `pnpm install`                                          |
| Dev (all)            | `pnpm dev` — or one app: `pnpm --filter @luxel/web dev` |
| Typecheck            | `pnpm typecheck` (Turbo, all packages)                  |
| Lint                 | `pnpm lint`                                             |
| Test                 | `pnpm test` (Vitest; pricing engine is the main suite)  |
| Format check / write | `pnpm format:check` / `pnpm format` (Prettier)          |
| Build                | `pnpm build`                                            |
| Supabase (local)     | `pnpm supabase:start` / `:stop` / `:reset` / `:diff`    |

Scope any command to a package with `--filter <name>` (e.g.
`--filter @luxel/infra-cloudflare typecheck`).

## Layout

```
apps/
  web/          @luxel/web    — customer Next.js app → Vercel (serviciosluxel.cl)
  admin/        @luxel/admin  — operator panel (metrics/leads/telemetry) → Vercel (port 3001 locally)
workers/
  whatsapp/     @luxel/whatsapp-worker — Cloudflare Worker (WhatsApp webhook), deployed via wrangler
packages/
  shared/       @luxel/shared  — i18n catalog, Zod schemas, shared types
  pricing/      @luxel/pricing — pure pricing engine (unit-tested)
  config/       @luxel/config  — ESLint/TS/Tailwind presets
infra/
  cloudflare/   @luxel/infra-cloudflare — Pulumi (TS) IaC: DNS + Email Routing (R2 state)
supabase/       SQL migrations + seed + local config
```

## Stack

| Concern               | Tool                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| Hosting (web + admin) | Vercel (one project per app root)                                       |
| Edge / DNS / email    | Cloudflare (Workers + DNS + Email Routing; DNS/email as Pulumi IaC)     |
| Auth                  | Clerk (with a `supabase` JWT template)                                  |
| Database              | Supabase (Postgres + RLS)                                               |
| Payments              | MercadoPago (primary, CLP) + Stripe                                     |
| AI concierge          | OpenAI — `gpt-4o-mini` (cost-optimized; `OPENAI_MODEL` override)        |
| Analytics             | In-house (`analytics_events` + `leads` tables); PostHog/Sentry optional |

## Conventions

- **i18n — no hardcoded user-facing strings.** All copy lives in the single
  catalog `packages/shared/src/i18n/es-CL.json` and is rendered via `next-intl`.
  Locale prefix is `'never'` (clean URLs). Add a key rather than inlining text.
- **Routes are English.** URL path segments are always English, kebab-case —
  `/calculator`, `/book`, `/calendar`, `/account`, `/account/profile`,
  `/sign-in`, `/sign-up` — even though every user-facing string is es-CL. Never
  introduce a Spanish path segment; the UI stays Spanish, the URL stays English.
- **Comments** — only explain the non-obvious _why_ (rationale, gotchas,
  invariants). Don't restate what the code says or narrate steps. Match the
  surrounding file's density.
- **TypeScript** — strict; extend `tsconfig.base.json` (apps/packages use
  `@luxel/config/tsconfig/*`). `infra/cloudflare` is deliberately standalone
  CommonJS for Pulumi's runtime.
- **Commits** — Conventional Commit style; end the message with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Use
  `git commit --no-verify` (husky runs the broken pnpm shim) _after_ running the
  checks manually. Branch off `main` for PRs.
- **Before pushing**, make sure `format:check`, `typecheck`, `lint`, `test`,
  `build` all pass — that's exactly what CI enforces.

## Product & marketing constraints (user-set)

These are locked product decisions — honor them when touching site copy/IA:

- **Airbnb management is the PRIMARY service**, cleaning is secondary. Airbnb
  leads in ordering (nav, homepage, service picker) — but do **not** label it
  "Servicio Principal" or add "primary/flagship" badges in the UI; the emphasis
  is order, not a badge.
- **Marketing nav** (signed-out): `Servicios ▾` (dropdown: Administración
  Airbnb, then Plan de Aseo) · `Precios` (→ `/calculator`) · `Nosotros`
  (→ `/about`), in that order. No "Preguntas" item. Only a **Login** ("Ingresar")
  action button — no "Cotizar" button in the header (quoting lives under the
  `Precios` nav item). Mobile menu mirrors this (no header CTA).
- **Service dropdown/card icons share one color** (`bg-primary/10 text-primary`)
  across both services — never color-code one service differently.
- **Never use "m²" / "metros cuadrados" as a marketing term.** Say **"tu
  espacio"** (your space). The calculator's functional inputs may keep a real
  unit, but marketing copy uses "tu espacio".
- **Airbnb pricing = two flat tiers per listing/mo** (source of truth
  `apps/web/src/lib/plan-pricing.ts`): `AI_PLAN_CLP` = 39.900 (Esencial, full AI
  automation) and `AI_PLAN_HANDOFF_CLP` = 99.900 (Con respaldo humano — AI **plus
  a real team taking over when the AI defers**). No per-booking commission.
- **Competitor reference** for Airbnb-management benefits/positioning:
  `airhost.cl` and `airhostchile.com` (full-service agencies — 24/7 guest comms,
  dynamic pricing, cleaning between stays, check-in, transparent reporting). Our
  angle: the same outcomes via automation + a flat fee, no % commission.

## CI

`.github/workflows/ci.yml` runs on push/PR: `install --frozen-lockfile` →
`format:check` → `typecheck` → `lint` → `test` → `build` (with format-valid stub
env vars; the Clerk publishable key must be _format-valid_ or the admin app's
prerender fails). Keep `pnpm-lock.yaml` committed and frozen-install clean.

## Local development

See the full recipe in `README.md`. Essentials:

- Start Supabase locally (`pnpm supabase:start`), then `db reset` applies
  `supabase/migrations/` + `supabase/seed.sql` (service types, pricing config,
  the Santiago operation point).
- Clerk needs real dev keys for `next-intl` clean-URL routing to work — keyless
  mode drops the rewrite and 404s. Use provisioned keys.
- **Pricing has a fallback:** `apps/web/src/lib/pricing-data.ts` returns
  seed-equivalent defaults when Supabase is empty/unreachable, so quoting works
  even against an unseeded database. Real rows take over once present.

## Deployment

Two Vercel projects (roots `apps/web` and `apps/admin`); the Worker deploys via
`wrangler deploy`; the Cloudflare zone (DNS + Email Routing) is managed by Pulumi
in `infra/cloudflare` (adopt existing records via import — never blind-apply).
Full checklist and required env vars: [`docs/DEPLOY.md`](docs/DEPLOY.md).

Known production follow-ups (need operator credentials): set Clerk **production**
keys (prod currently runs dev keys), seed the prod Supabase, deploy `apps/admin`
as its own Vercel project, set `OPENAI_API_KEY`.

## Gotchas (learned the hard way)

- Broken pnpm shim → always the pinned-pnpm invocation above.
- Supabase local image pulls can 403 from `public.ecr.aws`; mirror from Docker Hub.
- Clerk **keyless** mode breaks next-intl routing (404s) — use real keys.
- **Local auth — don't get stuck on the external Clerk portal.** Protected routes
  redirect to Clerk's hosted account portal (`*.accounts.dev`), which hangs/loops
  against a local server. When developing locally, **fake/bypass Clerk**: sign in
  with a Clerk **test user** (`you+clerk_test@example.com`, any password, OTP
  `424242`) and set `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` +
  `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up` so auth stays on `localhost` (uses the
  in-app `<SignIn/>` pages, not the external hostname). For pages that don't need
  a real user, stub the auth check in dev.
- Admin access is gated by **Clerk organization membership** (`LUXEL_ADMIN_ORG_SLUG`);
  staff are added to the org in Clerk. Locked by default (unset slug = nobody).
- Cloudflare IaC adoption is **import-based** and can touch live DNS/email — run
  `gen-imports` then `LUXEL_CF_ADOPT=1 pulumi up`, and confirm `pulumi preview`
  shows no changes. Never blind-apply.
