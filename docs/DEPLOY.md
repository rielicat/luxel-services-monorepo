# Deployment

Two deployable apps live in this monorepo. Each app is its own Vercel project. A
Vercel project has one root directory.

| App                             | Root directory | Domain                                       |
| ------------------------------- | -------------- | -------------------------------------------- |
| Customer site (`@luxel/web`)    | `apps/web`     | `serviciosluxel.cl`, `www.serviciosluxel.cl` |
| Operator panel (`@luxel/admin`) | `apps/admin`   | `panel.serviciosluxel.cl` (internal)         |

The Cloudflare Worker (`workers/whatsapp`, named `luxel-whatsapp-webhook`)
deploys separately with `wrangler deploy`.

Infrastructure is code. Two Pulumi (TS) programs share a state backend in
Cloudflare R2:

| Program                                             | Manages                                                                                   | Applied by                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| [`infra/cloudflare`](../infra/cloudflare/README.md) | The zone: DNS + Email Routing                                                             | `.github/workflows/infra.yml`        |
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
   allowed origins. Copy `pk_live_*` / `sk_live_*`. Point a Clerk webhook at
   `https://serviciosluxel.cl/api/webhooks/clerk` and copy
   `CLERK_WEBHOOK_SECRET`. Set `publicMetadata.role = "admin"` on each operator
   who needs `/admin` in the customer site. Create the operator organization for
   the panel (see `apps/admin` env below). Keep Organizations optional in the
   instance.
3. **Hospitable** — connect the central Luxel account and set `PROVIDER_API_KEY`.
   Register the webhook once, in Apps > Webhooks:
   `https://serviciosluxel.cl/api/channels/hospitable`. Add **no secret**; the
   route authorises by source IP. See [`ENV.md`](./ENV.md) § Inbound webhook
   access. Author the time-based guest messages as message rules. See
   [`ENV.md`](./ENV.md) § Scheduled guest messages.
4. **OpenAI** — an API key for Lux and the guest auto-replies (`OPENAI_API_KEY`).
   The model defaults to `gpt-4o-mini`; override with `OPENAI_MODEL`.
5. **Resend** — verify the sending domain. Set `RESEND_API_KEY` and
   `RESEND_FROM`.
6. **WhatsApp Cloud API** — via Meta Business. Deploy the worker and set its
   secrets with `wrangler secret put`. Use a System User token, never the 24-hour
   token from the app dashboard. Subscribe the webhook with the Graph API:
   `POST /{app-id}/subscriptions` (`object=whatsapp_business_account`,
   `fields=messages`, `callback_url=<worker>/webhook`, the worker's verify token,
   `access_token=<app-id>|<app-secret>`), then `POST /{waba-id}/subscribed_apps`
   with the System User token. Get the templates `luxel_conserje_registro` and
   `luxel_aseo_confirmacion` approved. Set `WHATSAPP_WORKER_SEND_URL` and
   `INTERNAL_SEND_TOKEN` on the web project.
7. **PriceLabs** — `PRICELABS_API_KEY` for dynamic pricing. Dynamic pricing is
   part of every plan; without the key the pricing panel reports `unavailable`.
8. **PostHog / Sentry** — optional. In-house analytics works without PostHog.
9. **DNS** — records live in `infra/cloudflare`. They point the domains at
   Vercel.

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
