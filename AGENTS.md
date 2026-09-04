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
under 20 words. That rule covers what a maintainer reads. It does not cover what a
customer or a guest reads.

Product copy stays `es-CL`, follows [`docs/BRAND.md`](docs/BRAND.md) and is written
in **simplified Spanish**: short sentences, common words, one idea per sentence.
Use a full stop where a subordinate clause would go. Delete a sentence that only
reassures.

Two registers apply that rule differently:

- **Marketing surfaces** — the landing page, `/about`, `/calculator` and the legal
  pages — may persuade and reassure.
- **Product surfaces** — anything behind a login, the guest check-in page and the
  crew page — carry only what the user needs to act: labels, values, errors and the
  notices the law requires. No greeting. No reassurance. No sentence that repeats
  what a label already says. No benefit framing.

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

Node 24 (`.nvmrc`). eve needs it, and `.npmrc` sets `engine-strict=true`, so an
older Node fails `pnpm install`. Vercel does not read `.nvmrc`: the project's Node
version is pinned in `infra/vercel`. Husky's pre-commit runs the broken shim: run
the checks by hand,
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
workers/whatsapp @luxel/whatsapp-worker  Cloudflare Worker: WhatsApp webhook, /send, cleaning media
packages/core    @luxel/core             server domain: channels, AI, messaging, Supabase, crew
packages/shared  @luxel/shared           i18n catalogs, WhatsApp template kinds, constants
packages/config  @luxel/config           ESLint / TS / Tailwind presets
infra/cloudflare @luxel/infra-cloudflare Pulumi: DNS + Email Routing + R2 media bucket
infra/vercel     @luxel/infra-vercel     Pulumi: Vercel projects, CI-driven
supabase/        migrations + local config
```

## Stack

| Concern         | Tool                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Hosting         | Vercel (one project per app root)                                                                           |
| Edge            | Cloudflare Workers, DNS, Email Routing, R2 (`luxel-cleaning-media`)                                         |
| Auth            | Clerk. `apps/web` = host sign-in only; `apps/admin` = Clerk org membership (`LUXEL_ADMIN_ORG_ID`/`SLUG`)    |
| Database        | Supabase Postgres + RLS                                                                                     |
| Channel (PMS)   | Hospitable, as a plugin behind `packages/core/src/channels/registry.ts`                                     |
| Messaging       | WhatsApp Cloud API (worker), Resend email fallback                                                          |
| Agent           | **eve** (`eve@0.51.1`) at `apps/web/agent/`, mounted in the web app by `withEve()`                          |
| AI              | OpenAI `gpt-5.6-terra`, pinned in `lib/ai/model.ts` (no env override), routed through the Vercel AI Gateway |
| Dynamic pricing | PriceLabs (part of the plan)                                                                                |
| Analytics       | In-house `analytics_events` + `leads`                                                                       |

## Conventions

- **No comments. Anywhere.** Every file this repository authors carries no
  comments: source, tests, SQL migrations, CI workflows, `wrangler.toml`, the
  Pulumi stack config and `supabase/config.toml`. The code and the tests explain
  themselves; anything an operator must know goes in `docs/`, not in a comment.
  Only tool directives stay (`eslint-disable`, `@ts-expect-error`), and a blanket
  `eslint-disable` is itself an error — always name the rules you disable.
  `.env.example` is the one exemption: it is a documentation template with no
  code, and its comments are the variable descriptions. Never add a comment to
  explain a change; that belongs in the commit message. ESLint
  (`luxel/no-comments`) and `pnpm lint:comments` enforce this.
- **i18n.** No hardcoded user-facing strings. Site copy lives in
  `packages/shared/src/i18n/es-CL.json`; the guest check-in page also has
  `checkin.en.json` and `checkin.pt.json` with the same key set. Locale prefix is
  `never`. Two surfaces deviate on purpose: the privacy policy and the terms of
  service are long legal documents, so their copy lives in
  `privacy.{es,en,pt}.json` and `terms.{es,en,pt}.json` behind
  `@luxel/shared/privacy` and `@luxel/shared/terms`, as typed objects rather
  than `t()` keys. Both use the one `LegalDoc` shape in
  `@luxel/shared/legal`, and both render through
  `apps/web/src/components/legal/legal-page.tsx`. That keeps them out of the
  `NextIntlClientProvider` payload of every other page.
  `apps/web/test/privacy-copy.test.ts` and `terms-copy.test.ts` hold each trio
  in step.
- **Routes are English.** `/calculator`, `/account`, `/properties`, `/privacy`,
  `/terms`, `/checkin/[id]`, `/cleaning/confirm/[token]`. Never a Spanish path
  segment.
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
  `packages/core/src/crew/index.ts` decides who is notified: assigned crew
  first, the Hospitable teammate mirror only when the assignment reaches
  nobody. Both notifiers call it; neither queries `property_contacts`.
- Cleanings are a **Luxel-run operation**. The sync pass creates one per imported
  checkout (`suggestCleaningsFromCheckouts`), schedules it (`autoConfirmSuggested`)
  and sends the `cleaning_confirm` template to the crew (`lib/cleaning/notify.ts`).
  Hosts have no cleaning controls and no guest inbox. `guest_threads` status
  `needs_host` means "needs a Luxel human". Do not add host-facing crew or inbox
  surfaces.
- A cleaning **walkthrough video** is Luxel-owned and short-lived. The crew
  records it in the browser; the browser sends it straight to the Cloudflare
  Worker, which puts it in the R2 bucket `luxel-cleaning-media`. It never passes
  through a Next.js route, and no host-facing or public surface may show it.
  `cleaning_walkthrough` holds the object key, the bytes, the duration, who
  recorded it, when, the cleaning, and `retention_until`. RLS is on with no
  policy, so the table is service-role only. The worker chooses the object key
  (`walkthrough/<cleaning id>/<32 hex>.<mp4|webm>`); the caller never names it,
  and there is no list route, so a leaked key reaches one object. The upload and
  read tickets are sealed with AES-GCM, keyed by `CLEANING_MEDIA_KEY` (falling
  back to `INTERNAL_SEND_TOKEN` while it is unset), so a ticket is opaque and the
  object key cannot be read back from a URL, a Workers Log or `wrangler tail`.
  Each names one key and one operation and expires in 15 and 10 minutes. The
  upload leg sends the ticket in the `x-luxel-ticket` header; only the read leg
  keeps it in the URL, because a `<video>` element cannot set a header. The media
  routes accept the media secret alone once it is set. Never log an object key, a ticket or a media URL: the video
  shows the inside of a home. Retention is the worker's nightly cron
  (`purgeExpiredWalkthroughs`), backed by an R2 lifecycle rule in
  `infra/cloudflare`. It is never a Vercel cron.
- The **crew flow** lives on one page, `/cleaning/confirm/[token]`. The confirm
  token stays the only credential and the only key: every server action takes the
  token and derives the cleaning itself, so one crew member never reaches another
  property's stay. After the crew confirms attendance the page shows three steps:
  the checklist (`cleaning_checklist`), the walkthrough video, and the inventory.
  Every step is server state, so a reload lands the crew back where they were. A
  recording that has not been uploaded yet is held in IndexedDB and rehydrated,
  and the page warns before it goes. The link closes three days after the
  cleaning date: past that the page renders nothing but a closed notice, and
  every action and the model route refuse. The page is `noindex`.
- The crew's browser does all the video work. It constrains `getUserMedia` to
  960x540 at 12 fps, caps `MediaRecorder` at 800 kbps and stops at
  `WALKTHROUGH_MAX_SECONDS`, so two minutes lands near 11 MB. Safari defaults to
  10 Mbps, so the bitrate is not optional. The MIME type is negotiated MP4 first
  and `video/x-matroska` is never accepted. Nothing is transcoded, here or on a
  server. The crew sees the size before the upload, and a failed upload retries
  from the same recording.
- The walkthrough **inventory** is a two-table review gate, like the guest reply
  drafts. Gemini writes `cleaning_inventory_draft` (`pending`, `ready`,
  `unavailable`, `failed`) and sends nothing anywhere. Only the crew's
  confirmation writes `cleaning_inventory`, and that row is the record. `source`
  is `ai` only when a `ready` draft exists and the confirmed items match it
  exactly; any correction, and any hand-written list, is `crew`. Confirming is
  what moves `cleanings.status` to `done` — the only writer of that value. The
  baseline the model compares against is the **previous confirmed inventory** for
  that property, never the previous video: it survives the video being purged,
  and the first cleaning of a property simply has no baseline.
- The model is reached from `POST /api/cleaning/inventory`, keyed by the same
  token, claimed with a compare-and-swap on `claimed_at` so two tabs cannot run
  it twice. `store: false` on every call, and the uploaded file is deleted after
  the run. Never log the model's raw description: it describes a home interior.
  Without `GOOGLE_API_KEY` the draft is written `unavailable` and the crew fills
  the inventory by hand — no crash, no dead end. The key must come from a
  billing-enabled Google project; see [`docs/DEPLOY.md`](docs/DEPLOY.md).
- After the crew confirms, a **durable review** compares the walkthrough against
  the property's previous confirmed inventory. It is deliberately asynchronous:
  it never blocks the crew and it never delays the confirmation. `cleaning_review`
  is one row per cleaning (`queued`, `running`, `done`, `skipped`, `failed`), and
  the Cloudflare Workflow `cleaning-review` in `workers/whatsapp` drives it. The
  Workflow owns the retries: `POST /cleaning-review/start` creates one instance
  per run and attempt (`rev-<run id>-<attempt>`), and the instance calls
  `POST /api/cleaning/review` on the web app with `INTERNAL_SEND_TOKEN`. A
  `retry` answer throws inside the step, so Cloudflare backs off exponentially.
  Findings come from two sources and are merged, never appended: the exact diff
  of the two confirmed inventories (`source` `compare`), and Gemini re-reading the
  video against that baseline (`source` `video`). `mergeFindings` dedupes on
  kind + room + name, and a run already `done`, `skipped` or `failed` returns its
  stored findings and writes nothing, so a replay adds nothing. The first cleaning
  of a property has no baseline: the run is `skipped` with reason `no_baseline`
  and zero findings. It never invents one. After `REVIEW_MAX_ATTEMPTS` the run is
  `failed`, keeps the compare findings and is visible at `/cleanings`, where an
  operator can retry it. The nightly worker cron re-drives every run still queued,
  so a lost start call costs a night, never the review. Findings reach a Luxel
  operator over the existing `sendWhatsAppViaWorker` path, at most once
  (`notified_at` is a compare-and-swap), and never reach the host. Never log a
  finding's text: it describes a home interior.
- Operators watch all of this at `/cleanings` in `apps/admin`: state per
  property and per cleaning, the video behind a button that mints a read ticket
  on demand, the confirmed inventory, the review state and its findings. It is
  operator-only. The host never sees the crew, the video, the inventory or the
  findings.
- A stay outside Airbnb is **operator-created**, at `/stays` in `apps/admin`. The
  action blocks the nights in Hospitable first (`setHospitableCalendar`, a `PUT`
  on the listing calendar). It records nothing locally until that call succeeds.
  It then writes two rows: a `calendar_blocks` row (`source` `import`, `origin`
  `manual`) and a `checkins` row (`origin` `manual`). Both carry the reference
  `manual:<uuid>` in `external_uid` and `reservation_uid`, and both leave
  `confirmation_code` null. `origin` `manual` keeps the sync away: the revoke
  pass, the check-in delete, the calendar prune and
  `rekeyCheckinsByConfirmationCode` all filter `origin = 'channel'`. The trigger
  `tg_manual_block_no_overlap` refuses a manual block that overlaps another block
  on that property; it never blocks an imported row. Cancelling releases the
  nights in Hospitable first, then revokes the check-in and deletes the block.
  Our code sends the guest nothing. The operator hands over the
  `/checkin/<token>` link. The host has no way to create or cancel one, but the
  stay does appear on their calendar as an occupied stay, with no revenue: a
  `manual` block is skipped by the price rollup in `stays-timeline.tsx`.
  Deleting a property that holds a `manual` row is refused —
  `deletablePropertyIds` in `lib/channels/manual-stays.ts` guards the prune and
  both listing reassignment paths, because the foreign keys cascade and no
  `origin` filter can reach a cascade.
- **Lux is one eve agent**, at `apps/web/agent/`, mounted in the web app by
  `withEve()` in `next.config.mjs`. It serves two surfaces, told apart by the
  authenticated principal and never by model input: the web concierge
  (`surface` `web`) and the Airbnb guest replies (`surface` `guest`). Tools,
  instructions and memory scope all follow that principal, so the guest surface
  can never reach a pricing or lead tool and the web surface can never reach a
  property's guest facts.
- eve **cannot import a module that carries `import 'server-only'`**: its
  compiler takes that package's throwing default export, and it exposes no
  condition or alias knob. That marker is the boundary. Agent-facing code lives
  in `packages/core/src/agent/` and stays marker-free, so memory recall is a
  direct call. Marked domain logic is reached over `POST /api/agent/tools`,
  authenticated with `INTERNAL_SEND_TOKEN`. Never delete a marker to make a
  build pass, and never add one to a module the agent imports.
- The agent's **route auth also enforces session ownership**. eve's route auth
  identifies a caller but does not decide which sessions that caller may read,
  so `agent/channels/eve.ts` reads the session id out of the request URL and
  refuses a caller who does not own the `lux_agent_session` row. A browser never
  creates a session directly: `POST /api/agent/session` creates it server-side
  and claims ownership before the id reaches the browser.
- Memory has **three tiers**, all service-role only (RLS on, no policy), all
  written through `sanitizeForMemory`, which applies `redactSecrets` and strips
  emails and phone numbers. `lux_memory_note` tier `global` is the playbook
  distilled from every property and recalled on every turn. Tier `property` is
  that unit's facts, retrieved from `lux_memory_note` and
  `lux_conversation_digest` by hybrid rank: Spanish full-text fused with pgvector
  cosine. A property with no history falls back to the global digests and never
  cites another property as its own. The conversation tier is eve's own durable
  session, keyed to `guest_threads.agent_session_id`. Hosts never see any of it.
- The **nightly distillation** is what writes the global tier. It runs from the
  Cloudflare Worker's existing cron, which POSTs `/api/agent/distill` with
  `INTERNAL_SEND_TOKEN`, exactly as the cleaning review already does. It is
  never a Vercel cron: `withEve` writes no `crons` key into the Build Output
  config, so an eve schedule never registers, and Hobby rejects sub-daily crons
  regardless. The worker deploys from `.github/workflows/worker-deploy.yml` on
  a push to `main` that touches `workers/**`.
- Lux replies to guests **behind a review gate**. `properties.ai_reviews` defaults to
  `true`: the pipeline stores the AI reply in `guest_reply_drafts` with status
  `pending` and sends nothing. A Luxel operator reviews it at `/inbox` in `apps/admin`,
  edits it if needed, and approves it; only then does the message reach the
  guest. An approved text that differs from the draft is stored as `host`, not
  `ai`. The gate lives in `lib/channels/pipeline.ts`, which runs the agent turn
  and then writes the draft; the agent itself sends the guest nothing.
  `simulateThreadReply` drafts a reply for a thread already on record without
  sending it. `ai_replies` and `ai_reviews` are operator-managed in
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
  `lib/agent/store.ts` feeds only `property_access.keyless_code` to
  `redactSecrets`, so Lux may give a guest the wifi password and never the door
  code. Never log either. The guest receives the door code only through
  Hospitable's T-3 message rule. Never show it on the check-in page or send it
  from our code. The host may write the wifi network and password into the
  property context form; that text reaches Lux.
- Guest documents are encrypted with `LUXEL_PII_KEY`, nulled 90 days after
  departure by the sync pass, and reach conserjes only through the approved
  WhatsApp template.
- The guest check-in form is **one screen**. It lists every guest as an editable
  row. The guest fixes any row in place. There are no per-guest steps. A party
  size screen comes first only when the reservation carried no headcount. The
  **party must match**: when `checkins.expected_guests` is set, the number of
  rows equals it, and the guest cannot add or remove a row. When it is null, the
  count the guest chose is the target, and add and remove move the target with
  the list. `submitCheckin` enforces the same rule and answers `party_size`. The
  target for a direct booking is read back from the draft, so a resumed session
  keeps it.
- The check-in form remembers progress on the server. `checkin_draft` holds one
  row per check-in, keyed by `checkin_id`, with a `rev` counter and a jsonb
  payload. RLS is on with no policy, so the table is service-role only.
  `saveCheckinDraft` takes the check-in token and derives the check-in itself. It
  never trusts a client id. The browser saves on blur, on a chip choice, and on
  an add or a remove. It never saves on a keystroke. Every write states the `rev`
  it read, and `writeCheckinDraft` refuses a write that does not match the stored
  `rev`. A stale tab is refused, never applied, so it cannot wipe newer work. The
  page then stops saving, says so, and offers a reload. A refused save is always
  visible; it is never silent. A document number in the draft is encrypted with
  the same `encryptPII` the submitted rows use. The draft never holds a raw
  number. Each guest row carries a client `uid`, so a remembered document follows
  its own row through an add or a remove. On resume `readCheckinDraft` decrypts
  and returns the complete number, so the guest finishes the form rather than
  retyping. That makes the check-in link a reader of the documents in its own
  unsent draft: the owner asked for it, and the privacy policy says so. A number
  that cannot be decrypted comes back empty rather than throwing.
  `submitCheckin` still refuses a masked string, because a tab opened before this
  change can still post one. A successful submit deletes the draft. The draft dies
  with the check-in row by cascade. The page stops reading the draft after the
  departure date, the same window `saveCheckinDraft` applies to the write.
  `purgeExpiredGuestDocuments` clears it 90 days after departure.
- Secrets never enter the repo. `.env*` files stay untracked. Operators set
  Vercel vars and `wrangler secret put`.

## Temporary: remove before public launch

Stealth gate: in production the middleware rewrites every page to
`app/[locale]/gate` until the `luxel_gate` cookie exists. Typing `0612` unlocks.
To lift it, delete `apps/web/src/app/[locale]/gate/` and the `withStealthGate`
block in `apps/web/src/middleware.ts`.

`/privacy` and `/terms` are exempt from the gate (`isPublicLegalRoute`). The
check-in page collects identity documents and must link to the privacy policy,
and the terms must be readable before a host requests the plan. For that reason
both pages are `noindex` while the gate is up: they are the only publicly
fetchable URLs of a site the operator hid. Make both indexable in the same
commit that deletes the gate.

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
  `packages/core/src/revenue.ts` is the host payout minus that fee. Luxel pays
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
`infra.yml` / `infra-vercel.yml` run Pulumi. `worker-deploy.yml` runs
`wrangler deploy` on a push to `main` that touches `workers/**`; it skips green
without `CLOUDFLARE_API_TOKEN`, and a deploy never touches secrets set with
`wrangler secret put`. Vercel deploys `apps/web` and `apps/admin` from their
roots.
Details and env vars: [`docs/DEPLOY.md`](docs/DEPLOY.md), [`docs/ENV.md`](docs/ENV.md).

No follow-up needs operator credentials. Meta WhatsApp is live,
`PROVIDER_API_KEY` is set on `luxel-admin`, and `GOOGLE_API_KEY` comes from a
billing-enabled project. The worker deploys from CI on a push to `main`
touching `workers/**`, so the `cleaning-review` Workflow and `LUXEL_APP_URL`
need no hand-run `wrangler deploy`. Plan activation is done: an operator moves
a subscription to `active` at `/plans` in `apps/admin`.

The two apps run **separate Clerk applications on purpose**. `apps/web` uses the
production instance at `clerk.serviciosluxel.cl`; `apps/admin` uses its own,
which today is a `pk_test_*` instance on `clerk.accounts.dev`. Hosts and Luxel
operators are different populations and never share a session. Do not "fix" this
by pointing both at one instance.

## Gotchas

- Supabase local image pulls can 403 from `public.ecr.aws`; mirror from Docker Hub.
- PostgREST refuses an `or=` filter on an **UPDATE**: it answers a bare
  `42703` "column does not exist" even when the column is there. The same
  filter is fine on a `select`. `claimDraft` in `lib/cleaning/inventory.ts`
  reads the row first, then updates with a compare-and-swap on the old
  `claimed_at`. Do not reach for `.or()` on an update.
- A migration applied with `psql` does not reload PostgREST's schema cache. Run
  `NOTIFY pgrst, 'reload schema';`, or `pnpm supabase:reset`, or every new column
  reads as missing over the REST API while `\d` shows it.
- Clerk **keyless** mode breaks next-intl routing. Use real dev keys and set
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `..._SIGN_UP_URL=/sign-up` so auth
  stays on localhost. Test user: `you+clerk_test@example.com`, OTP `424242`.
- Keep Clerk **Organizations optional** on the instance. Admin gating is
  app-level.
- A Clerk **production instance serves its own frontend API** from
  `clerk.<domain>`, not from `clerk.accounts.dev`. Nothing loads until the five
  CNAMEs resolve, and the browser failure is a bare `ERR_NAME_NOT_RESOLVED` with
  a page that still renders, because only the client bundle needs them. The
  records are Pulumi's (`clerkMailHash` in
  `infra/cloudflare/Pulumi.prod.yaml`); never add them from Clerk's
  "Configure automatically" flow, which writes records Pulumi does not know
  about. A production instance also starts with an **empty user pool** and an
  empty organization list: dev-instance accounts do not migrate, so
  `LUXEL_ADMIN_ORG_ID`/`SLUG` must be recreated there before `apps/admin` can
  move over.
- Hospitable's calendar endpoint clamps `start_date` to the first day of the
  running month. A request for an earlier date silently returns the same
  window, so the previous month can only come from the mirrored
  `calendar_blocks`, never from the live calendar. `end_date` is honoured
  past 120 days.
- Supabase free tier auto-pauses. A paused project looks deleted and blocks prod
  migrations while CI stays green.
- Vercel Hobby rejects sub-daily crons in `vercel.json` and silently blocks every
  deploy. Do not add a `vercel.json` cron.
- Cloudflare Workflows need `compatibility_date >= 2024-10-22`.
  `workers/whatsapp/wrangler.toml` pins exactly that. Do not lower it.
- `cloudflare:workers` does not resolve under vitest, and the worker entrypoint
  re-exports the Workflow class. `apps/web/vitest.config.ts` aliases the module
  to `test/stubs/cloudflare-workers.ts`. Without that alias
  `whatsapp-bridge.e2e.test.ts` fails to load the worker at all.
- Playwright e2e (`apps/web/e2e`) runs against the dev server; CI needs
  `E2E_SKIP_AUTH`.
- Cloudflare and Vercel IaC adoption is import-based. Run `gen-imports`, then
  `pulumi preview`, and confirm no changes before `pulumi up`.
