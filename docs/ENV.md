# Environment variables

Every variable the code reads, where it belongs, and what breaks without it.

This is the inventory of what the code needs. It is not a report of what is set —
compare it against the Vercel and GitHub dashboards yourself.

Four separate places hold configuration. A variable in the wrong one has no
effect and fails silently:

| Where                              | Holds                                             |
| ---------------------------------- | ------------------------------------------------- |
| Vercel project `luxel-web`         | the customer site and all API routes              |
| Vercel project `luxel-admin`       | the operator panel                                |
| GitHub repo secrets                | CI, migrations, infrastructure, the sync schedule |
| Cloudflare Worker `luxel-whatsapp` | the WhatsApp bridge (`wrangler secret`)           |

## Vercel — `luxel-web`

### Required: the app does not work without these

| Variable                            | Purpose                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`          | database endpoint                                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | browser-side database key (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)             |
| `SUPABASE_SERVICE_ROLE_KEY`         | server-side database key (or `SUPABASE_SECRET_KEY`); every server action needs it |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | sign-in                                                                           |
| `CLERK_SECRET_KEY`                  | session verification                                                              |
| `LUXEL_PII_KEY`                     | encrypts guest identity documents at rest; check-in storage fails without it      |

### Feature gates: absent means the feature is silently off

| Variable                                           | Absent behaviour                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                                   | **`getOpenAI()` returns null — the AI concierge does not answer at all.** No error surfaces.                     |
| `OPENAI_MODEL`                                     | optional; defaults to `gpt-4o-mini`                                                                              |
| `PROVIDER_API_KEY`                                 | no properties import; the central-account model depends on this. Falls back to the legacy `HOSPITABLE_API_TOKEN` |
| `CHANNEL_PROVIDER`                                 | optional; defaults to `hospitable`, the only registered plugin. An unregistered value returns HTTP 500           |
| `CRON_SECRET`                                      | **the sync endpoint accepts unauthenticated requests** — see the security note below                             |
| `RESEND_API_KEY` + `RESEND_FROM`                   | `emailConfigured()` is false; check-in and crew emails are skipped and recorded as `submitted`, never sent       |
| `PRICELABS_API_KEY`                                | price optimisation reports unavailable                                                                           |
| `WHATSAPP_WORKER_SEND_URL` + `INTERNAL_SEND_TOKEN` | no WhatsApp; crew notifications fall back to email only                                                          |
| `HOSPITABLE_WEBHOOK_SECRET`                        | **the webhook endpoint accepts anything posted to it** — self-generated, must match the registered URL           |
| `CLERK_WEBHOOK_SECRET`                             | Clerk events not ingested                                                                                        |
| _(no variable)_                                    | The public origin for outbound links is derived, not configured — see "Outbound link origin" below.              |

### Payments — only what the chosen provider needs

| Provider    | Variables                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------- |
| MercadoPago | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` |
| Stripe      | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`             |
| Transbank   | `TRANSBANK_API_KEY`, `TRANSBANK_COMMERCE_CODE`, `TRANSBANK_ENV`                                |

With none of them set, the plan bar reports `billing_not_configured` and hides
the activate button, which is intended rather than broken.

### Optional

`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`,
`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `LUXEL_ANALYTICS_SALT`,
`NEXT_PUBLIC_WHATSAPP_NUMBER`, `CLERK_JWT_TEMPLATE_NAME`,
`LUXEL_WORKING_DAYS`, `LUXEL_WORKING_OPEN`, `LUXEL_WORKING_CLOSE`,
`NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`,
`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`,
`NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`.

Local development only, never set in production: `LUXEL_DEV_MOCK`,
`LUXEL_DEV_MOCK_PAYMENTS`, `E2E_SKIP_AUTH`.

## Vercel — `luxel-admin`

`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`),
`LUXEL_ADMIN_ORG_ID`, `LUXEL_ADMIN_ORG_SLUG`.

## GitHub — repository secrets

| Secret                                                                                         | Used by            | Absent behaviour                                        |
| ---------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------- |
| `APP_CRON_URL`                                                                                 | `sync-cron.yml`    | job skips green — nothing syncs on a schedule           |
| `CRON_SECRET`                                                                                  | `sync-cron.yml`    | must equal the Vercel value or the endpoint returns 401 |
| `SUPABASE_DB_URL`                                                                              | `db-migrate.yml`   | migrations never reach production                       |
| `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`                                                           | `infra-vercel.yml` | Pulumi cannot manage projects                           |
| `CLOUDFLARE_API_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `PULUMI_CONFIG_PASSPHRASE` | `infra.yml`        | DNS and email routing not managed                       |

`GITHUB_TOKEN` is injected automatically; do not create it.

## Cloudflare Worker — `luxel-whatsapp`

Set with `wrangler secret put`, not in Vercel:
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`,
`WHATSAPP_APP_SECRET`, `INTERNAL_SEND_TOKEN` (must match the web value),
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `LUXEL_OPERATOR_WHATSAPP`.

## Outbound link origin

Check-in and crew-confirmation links land in an Airbnb thread or an email, where
there is no page context, so they need an absolute origin rather than a relative
path. `appUrl()` derives it from Vercel's own system variables — there is
deliberately no variable for you to set:

| Deployment | Resolves to                                                          |
| ---------- | -------------------------------------------------------------------- |
| production | `VERCEL_PROJECT_PRODUCTION_URL`, falling back to `serviciosluxel.cl` |
| preview    | `VERCEL_URL` — the preview links to itself, never to production      |
| local      | `http://localhost:3000`                                              |

Production never falls through to localhost, so a project with Vercel's system
variables disabled still cannot mail a guest a link to their own machine.

## The Hospitable webhook secret

`HOSPITABLE_WEBHOOK_SECRET` is a value you generate — the vendor does not issue
one, and publishes no signature scheme:

```bash
openssl rand -hex 32
```

The same value goes in two places: the `luxel-web` env var, and the URL
registered at **Hospitable → Apps → Webhooks**:

```
https://<prod-host>/api/channels/hospitable?secret=<value>
```

It has to be the query string there. Their webhook form offers only **Name** and
**URL** — no custom headers, no signing key. The route prefers the
`x-luxel-webhook-secret` header when one is present, because a query string is
recorded in access logs, but nothing Hospitable sends can carry it; that path
exists for our own tooling and manual replays.

When the variable is unset the route performs **no check at all**. That is the
local-development default and a production hole: a forged event triggers an
account sync and AI replies into real guest threads. Their deliveries come from
`38.80.170.0/24` if the query-string exposure ever needs closing at the edge.

## Security note on `CRON_SECRET`

The guard in `apps/web/src/app/api/cron/sync/route.ts` reads:

```ts
const secret = process.env.CRON_SECRET;
if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
  /* 401 */
}
```

When `CRON_SECRET` is unset the condition short-circuits and every request is
accepted. A sync is not read-only: it sends messages into guest threads and
triggers AI replies. Treat this variable as required in production, whichever
scheduler calls the route.

## Known drift

- `.env.example` omits `OPENAI_API_KEY`, `OPENAI_MODEL`, `CRON_SECRET`,
  `PROVIDER_API_KEY`, `HOSPITABLE_WEBHOOK_SECRET`, `PRICELABS_API_KEY`,
  `RESEND_API_KEY`, `RESEND_FROM`, `LUXEL_PII_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `WHATSAPP_WORKER_SEND_URL`, `INTERNAL_SEND_TOKEN`, `LUXEL_ADMIN_ORG_ID`,
  `LUXEL_ADMIN_ORG_SLUG`.
- `.env.example` lists `ANTHROPIC_API_KEY`, which no code reads — the AI client
  uses OpenAI.
- `LUXEL_ADMIN_EMAILS` appears in local `.env.local` but no code reads it.
  Admin access is decided by the Clerk `admin` role.
