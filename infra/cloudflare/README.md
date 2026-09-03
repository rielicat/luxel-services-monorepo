# Cloudflare IaC (Pulumi · TypeScript)

Manages the **`serviciosluxel.cl` Cloudflare zone** as code: DNS records (Vercel
apex/`www`, DMARC), **Email Routing** (settings, destinations, rules, catch-all)
and the **`luxel-cleaning-media` R2 bucket** with its retention lifecycle rule.

State lives in **Cloudflare R2** (S3-compatible Pulumi backend). The WhatsApp
**Worker** is intentionally out of scope here — it stays on `wrangler`
(`workers/whatsapp`), which is already code. The worker only _binds_ the media
bucket; this program owns it.

> ⚠️ These records serve **live production traffic** (the site's DNS and email).
> The workflow below **adopts** the existing resources via import so the first
> apply changes nothing. Never run a blind `pulumi up` before importing.

---

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/install/) (`pulumi version` ≥ 3.x)
- Node 22 + pnpm (repo toolchain)
- Two Cloudflare API tokens (create at **My Profile → API Tokens**):
  - **Terraform/Pulumi token** — permissions:
    `Zone:DNS:Edit`, `Zone:Zone:Read`, `Zone:Email Routing Rules:Edit`,
    `Account:Email Routing Addresses:Edit`, `Account:Workers R2 Storage:Edit`,
    scoped to this zone/account. The R2 scope is what creates the media bucket;
    without it `pulumi up` fails with a 403.
  - **R2 token** — an R2 "S3 API" token (Access Key ID + Secret) for the state bucket.

Install deps once from the repo root:

```bash
pnpm install
```

---

## 1. Point Pulumi state at R2 (one-time)

Create a private R2 bucket named `luxel-pulumi-state` in the dashboard, then
(the endpoint is pre-filled with this account's id):

```bash
export AWS_ACCESS_KEY_ID=<R2 access key id>
export AWS_SECRET_ACCESS_KEY=<R2 secret access key>
export AWS_REGION=auto
export PULUMI_CONFIG_PASSPHRASE=<pick a strong passphrase>   # encrypts secrets in state

cd infra/cloudflare
pulumi login "s3://luxel-pulumi-state?endpoint=a592f6c9ed79454bf7c8ab489ece9036.r2.cloudflarestorage.com&s3ForcePathStyle=true"
pulumi stack select prod || pulumi stack init prod
```

Keep `AWS_*`, `PULUMI_CONFIG_PASSPHRASE`, and `CLOUDFLARE_API_TOKEN` in your shell
(or a `.envrc` / secrets manager) for every command below.

> The R2 token you use for `AWS_*` is **R2-scoped only**. The Pulumi Cloudflare
> provider needs a **separate** `CLOUDFLARE_API_TOKEN` with `Zone:DNS:Edit`,
> `Zone:Zone:Read`, `Zone:Email Routing Rules:Edit`, and
> `Account:Email Routing Addresses:Edit`.

---

## 2. Fill in the zone id + current state

`accountId` is already set in `Pulumi.prod.yaml`; you only need the zone id.

```bash
export CLOUDFLARE_API_TOKEN=<Cloudflare provider token (DNS + Email Routing scopes)>

pulumi config set zoneId <serviciosluxel.cl zone id>

# Read the live zone so you can mirror email routing exactly (also prints the zone id):
CF_ZONE_ID=<zone id> CF_ACCOUNT_ID=a592f6c9ed79454bf7c8ab489ece9036 \
  pnpm --filter @luxel/infra-cloudflare export
```

Copy the `rules` / `destinations` / `catchAll` the export prints into the
`emailRouting` block of `Pulumi.prod.yaml`, and confirm `vercelTarget` matches.
The config must equal live state, or the apply will reconcile the diff.

---

## 3. Adopt the live resources (import — no changes)

```bash
CF_ZONE_ID=<zone id> CF_ACCOUNT_ID=<account id> CF_ZONE_NAME=serviciosluxel.cl \
  pnpm --filter @luxel/infra-cloudflare import      # writes imports.json

LUXEL_CF_ADOPT=1 pulumi up                          # imports everything into state
```

`LUXEL_CF_ADOPT=1` turns on the `import` option for each resource. Pulumi adopts
the existing objects; if a declared property doesn't match live, it **fails the
import** instead of mutating production. The only _create_ should be the new
`_dmarc` record (it doesn't exist yet).

`gen-imports` **aborts** (writing no `imports.json`) if it can't read the zone or
Email Routing — so a partial map can never silently downgrade an adopt into a
create. If it fails, fix the token scope and re-run before `pulumi up`.

Then verify steady state:

```bash
pulumi preview        # expect: no changes
```

`imports.json` is gitignored and only consulted when `LUXEL_CF_ADOPT=1`; after
adoption you can delete it.

---

## 4. Day-to-day

```bash
pulumi preview        # dry-run a change
pulumi up             # apply
pnpm --filter @luxel/infra-cloudflare typecheck
```

Edit `Pulumi.prod.yaml` (records, email rules, DMARC policy) → `preview` → `up`.

---

## CI / auto-apply

`.github/workflows/infra.yml` runs this stack automatically:

- **Pull request** touching `infra/cloudflare/**` → `pulumi preview`, plan
  commented on the PR.
- **Push to `main`** touching `infra/cloudflare/**` (or a manual
  **Run workflow**) → `pulumi up` against the `prod` stack.

So the day-to-day flow is just: edit `Pulumi.prod.yaml` → open a PR (review the
preview) → merge, and CI applies it. A concurrency group serializes runs, and
the `deploy` job uses a `production` GitHub Environment — add required reviewers
there to gate applies behind an approval.

Required repo secrets: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`PULUMI_CONFIG_PASSPHRASE`, `CLOUDFLARE_API_TOKEN`. **Rotating any of these
(e.g. after exposure) means updating both Cloudflare and the GitHub secret.**

---

## What is / isn't managed

| Managed here                                           | Not managed here                                     |
| ------------------------------------------------------ | ---------------------------------------------------- |
| Apex `A` → Vercel, `www` `CNAME` → Vercel              | The WhatsApp Worker (`wrangler`, `workers/whatsapp`) |
| `_dmarc` TXT                                           | MX / SPF / DKIM — auto-managed by Email Routing      |
| Email Routing settings, destinations, rules, catch-all | Vercel project / domain config                       |
| `luxel-cleaning-media` R2 bucket + lifecycle rule      | The worker's R2 binding (`wrangler.toml`)            |
|                                                        | The `cleaning-review` Workflow (`wrangler.toml`)     |

## Cleaning media bucket

`r2.ts` creates `luxel-cleaning-media` and one lifecycle rule,
`expire-walkthroughs`: it deletes every object under `walkthrough/` after 30
days, and aborts a stalled multipart upload after one day. Cloudflare runs the
rule; there is no code and no cron behind it. The worker's own nightly cron
deletes an object as soon as its `cleaning_walkthrough.retention_until` passes,
so the lifecycle rule is the backstop, not the primary path.

Three stack settings tune it, all optional:
`cleaningMediaBucket` (default `luxel-cleaning-media`), `cleaningMediaLocation`
(default `wnam`) and `cleaningMediaRetentionDays` (default `30`). Cloudflare
honours `location` only when it first creates a bucket with that name.

**Apply this stack before the next `wrangler deploy`.** `wrangler deploy` binds
the bucket; it does not create it.

## The cleaning-review Workflow stays on wrangler

`wrangler deploy` provisions the Workflow from the `[[workflows]]` block in
`workers/whatsapp/wrangler.toml`. `cloudflare.Workflow` in Pulumi attaches to a
named worker script, so declaring it here as well would make Pulumi and wrangler
fight over the same object on every deploy. Do not add it.

MX, SPF and the `cf2024-1` DKIM record are created and owned by Cloudflare Email
Routing; declaring them as `DnsRecord`s would fight that automation, so they're
deliberately excluded.
