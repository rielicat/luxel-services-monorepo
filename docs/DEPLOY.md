# Deployment

Two deployable apps live in this monorepo. Each app is its own Vercel project. A
Vercel project has one root directory.

| App                             | Root directory | Domain                                       |
| ------------------------------- | -------------- | -------------------------------------------- |
| Customer site (`@luxel/web`)    | `apps/web`     | `serviciosluxel.cl`, `www.serviciosluxel.cl` |
| Operator panel (`@luxel/admin`) | `apps/admin`   | `admin.serviciosluxel.cl` (internal)         |

The Cloudflare Worker (`workers/whatsapp`, named `luxel-whatsapp-webhook`)
deploys separately with `wrangler deploy`. It also owns the cleaning walkthrough
media routes, the R2 binding, the `cleaning-review` Workflow and the nightly
cron that purges old videos and re-drives queued reviews.

Infrastructure is code. Two Pulumi (TS) programs share a state backend in
Cloudflare R2:

| Program                                             | Manages                                                                                   | Applied by                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| [`infra/cloudflare`](../infra/cloudflare/README.md) | The zone: DNS + Email Routing, and the `luxel-cleaning-media` R2 bucket                   | `.github/workflows/infra.yml`        |
| [`infra/vercel`](../infra/vercel/README.md)         | The two Vercel projects. Adopts `web`. Creates `admin` with its domain and non-secret env | `.github/workflows/infra-vercel.yml` |

Neither program deploys app code. Vercel's Git integration deploys `web` and
`admin` on every push to `main`.

## One-time production infrastructure (owned by the operator)

These are external accounts. The code cannot provision them:

1. **Supabase** — create a project. Copy the Project URL, the `sb_publishable_*`
   key and the `sb_secret_*` key. Apply the schema once:
   `supabase link --project-ref <ref>` → `supabase db push`. There is no seed
   file. After that, `.github/workflows/db-migrate.yml` applies new migrations
   on push (repo secret `SUPABASE_DB_URL`).
2. **Clerk** — create a production instance. Add **both** app domains to the
   allowed origins. Copy `pk_live_*` / `sk_live_*`. A production instance serves
   its own frontend API from `clerk.<domain>`, so it does not work until five
   CNAMEs resolve. They are Pulumi's, not the dashboard's: set
   `clerkMailHash` in `infra/cloudflare/Pulumi.prod.yaml` to the label inside the
   `clkmail` target shown under Domains > Manual DNS setup, and push. Never use
   the dashboard's "Configure automatically" flow — it writes records Pulumi does
   not know about. Point a Clerk webhook at
   `https://serviciosluxel.cl/api/webhooks/clerk` and copy
   `CLERK_WEBHOOK_SECRET`. Create the operator organization for the panel and add
   each operator to it (see `apps/admin` env below). Keep Organizations optional
   in the instance.
3. **Hospitable** — connect the central Luxel account and set `PROVIDER_API_KEY`.
   Register the webhook once, in Apps > Webhooks:
   `https://serviciosluxel.cl/api/channels/hospitable`. Add **no secret**; the
   route authorises by source IP. See [`ENV.md`](./ENV.md) § Inbound webhook
   access. Author the time-based guest messages as message rules. See
   [`ENV.md`](./ENV.md) § Scheduled guest messages.
4. **OpenAI** — an API key for Lux and the guest auto-replies (`OPENAI_API_KEY`).
   The model is pinned in code (`lib/ai/client.ts`). There is no env override.
5. **Google AI (Gemini)** — an API key for the cleaning walkthrough inventory
   pre-fill and the later review (`GOOGLE_API_KEY`). **Issue it from a project
   with billing enabled.** The unpaid tier's terms permit training on and human
   review of submitted content; a walkthrough video shows the inside of a host's
   home. The code cannot detect an unpaid key, so this is an operator control.
   Without the key the crew still records and writes the inventory by hand, and
   the review still reports differences from the two confirmed inventories. The
   model is pinned in `lib/ai/gemini.ts`.
6. **Resend** — done. `serviciosluxel.cl` is verified in the `sa-east-1` region
   and `RESEND_FROM` is `info@serviciosluxel.cl`. Verification put DKIM on
   `resend._domainkey` and the bounce MX plus SPF on the `send.` subdomain, so
   the apex MX and apex SPF stay with Cloudflare Email Routing and inbound mail
   is untouched. Those three records were added in the Cloudflare dashboard and
   are **not** in `infra/cloudflare` — adopt them there before anyone rebuilds
   the zone. The production API key is send-only, which is why domain changes
   cannot be made from code.
7. **WhatsApp Cloud API** — via Meta Business. Deploy the worker and set its
   secrets with `wrangler secret put`. Use a System User token, never the 24-hour
   token from the app dashboard. Subscribe the webhook with the Graph API:
   `POST /{app-id}/subscriptions` (`object=whatsapp_business_account`,
   `fields=messages`, `callback_url=<worker>/webhook`, the worker's verify token,
   `access_token=<app-id>|<app-secret>`), then `POST /{waba-id}/subscribed_apps`
   with the System User token. Get the templates `luxel_conserje_registro` and
   `luxel_aseo_confirmacion` approved. Set `WHATSAPP_WORKER_SEND_URL` and
   `INTERNAL_SEND_TOKEN` on the web project.
8. **PriceLabs** — `PRICELABS_API_KEY` for dynamic pricing. Dynamic pricing is
   part of every plan; without the key the pricing panel reports `unavailable`.
9. **PostHog / Sentry** — optional. In-house analytics works without PostHog.
10. **DNS** — records live in `infra/cloudflare`. They point the domains at
    Vercel.
11. **Cloudflare R2** — the bucket `luxel-cleaning-media` holds the cleaning
    walkthrough videos. Set `CLEANING_MEDIA_KEY` as a worker secret and as a
    Vercel variable on both projects, together — once it is set on one side the
    other must match or the media routes answer 401. It seals the upload and read
    tickets. It is optional — the worker falls back to `INTERNAL_SEND_TOKEN`
    while it is unset — but set it: rotating it is the only way to revoke video
    access without touching WhatsApp. `infra/cloudflare` creates the bucket and
    its 30-day lifecycle rule; both were applied on 2026-09-03, and the Pulumi
    token already carried `Account: Workers R2 Storage: Edit`. Apply that stack
    before any `wrangler deploy`: the worker binds the bucket, and
    `wrangler deploy` does not create it.
12. **Cloudflare Workflows** — the `cleaning-review` Workflow compares a
    confirmed walkthrough against the previous confirmed inventory. Workflows run
    on the Workers **Free** plan; there is no plan to buy. `wrangler deploy`
    provisions the Workflow from the `[[workflows]]` block, so the only operator
    step is the deploy itself. Two settings must match the live environment
    before that deploy: `LUXEL_APP_URL` in `wrangler.toml` must be the web app's
    origin, and `INTERNAL_SEND_TOKEN` must hold the same value on the worker and
    on the web project — the worker calls the web app back with it. Without the
    Workflow the reviews still run, one attempt per night, from the cron sweep.

Plan billing has no external account. Luxel invoices the plans off-platform.

## Vercel setup (per project)

- `infra/vercel` sets the framework preset (**Next.js**), the Root Directory
  (`apps/web`, resp. `apps/admin`) and the Git link to `main`. Vercel detects the
  pnpm workspace and installs at the repo root. Enable "Include files outside
  the root directory" in the project settings.
- Node 22 (`.nvmrc`).
- Set the environment variables in the Vercel project settings. The exception is
  the admin config managed as code below.

### `apps/web` env

The inventory lives in [`ENV.md`](./ENV.md): the **Required** table and the
**Feature gates** table. Do not keep a second list here. Never set
`LUXEL_DEV_MOCK` or `E2E_SKIP_AUTH` in production.

### `apps/admin` env

Set in the Vercel dashboard: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.

Managed as code in [`infra/vercel/admin.ts`](../infra/vercel/admin.ts):
`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`,
`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`, and `LUXEL_ADMIN_ORG_SLUG`
(the slug of the live operator org, `servicios-luxel-1783354109102489708`).
`LUXEL_ADMIN_ORG_ID` can replace the slug.

Operator access is **Clerk organization membership**. Add staff to that org in
the Clerk dashboard. Remove them there too. Vercel snapshots env at build time.
After a change in `admin.ts`, redeploy the admin project.

## CI

`.github/workflows/ci.yml` runs format-check + typecheck + lint + test + build on
every push to `main` and on PRs, with stub env. It does **not** deploy. Vercel's
Git integration deploys `web` and `admin` on push. `db-migrate.yml`, `infra.yml`
and `infra-vercel.yml` run when a push touches their directories
(`supabase/migrations`, `infra/cloudflare`, `infra/vercel`).
