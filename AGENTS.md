# AGENTS.md

How to work in this repository. Human docs: [`README.md`](README.md),
[`docs/DEPLOY.md`](docs/DEPLOY.md), [`docs/ENV.md`](docs/ENV.md).

Compacted per-section copies of this file live in `docs/`:
[`ARCHITECTURE.md`](docs/ARCHITECTURE.md) (Project, Layout, Stack),
[`CONVENTIONS.md`](docs/CONVENTIONS.md) (Prose, Conventions),
[`SECURITY-RULES.md`](docs/SECURITY-RULES.md) (Data and security rules),
[`PRODUCT-CONSTRAINTS.md`](docs/PRODUCT-CONSTRAINTS.md) (Product constraints,
stealth gate),
[`GOTCHAS.md`](docs/GOTCHAS.md) (Toolchain, Commands, CI, Gotchas). This file
stays the source of truth; update both when a rule changes.

Repo is indexed in `codebase-memory-mcp` as project
`luxel-services-monorepo`. Query it (`search_graph`, `get_architecture`,
`trace_path`) before grepping cold.

## Prose

Write plans, docs and PR descriptions in ASD-STE100 Simplified Technical English:
one idea per sentence, active voice, present tense, one term per concept, sentences
under 20 words. Product copy stays `es-CL` and follows [`docs/BRAND.md`](docs/BRAND.md).

## Project

**Servicios Luxel** manages Airbnb listings in Chile, end to end. The mission is
the host's time: the listing pays the host, and Luxel coordinates the people. A
host signs up, asks for the plan and grants Luxel access to the listing in
Hospitable. There is one plan: 12% of the booking revenue, per listing, per
month. Luxel then runs the whole operation: dynamic pricing, guest replies 24/7
with AI ("Lux") and Luxel humans, cleaning and laundry between stays, conflict
resolution, inventory, small repairs and furnishing. The app mirrors listings
and reservations. It renders the check-in page in the guest's language
(es/en/pt); Hospitable's own "New reservation" rule sends the guest the link. It
tells conserjes and the cleaning crew what they need over WhatsApp. Hosts see
their properties, calendar, revenue and plan. Hosts never see the crew or the
guest messages; those are Luxel operations. pnpm + Turborepo monorepo: Next.js
15 apps, a Cloudflare Worker, shared packages, Supabase, Pulumi IaC.

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
packages/shared  @luxel/shared           i18n catalogs, WhatsApp template kinds, constants
packages/config  @luxel/config           ESLint / TS / Tailwind presets
infra/cloudflare @luxel/infra-cloudflare Pulumi: DNS + Email Routing (R2 state)
infra/vercel     @luxel/infra-vercel     Pulumi: Vercel projects, CI-driven
supabase/        migrations + local config
```

## Stack

| Concern         | Tool                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Hosting         | Vercel (one project per app root)                                                                           |
| Edge            | Cloudflare Workers, DNS, Email Routing                                                                      |
| Auth            | Clerk. Web `/admin` = Clerk `admin` role; `apps/admin` = Clerk org membership (`LUXEL_ADMIN_ORG_ID`/`SLUG`) |
| Database        | Supabase Postgres + RLS                                                                                     |
| Channel (PMS)   | Hospitable, as a plugin behind `apps/web/src/lib/channels/registry.ts`                                      |
| Messaging       | WhatsApp Cloud API (worker), Resend email fallback                                                          |
| AI              | OpenAI `gpt-5.6-terra`, pinned in `lib/ai/client.ts` (no env override)                                      |
| Dynamic pricing | PriceLabs (part of the plan)                                                                                |
| Analytics       | In-house `analytics_events` + `leads`                                                                       |

## Conventions

- **No code comments.** Source carries no comments; the code and the tests explain
  themselves. Only tool directives stay (`eslint-disable`, `@ts-expect-error`).
  The ban covers `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.css` and the SQL
  migrations in `supabase/migrations`. ESLint (`luxel/no-comments`) and
  `pnpm lint:comments` enforce it. A blanket `eslint-disable` is itself an error;
  always name the rules you disable. Only CI workflows, Pulumi stack config,
  `wrangler.toml`, `supabase/config.toml` and `.env.example` keep their operator
  comments.
- **i18n.** No hardcoded user-facing strings. Site copy lives in
  `packages/shared/src/i18n/es-CL.json`; the guest check-in page also has
  `checkin.en.json` and `checkin.pt.json` with the same key set. Locale prefix is
  `never`.
- **Routes are English.** `/calculator`, `/account`, `/properties`,
  `/checkin/[id]`, `/cleaning/confirm/[token]`. Never a Spanish path segment.
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
  `concierge`; all services → both; Owner, Manager, Maintenance → no row. There is
  no host-facing contacts UI. Luxel operators manage teammates in Hospitable →
  Operations → Teammates. Do not add a manual contact form.
- Crew is **Luxel-owned**, not mirrored. `crew_member` (internal or external)
  and `crew_assignment` (member, property, role) are operator-managed in
  `apps/admin` at `/crew`. The sync never touches them. `recipients()` in
  `apps/web/src/lib/crew/index.ts` decides who is notified: assigned crew
  first, the Hospitable teammate mirror only when the assignment reaches
  nobody. Both notifiers call it; neither queries `property_contacts`.
- Cleanings are a **Luxel-run operation**. The sync pass creates one per imported
  checkout (`suggestCleaningsFromCheckouts`), schedules it (`autoConfirmSuggested`)
  and sends the `cleaning_confirm` template to the crew (`lib/cleaning/notify.ts`).
  Hosts have no cleaning controls and no guest inbox. `guest_threads` status
  `needs_host` means "needs a Luxel human". Do not add host-facing crew or inbox
  surfaces.
- Lux replies to guests **behind a review gate**. `properties.ai_reviews` defaults to
  `true`: the pipeline stores the AI reply in `guest_reply_drafts` with status
  `pending` and sends nothing. A Luxel operator reviews it at `/admin/inbox`,
  edits it if needed, and approves it; only then does the message reach the
  guest. An approved text that differs from the draft is stored as `host`, not
  `ai`. `simulateThreadReply` drafts a reply for a thread already on record
  without sending it. `ai_replies` and `ai_reviews` are operator-managed in
  `apps/admin` at `/ai`, one property at a time, over a checkbox selection, or
  over every property at once; there is no
  host-facing switch, and the web inbox only shows the mode. Only one pending
  draft per thread: a newer guest message supersedes the older draft.
- Plans live in `plan_subscriptions`: `plan` is always `commission`, the only
  plan, `status` ∈ `requested | active | cancelled`. The host requests the plan
  (`requestPlan`); a Luxel operator activates it. There is no billing code and no
  checkout. Do not add one.
- Webhook payloads are **identifiers only**. Every value acted on is fetched back
  from Hospitable with our credential (`app/api/channels/[provider]/route.ts`).
  Webhook auth is Hospitable's source-IP range, never a secret in the URL.
- **No guest messages from our code.** Every guest message is a Hospitable rule
  authored in its dashboard: the booking message with the check-in link on "New
  reservation", the reminder, the check-in details at T-3, the check-out message
  and the review request. Our code only mirrors reservations into `checkins`
  rows: the `reservation.created` webhook writes the row at once, before the
  debounced resync, because the Hospitable rule sends the link the moment the
  booking is accepted. There is no cron either; code handles events only.
- Door codes are secret; wifi passwords are not. `accessSecrets` in
  `lib/ai/grounding.ts` feeds only `property_access.keyless_code` to
  `redactSecrets`, so Lux may give a guest the wifi password and never the door
  code. Never log either. The guest receives the door code only through
  Hospitable's T-3 message rule. Never show it on the check-in page or send it
  from our code. The host may write the wifi network and password into the
  property context form; that text reaches Lux.
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

- Airbnb full management is the only service. No service picker, no cleaning-only
  offer, no "primary" badge.
- Marketing nav: `Servicio` (`/#servicio`) · `Precios` (`/calculator`) ·
  `Nosotros` (`/about`). `Servicio` anchors to the home page; there is no separate
  service page. One `Ingresar` button. No dropdown. No header CTA.
- Service icons share one color (`bg-primary/10 text-primary`).
- One plan only (`packages/shared/src/plan-pricing.ts`): 12% of the booking
  revenue, IVA included, per listing per month. Luxel bills monthly,
  off-platform. There is no fixed fee and no other plan. Do not add a second
  plan, a plan picker or a "recomendado" badge. No free trial. The calculator
  turns a monthly revenue into the fee; it compares nothing.
- The commission base is the booking only. The guest cleaning fee is 100% for
  the cleaning crew, and Luxel charges no commission on it. The sync mirrors
  it as `reservation_revenue.cleaning_fee_clp`, and `commissionBaseClp` in
  `apps/web/src/lib/revenue.ts` is the host payout minus that fee. Luxel pays
  the crew against a document — a contract or a boleta de honorarios — so the
  fee is a documented pass-through and not undeclared Luxel revenue.
- **Not true yet.** Airbnb co-host payout splitting is not configured on any
  listing. Airbnb pays the host and Luxel invoices monthly, off-platform. No
  copy may say that Airbnb pays Luxel, deducts our fee or splits the payout.
  An operator must set the split up first, then this line changes.
- Hosts never see the crew or the guest messages. Those are Luxel operations.
- Copy never says "0% comisión", "tarifa plana", "14 días gratis", "prueba
  gratis" or "m²". Voice per [`docs/BRAND.md`](docs/BRAND.md).
- **Copy never names a city.** No city appears in anything a person reads: page
  copy, i18n catalogs, alt text, metadata, emails or WhatsApp templates. "Chile"
  is allowed. A comuna is allowed only as real data about a real unit; for an
  example or a placeholder prefer Providencia, Las Condes or Ñuñoa. This rule
  covers copy only. Keep the timezone string `America/Santiago`, the identifiers
  that carry it (`santiagoToday`, `santiagoMonth`, `todaySantiago`) and the
  address fixtures and seeds exactly as they are.
- Luxel writes as a **partner, not a vendor**. Copy stands on the host's side of
  the table: "nosotros nos encargamos", never "el cliente debe".
- Competitor reference: `airhost.cl`, `airhostchile.com`. Our angle: full
  management, one transparent fee on the booking revenue, monthly report.

## CI and deployment

`.github/workflows/ci.yml`: frozen install → format:check → typecheck → lint →
test → build. `db-migrate.yml` applies migrations to prod Supabase.
`infra.yml` / `infra-vercel.yml` run Pulumi. Vercel deploys `apps/web` and
`apps/admin` from their roots; the worker deploys with `wrangler deploy`.
Details and env vars: [`docs/DEPLOY.md`](docs/DEPLOY.md), [`docs/ENV.md`](docs/ENV.md).

Open follow-ups that need operator credentials: Clerk production instance (prod
runs the dev instance), Meta WhatsApp go-live (portfolio, number, templates).
Open follow-ups in code: plan activation and a crew/cleanings view in `apps/admin`.

## Gotchas

- Supabase local image pulls can 403 from `public.ecr.aws`; mirror from Docker Hub.
- Clerk **keyless** mode breaks next-intl routing. Use real dev keys and set
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `..._SIGN_UP_URL=/sign-up` so auth
  stays on localhost. Test user: `you+clerk_test@example.com`, OTP `424242`.
- Keep Clerk **Organizations optional** on the instance. Admin gating is
  app-level.
- Hospitable's calendar endpoint clamps `start_date` to the first day of the
  running month. A request for an earlier date silently returns the same
  window, so the previous month can only come from the mirrored
  `calendar_blocks`, never from the live calendar. `end_date` is honoured
  past 120 days.
- Supabase free tier auto-pauses. A paused project looks deleted and blocks prod
  migrations while CI stays green.
- Vercel Hobby rejects sub-daily crons in `vercel.json` and silently blocks every
  deploy. Do not add a `vercel.json` cron.
- Playwright e2e (`apps/web/e2e`) runs against the dev server; CI needs
  `E2E_SKIP_AUTH`.
- Cloudflare and Vercel IaC adoption is import-based. Run `gen-imports`, then
  `pulumi preview`, and confirm no changes before `pulumi up`.
