# Deployment

Two deployable apps live in this monorepo — deploy each as its **own Vercel
project** (a Vercel project has one root directory):

| App                             | Root directory | Suggested domain                             |
| ------------------------------- | -------------- | -------------------------------------------- |
| Customer site (`@luxel/web`)    | `apps/web`     | `serviciosluxel.cl`, `www.serviciosluxel.cl` |
| Operator panel (`@luxel/admin`) | `apps/admin`   | `panel.serviciosluxel.cl` (internal)         |

The Cloudflare Worker (`workers/whatsapp`) deploys separately via `wrangler deploy`.
The Cloudflare **zone** (DNS + Email Routing) is managed as code with Pulumi in
[`infra/cloudflare`](../infra/cloudflare/README.md) — state in Cloudflare R2.

## One-time production infrastructure (owned by the operator)

These are external accounts — the code can't provision them:

1. **Supabase** — create a project, then apply the schema:
   `supabase link --project-ref <ref>` → `supabase db push` (applies everything in
   `supabase/migrations/`, then run `supabase/seed.sql` for service types / pricing
   / operation point). Copy the Project URL + the `sb_publishable_*` and
   `sb_secret_*` keys.
2. **Clerk** — create a production instance (or claim the dev one). Configure the
   `supabase` JWT template (see the root README). Add **both** app domains to the
   instance's allowed origins. Copy `pk_live_*` / `sk_live_*`.
3. **MercadoPago** + **Stripe** — production merchant accounts (CLP). Set the
   webhook URLs to `https://serviciosluxel.cl/api/webhooks/{mercadopago,stripe}`.
4. **WhatsApp Cloud API** — via Meta Business; deploy the worker and set its secrets
   with `wrangler secret put`.
5. **Anthropic** — an API key for the "Lux" concierge (`ANTHROPIC_API_KEY`).
6. **PostHog / Sentry** — optional (in-house analytics works without PostHog).
7. **DNS** — point the domains at Vercel.

## Vercel setup (per project)

- Framework preset: **Next.js**. Vercel auto-detects the pnpm workspace and runs
  the install at the repo root; set **Root Directory** to `apps/web` (resp.
  `apps/admin`) and enable "Include files outside the root directory".
- Node 22 (`.nvmrc`).
- Set the environment variables below in the Vercel project settings.

### `apps/web` env (see `.env.example`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`CLERK_JWT_TEMPLATE_NAME=supabase`, `CLERK_WEBHOOK_SECRET`,
`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`,
`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/cuenta`,
`NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/cuenta`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`,
`NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`, `NEXT_PUBLIC_WHATSAPP_NUMBER`,
`ANTHROPIC_API_KEY`, `LUXEL_ANALYTICS_SALT`, Sentry/PostHog vars.
Do **not** set `LUXEL_DEV_MOCK_PAYMENTS` in production.

### `apps/admin` env (see `apps/admin/.env.example`)

`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`,
`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`,
`LUXEL_ADMIN_DOMAINS=serviciosluxel.cl`.

Operator access is by **verified email domain** — staff sign in with
`@serviciosluxel.cl` addresses. No per-person allow-list to maintain.

## CI

`.github/workflows/ci.yml` runs format-check + typecheck + lint + test + build on
every push to `main` and on PRs (with stub env). It does **not** deploy — connect
the GitHub repo to Vercel for auto-deploys on push.
