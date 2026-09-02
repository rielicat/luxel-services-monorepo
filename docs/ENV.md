# Environment variables

Every variable the code reads, where it belongs, and what breaks without it.

This is the inventory of what the code needs. It is not a report of what is set —
compare it against the Vercel and GitHub dashboards yourself.

Four separate places hold configuration. A variable in the wrong one has no
effect and fails silently:

| Where                                      | Holds                                   |
| ------------------------------------------ | --------------------------------------- |
| Vercel project `luxel-web`                 | the customer site and all API routes    |
| Vercel project `luxel-admin`               | the operator panel                      |
| GitHub repo secrets                        | CI, migrations, infrastructure          |
| Cloudflare Worker `luxel-whatsapp-webhook` | the WhatsApp bridge (`wrangler secret`) |

## Vercel — `luxel-web`

> **Local development: env files live in `apps/web/`, not the monorepo root.**
> Next loads `.env` / `.env.local` from the app directory only, so a variable
> placed in the repository root `.env` is invisible to the app AND to the test
> suite. It fails quietly rather than loudly: `providerApiKey()` falls through to
> the legacy `HOSPITABLE_API_TOKEN`, so the symptom is a stale credential and a
> `402`, not a missing-variable error. The root `.env` is for the Supabase CLI.

### Required: the app does not work without these

| Variable                            | Purpose                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`          | database endpoint                                                                                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | browser-side database key (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)                                                      |
| `SUPABASE_SERVICE_ROLE_KEY`         | server-side database key (or `SUPABASE_SECRET_KEY`); every server action needs it                                          |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | sign-in                                                                                                                    |
| `CLERK_SECRET_KEY`                  | session verification                                                                                                       |
| `LUXEL_PII_KEY`                     | encrypts guest identity documents at rest and decrypts them for the conserje's WhatsApp; check-in storage fails without it |

### Feature gates: absent means the feature is silently off

| Variable                                           | Absent behaviour                                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                                   | **`getOpenAI()` returns null — the AI concierge does not answer at all.** Guest threads go straight to `needs_host`. No error surfaces.                          |
| `OPENAI_MODEL`                                     | optional; defaults to `gpt-4o-mini`                                                                                                                              |
| `PROVIDER_API_KEY`                                 | no properties import; the central-account model depends on this. Falls back to the legacy `HOSPITABLE_API_TOKEN`                                                 |
| `RESEND_API_KEY` + `RESEND_FROM`                   | `emailConfigured()` is false. Check-in emails (guest access code, conserje fallback, host confirmation) and cleaning-confirmation emails are skipped, never sent |
| `PRICELABS_API_KEY`                                | price optimisation reports unavailable                                                                                                                           |
| `WHATSAPP_WORKER_SEND_URL` + `INTERNAL_SEND_TOKEN` | no WhatsApp. A conserje with an email gets the check-in notice by email. The cleaning-crew booking notice is WhatsApp-only, so it is not sent                    |
| `HOSPITABLE_WEBHOOK_IPS`                           | optional; defaults to Hospitable's published `38.80.170.0/24`                                                                                                    |
| `CLERK_WEBHOOK_SECRET`                             | Clerk events not ingested                                                                                                                                        |
| _(no variable)_                                    | The public origin for outbound links is derived, not configured — see "Outbound link origin" below.                                                              |

### Payments — only what the chosen provider needs

| Provider    | Variables                                                       |
| ----------- | --------------------------------------------------------------- |
| MercadoPago | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`        |
| Stripe      | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                    |
| Transbank   | `TRANSBANK_API_KEY`, `TRANSBANK_COMMERCE_CODE`, `TRANSBANK_ENV` |

With none of them set, the plan bar reports `billing_not_configured` and hides
the activate button, which is intended rather than broken.

### Optional

`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`,
`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`,
`NEXT_PUBLIC_WHATSAPP_NUMBER`,
`LUXEL_WORKING_DAYS`, `LUXEL_WORKING_OPEN`, `LUXEL_WORKING_CLOSE`,
`NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`,
`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`,
`NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`.

Local development only, never set in production: `LUXEL_DEV_MOCK`,
`LUXEL_DEV_MOCK_PAYMENTS`, `E2E_SKIP_AUTH`.

## Vercel — `luxel-admin`

Set in the Vercel dashboard:

| Variable                                                      | Purpose                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                    | database endpoint                                       |
| `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) | server-side reads of analytics, leads and sessions      |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`                           | sign-in (same Clerk instance as web)                    |
| `CLERK_SECRET_KEY`                                            | session verification and organization-membership lookup |

Managed as code in `infra/vercel/admin.ts` (non-secret; applied by
`.github/workflows/infra-vercel.yml`):

| Variable                                          | Value                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`                   | `/sign-in`                                                                |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/`                                                                       |
| `LUXEL_ADMIN_ORG_SLUG`                            | slug of the operator organization (`servicios-luxel-1783354109102489708`) |
| `LUXEL_ADMIN_ORG_ID`                              | optional alternative to the slug (`org_…`); not set today                 |

With neither `LUXEL_ADMIN_ORG_ID` nor `LUXEL_ADMIN_ORG_SLUG` set, nobody is an
operator (`apps/admin/src/lib/admin.ts`). Vercel snapshots env at build time, so
a change in `admin.ts` needs a redeploy of the admin project.

## GitHub — repository secrets

| Secret                                                                                         | Used by            | Absent behaviour                  |
| ---------------------------------------------------------------------------------------------- | ------------------ | --------------------------------- |
| `SUPABASE_DB_URL`                                                                              | `db-migrate.yml`   | migrations never reach production |
| `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`                                                           | `infra-vercel.yml` | Pulumi cannot manage projects     |
| `CLOUDFLARE_API_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `PULUMI_CONFIG_PASSPHRASE` | `infra.yml`        | DNS and email routing not managed |

`GITHUB_TOKEN` is injected automatically; do not create it.

## Cloudflare Worker — `luxel-whatsapp-webhook`

Set with `wrangler secret put`, not in Vercel:
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`,
`WHATSAPP_APP_SECRET`, `INTERNAL_SEND_TOKEN` (must match the web value),
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `LUXEL_OPERATOR_WHATSAPP`. The two crew
templates below must exist and be approved on the same WhatsApp Business
account.

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

## Inbound webhook access

Register the endpoint with **no secret of any kind**:

```
https://<prod-host>/api/channels/hospitable
```

There is nowhere to put one. Hospitable's webhook form offers only **Name** and
**URL** — no custom headers, no signing key — and a query string is written to
access logs on every delivery, so it is not a place for a credential.

Deliveries are authorised by **source IP** against `HOSPITABLE_WEBHOOK_IPS`,
which defaults to Hospitable's published `38.80.170.0/24`. The variable exists
so a change to their sender range is a config fix rather than a deploy. On
Vercel the address is trustworthy: they overwrite `x-forwarded-for` and "do not
forward external IPs… to prevent IP spoofing".

With no platform headers at all — local development — the route is open, because
there is no address to check against. Anything deployed always has one.

**That check is not what protects the guest threads.** The handler takes no
content from the payload: an event names a reservation, and the thread is read
back from Hospitable with our own credential before anything is stored or
answered. A forged event costs an API call, not a fabricated message in a
guest's inbox and in the AI's grounding. See `lib/channels/webhook-auth.ts`.

## Scheduled guest messages

There is no scheduler in this codebase. Everything a guest receives on a
timer — the registration reminder, the check-in details three days before
arrival (door code, wifi, parking, building rules), the check-out-day message
and the review request — is a **message rule in Hospitable's own dashboard**
(Inbox → Rules), with the property-specific values as Hospitable custom codes.
Nothing to deploy: no `CRON_SECRET`, no `vercel.json`, no cron route.

The app sends exactly one guest message itself: the booking message with the
registration link, in the guest's language (`lib/checkin/copy.ts`), from the
`reservation.created` webhook. The cleaning crew hears about the booking at the
same moment; the conserjes hear when the registration is submitted.

## WhatsApp to the crew

Crew messages are **Meta-approved utility templates**. A business-initiated
WhatsApp to someone who has not written to us in the last 24 hours must be one —
the Cloud API rejects free text — and that is every conserje and every cleaner,
every time. The worker maps an intent to a template name (`TEMPLATES` in
`workers/whatsapp/src/index.ts`); register both in Meta Business Manager,
category _Utility_, language `es`, with these bodies. Parameters may not
contain newlines, so the guest list arrives as one line. Meta rejects bodies whose
variable count is high for their length, so both bodies carry a static intro and
closing sentence.

`luxel_conserje_llegada` — sent when a guest completes registration (submitted to Meta 2026-09-02, language `es`):

```
Hola, les avisamos la llegada de nuevos huéspedes para su registro en conserjería. Estos son los datos de la estadía:

📅 Estadía: {{1}}
🏠 Departamento: {{2}}
📍 Dirección: {{3}}
🚗 Estacionamiento: {{4}}

HUÉSPEDES ({{5}})
{{6}}

Cualquier duda pueden responder por este medio. Muchas gracias por su ayuda, equipo Luxel.
```

`luxel_aseo_nueva_reserva` — sent when a booking is created (submitted to Meta 2026-09-02, language `es`):

```
Hola, les avisamos que entró una nueva reserva en {{1}}. Estos son los datos para coordinar el aseo:

📅 Estadía: {{2}}
🏠 Departamento: {{3}}
📍 Dirección: {{4}}
👥 Huéspedes: {{5}}
🗓️ Check-out (aseo): {{6}}

Cualquier duda pueden responder por este medio. Muchas gracias, equipo Luxel.
```

Until a template is approved, the send fails. The conserje notice records the
outcome on the check-in (`notify_result`, recipients only). A conserje with an
email gets the notice by email instead. The cleaning-crew booking notice is
WhatsApp-only; it has no email fallback. A failed run leaves
`checkins.crew_notified_at` empty, so the next sync retries it.

Recipients are `property_contacts` rows. That table is an **import-only mirror**
of Hospitable's Teammates (Operations → Teammates). The host adds crew there,
with a phone number. Each sync pass reads `GET /v2/teammates` and rewrites the
rows; the app has no manual add or remove path. The mapping is by Hospitable
service: Cleaning and Laundry give role `cleaning`; Concierge, Check-in and
Check-out give role `concierge`; "all services" gives both; Owner, Manager and
Maintenance give no row. A teammate with no phone and no email is skipped. A
teammate scoped to some properties only appears on those.
