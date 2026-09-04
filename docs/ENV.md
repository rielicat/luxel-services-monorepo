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

| Variable                            | Purpose                                                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`          | database endpoint                                                                                                                                                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | browser-side database key (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)                                                                                                               |
| `SUPABASE_SERVICE_ROLE_KEY`         | server-side database key (or `SUPABASE_SECRET_KEY`); every server action needs it                                                                                                   |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | sign-in                                                                                                                                                                             |
| `CLERK_SECRET_KEY`                  | session verification                                                                                                                                                                |
| `LUXEL_PII_KEY`                     | encrypts guest identity documents at rest and decrypts them for the conserje's WhatsApp; check-in storage fails without it                                                          |
| `LUXEL_AGENT_TOKEN_SECRET`          | HS256 secret for the short-lived token the browser and the guest pipeline present to the eve agent; without it the chat answers nothing and every guest thread goes to `needs_host` |

### Feature gates: absent means the feature is silently off

| Variable                                                                                                                        | Absent behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                                                                                                                | **not needed when the AI Gateway is configured.** The digests, the distillation and the embeddings all route through the Gateway with `AI_GATEWAY_API_KEY` or Vercel OIDC, so they inherit its BYOK, budgets and observability. This key is only a local-development fallback for when neither Gateway credential is present. With no credential at all: digests fall back to an extractive summary and retrieval runs on Spanish full-text alone.                                                                          |
| `AI_GATEWAY_API_KEY` (walkthrough model)                                                                                        | `geminiConfigured()` is false. The walkthrough inventory draft is written as `unavailable`; the crew still records, still uploads and writes the inventory by hand. The later review still runs and still reports differences, from the two confirmed inventories alone (`reason` `model_unavailable`). The clip is sent inline through the AI Gateway to `google/gemini-3.5-flash-lite`; there is no Google key and nothing is stored at the provider. Zero Data Retention needs a Vercel Pro plan and is **not** on today |
| `PROVIDER_API_KEY`                                                                                                              | no properties import; the central-account model depends on this. Falls back to the legacy `HOSPITABLE_API_TOKEN`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `RESEND_API_KEY` + `RESEND_FROM`                                                                                                | `emailConfigured()` is false. Check-in emails (conserje fallback, host confirmation) and cleaning-confirmation emails are skipped, never sent. Our code never emails a guest                                                                                                                                                                                                                                                                                                                                                |
| `PRICELABS_API_KEY`                                                                                                             | dynamic pricing (part of every plan) unavailable; the pricing panel reports `unavailable`                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `WHATSAPP_WORKER_SEND_URL` (the worker's `/send` route; a bare origin is accepted and `/send` appended) + `INTERNAL_SEND_TOKEN` | no WhatsApp. `INTERNAL_SEND_TOKEN` also authenticates the agent's internal calls back into the app (`/api/agent/tools`, `/api/agent/events`): unset, every agent tool returns its unavailable answer and no chat message is persisted. A conserje with an email gets the check-in notice by email. A cleaner gets the cleaning confirmation by email instead                                                                                                                                                                |
| `LUXEL_WORKER_URL`                                                                                                              | optional; the media routes and the review start call fall back to the origin of `WHATSAPP_WORKER_SEND_URL`. Neither set → `cleaningMediaConfigured()` is false, the crew cannot record a walkthrough, and a queued review waits for the worker's nightly sweep                                                                                                                                                                                                                                                              |
| `HOSPITABLE_WEBHOOK_IPS`                                                                                                        | optional; defaults to Hospitable's published `38.80.170.0/24`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `AI_GATEWAY_API_KEY`                                                                                                            | every model call: the agent's own turn, the conversation digests, the nightly distillation and the embeddings. Unset is fine on Vercel, where project OIDC authenticates the Gateway instead. Unset **and** off Vercel with no `OPENAI_API_KEY`: **the agent answers nothing** and every guest thread goes to `needs_host`                                                                                                                                                                                                  |
| `EVE_AGENT_ORIGIN`                                                                                                              | optional; the origin the guest pipeline calls to reach the agent. Defaults to the app's own origin, which is correct when `withEve` mounts the agent in the same Vercel project                                                                                                                                                                                                                                                                                                                                             |
| `CLERK_WEBHOOK_SECRET`                                                                                                          | Clerk events not ingested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| _(no variable)_                                                                                                                 | The public origin for outbound links is derived, not configured — see "Outbound link origin" below.                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Billing

Plan billing is not in code. Luxel invoices the plans off-platform at the end
of the month. There is no payment variable to set.

### Optional

`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`,
`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`,
`NEXT_PUBLIC_WHATSAPP_NUMBER`,
`LUXEL_WORKING_DAYS`, `LUXEL_WORKING_OPEN`, `LUXEL_WORKING_CLOSE`,
`NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`,
`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`,
`NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`.

Local development only, never set in production: `LUXEL_DEV_MOCK`,
`E2E_SKIP_AUTH`.

## Vercel — `luxel-admin`

Set in the Vercel dashboard:

| Variable                                                      | Purpose                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                    | database endpoint                                        |
| `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) | server-side reads of analytics, leads and sessions       |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`                           | sign-in (its own Clerk application, not web's)           |
| `CLERK_SECRET_KEY`                                            | session verification and organization-membership lookup  |
| `PROVIDER_API_KEY` (or legacy `HOSPITABLE_API_TOKEN`)         | blocks and releases nights for a direct stay at `/stays` |

Shared with `luxel-web` — same values, best set once as **team-level shared
variables** linked to both projects, so the two can never drift:

| Variable                                           | Needed by                                                   | Absent behaviour                                              |
| -------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| `LUXEL_PII_KEY`                                    | `/inbox` approve — decrypts the customer's Hospitable token | **approving a draft throws.** Must be byte-identical to web's |
| `OPENAI_API_KEY`                                   | `/inbox` draft and simulate                                 | empty draft, no error                                         |
| `PROVIDER_API_KEY`                                 | `/listings` and the `/debug` channel probe                  | listings cannot read the central account                      |
| `PRICELABS_API_KEY`                                | `/debug` probe only                                         | probe reports unconfigured                                    |
| `RESEND_API_KEY` + `RESEND_FROM`                   | `/debug` probe only                                         | probe reports email broken when it is not                     |
| `WHATSAPP_WORKER_SEND_URL` + `INTERNAL_SEND_TOKEN` | `/debug` probe only                                         | probe reports WhatsApp broken when it is not                  |

Managed as code in `infra/vercel/admin.ts` (non-secret; applied by
`.github/workflows/infra-vercel.yml`):

| Variable                                          | Value                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`                   | `/sign-in`                                                                  |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/`                                                                         |
| `LUXEL_ADMIN_ORG_SLUG`                            | slug of the operator organization (`servicios-luxel-1783354109102489708`)   |
| `LUXEL_ADMIN_ORG_ID`                              | optional alternative to the slug (`org_…`); not set today                   |
| `NEXT_PUBLIC_WEB_URL`                             | `https://serviciosluxel.cl` — the `/debug` bench mints check-in links there |

Without `PROVIDER_API_KEY`, `/stays` loads but refuses to create or cancel a
direct stay: it never writes locally what it could not block in Hospitable.

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
`CLEANING_MEDIA_KEY` (optional; must match the web value when set),
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `LUXEL_OPERATOR_WHATSAPP`. The two crew
templates below must exist and be approved on the same WhatsApp Business
account.

`INTERNAL_SEND_TOKEN` now runs in both directions. The web app authenticates to
the worker with it, and the worker authenticates back to the web app with it on
`POST /api/cleaning/review`. One value, set in both places.

The same worker holds the cleaning walkthrough videos. Its extra configuration
is not secret and lives in `wrangler.toml`:

| Item                     | Kind         | Purpose                                                                    |
| ------------------------ | ------------ | -------------------------------------------------------------------------- |
| `account_id`             | pin          | pinned so wrangler never calls `/memberships`, which a scoped token cannot |
| `CLEANING_MEDIA`         | R2 binding   | the `luxel-cleaning-media` bucket, created by `infra/cloudflare`           |
| `SEND_LIMITER`           | rate limiter | 30 requests per minute per key; `namespace_id` 1001                        |
| `MEDIA_LIMITER`          | rate limiter | 60 requests per minute per key; `namespace_id` 1002                        |
| `CLEANING_MEDIA_ORIGINS` | var          | browser origins allowed to upload; comma separated                         |
| `CLEANING_REVIEW`        | Workflow     | `CleaningReviewWorkflow`; `wrangler deploy` provisions it                  |
| `LUXEL_APP_URL`          | var          | origin of the web app; the Workflow and the distill pass call it back      |
| `[triggers] crons`       | cron         | nightly retention pass, review sweep and agent distill at 04:23 UTC        |

A rate limiter `namespace_id` must be unique inside the account and the period
must be 10 or 60. Two bindings that share an id share one counter.

The nightly cron does three things: it purges expired walkthrough media, it
re-drives every `cleaning_review` row still queued, and it calls
`POST <LUXEL_APP_URL>/api/agent/distill` so the agent playbook is rebuilt from
the day's conversations. It lives here and not on Vercel: `withEve` writes no
`crons` key into the Build Output config, and Vercel Hobby rejects sub-daily
crons.

`CLEANING_MEDIA_KEY` seals the upload and read tickets and is the only bearer
the media routes accept once it is set. It is optional: while it is unset both
sides fall back to `INTERNAL_SEND_TOKEN`, so nothing breaks before an operator
provisions it. Set it on the worker and on both Vercel projects together — the
two sides must agree, so whichever you set first, uploads and playback answer
401 until the other follows. Set both before the first `wrangler deploy` and
there is no window at all.

Rotating `CLEANING_MEDIA_KEY` is the break-glass for video access. It
invalidates every ticket still in flight — a ticket lives 15 minutes at most —
and it changes the seal, so a leaked `INTERNAL_SEND_TOKEN` no longer lets anyone
forge a ticket offline. WhatsApp keeps working through the rotation.

A ticket is sealed with AES-GCM, so it is opaque: the object key is not readable
from it, and a request URL that carries one tells a log nothing. The upload leg
sends it in the `x-luxel-ticket` header. The read leg keeps it in the query
because a `<video>` element cannot set a header.

### Cleaning media routes

The video never passes through a Next.js route: a Vercel function caps a request
body at 4.5 MB. The browser sends it to the worker instead, where the limit is
100 MB.

| Route                        | Method  | Auth                      | Body                               | Answer                                                  |
| ---------------------------- | ------- | ------------------------- | ---------------------------------- | ------------------------------------------------------- |
| `/cleaning-media/upload-url` | POST    | `x-luxel-internal-token`  | `{cleaningId, contentType, bytes}` | `{key, uploadUrl, ticket, expiresAt, maxBytes}`         |
| `/cleaning-media/read-url`   | POST    | `x-luxel-internal-token`  | `{key}`                            | `{url, ticket, expiresAt}`                              |
| `/cleaning-media/object`     | PUT     | `x-luxel-ticket` header   | the video bytes                    | `{key, bytes, contentType}`                             |
| `/cleaning-media/object`     | GET     | `x-luxel-ticket` or query | none                               | the bytes; `Range` gives `206`                          |
| `/cleaning-media/object`     | OPTIONS | none                      | none                               | `204` with the CORS headers                             |
| `/cleaning-review/start`     | POST    | `x-luxel-internal-token`  | `{runId, attempt}`                 | `{started, instanceId}`; `503` with no Workflow binding |

### Cleaning review route (worker → web app)

| Route                  | Method | Auth                     | Body                   | Answer                     |
| ---------------------- | ------ | ------------------------ | ---------------------- | -------------------------- |
| `/api/cleaning/review` | POST   | `x-luxel-internal-token` | `{runId}`              | `{status, findings}`       |
| `/api/cleaning/review` | POST   | `x-luxel-internal-token` | `{op: "sweep", limit}` | `{runs: [{id, attempts}]}` |

`status` is `done`, `skipped`, `failed`, `retry`, `running` or `unknown`. The
Workflow throws on `retry` and on `running`, so Cloudflare retries the step with
exponential backoff. It returns on every other value.

The worker chooses the object key: `walkthrough/<cleaning id>/<32 hex>.<mp4 or
webm>`. The caller cannot name it. There is no list route, so a leaked key
reaches one object and nothing else. An upload ticket is valid 15 minutes, a
read ticket 10 minutes, and each one names a single key and a single operation.
The web client is `apps/web/src/lib/cleaning/media.ts`.

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

The booking message with the registration link is a rule too: Hospitable's stock
"New reservation" rule, with the link built from the Airbnb confirmation code
(`https://serviciosluxel.cl/checkin/<code>`). The app sends the guest nothing.
Its sync only mirrors each reservation into a `checkins` row, so the code in the
link already resolves when the guest opens it. The cleaning crew hears when a
turnover cleaning is scheduled; the conserjes hear when the registration is
submitted.

## WhatsApp to the crew

Crew messages are **Meta-approved utility templates**. A business-initiated
WhatsApp to someone who has not written to us in the last 24 hours must be one —
the Cloud API rejects free text — and that is every conserje and every cleaner,
every time. The worker maps an intent to a template name (`TEMPLATES` in
`workers/whatsapp/src/index.ts`); register both in Meta Business Manager,
category _Utility_, language `es`, with these bodies. Parameters may not
contain newlines, so the guest list arrives as one line. Meta rejects bodies whose
variable count is high for their length and bodies that end with a variable, so
both templates keep a static first and last line.

`luxel_conserje_registro` — sent when a guest completes registration (language `es`, four parameters: stay, unit + address, parking, headcount + guest list). The same template also carries the notice to the host, with the guest list replaced by who booked and when they arrive — the host has no need of the documents:

```
Registro de huéspedes en conserjería
📅 Estadía: {{1}}
🏠 Departamento: {{2}}
🚗 Estacionamiento: {{3}}
👥 Huéspedes: {{4}}
Gracias, equipo Luxel
```

`luxel_aseo_confirmacion` — sent when a cleaning is scheduled (language `es`, two parameters: date and time, property; two quick-reply buttons):

```
Tienes un aseo asignado el {{1}} en {{2}}. ¿Confirmas tu asistencia?
```

Buttons (quick reply): `Confirmo` and `No puedo`. `{{1}}` is the cleaning date
and time in host voice (`martes 02 de septiembre, 11:00`); `{{2}}` is the
property nickname, plus ` · Depto. <unit>` when `property_access.unit` exists.
Each button carries a payload: `clean:<confirm_token>:yes` for Confirmo,
`clean:<confirm_token>:no` for No puedo. `confirm_token` is the
`cleanings.confirm_token` uuid. The worker reads the payload from the inbound
`button` message. `yes` stamps `cleanings.crew_confirmed_at` and replies
"¡Gracias! Aseo confirmado ✅". `no` stamps `cleanings.crew_declined_at`, replies
"Entendido. Avisamos al equipo Luxel para coordinar." and texts
`LUXEL_OPERATOR_WHATSAPP` with the date, the property and the sender. An unknown
payload is ignored. Button replies never enter the chat bridge.

Until a template is approved, the send fails. The conserje notice records the
outcome on the check-in (`notify_result`, recipients only). A conserje with an
email gets the notice by email instead. The cleaning confirmation goes to each
cleaner with a phone when the sync pass schedules a cleaning from an imported
checkout (`suggestCleaningsFromCheckouts` + `autoConfirmSuggested`). There is no
host toggle. The same pass texts `LUXEL_OPERATOR_WHATSAPP` a free-text FYI with
the confirm link. A cleaner with only an email, or a failed send, gets an email
with the tokenized confirm link (`/cleaning/confirm/<token>`) instead. Nothing
goes to the crew at reservation time.

Recipients are `property_contacts` rows. That table is an **import-only mirror**
of Hospitable's Teammates (Operations → Teammates). Luxel operators add the crew
there, with a phone number. Hosts never see these rows. Each sync pass reads
`GET /v2/teammates` and rewrites the
rows; the app has no manual add or remove path. The mapping is by Hospitable
service: Cleaning and Laundry give role `cleaning`; Concierge, Check-in and
Check-out give role `concierge`; "all services" gives both; Owner, Manager and
Maintenance give no row. A teammate with no phone and no email is skipped. A
teammate scoped to some properties only appears on those.
