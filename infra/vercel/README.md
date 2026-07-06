# Vercel IaC (Pulumi · TypeScript)

Provisions the two Vercel projects as code via `@pulumiverse/vercel`:

- **web** — the live customer site (`serviciosluxel.cl`, `www`), **adopted** via
  import (identity + domains + git link). Its env vars and build commands are
  left managed in Vercel, so adoption never touches them.
- **admin** — the operator panel (`apps/admin`), **created** here: project +
  domain (`panel.serviciosluxel.cl`) + git link + its non-secret config.

Two things are intentionally **not** in this IaC — the same split the web
project already uses:

- **App deployments** — Vercel's Git integration builds + deploys web and admin
  on every push to `main`. Pulumi only provisions/configures the projects.
- **Shared secrets** — the admin app's Supabase/Clerk keys are set once in the
  Vercel dashboard (like web's), so there are no secrets to manage here.

State reuses the Cloudflare **R2** backend. The `panel` DNS record lives in
`infra/cloudflare` (set `panelTarget` there).

## How it runs — CI-driven

`.github/workflows/infra-vercel.yml`, on **push to `main`** touching
`infra/vercel/**` (and on manual dispatch); PRs get a `pulumi preview`. Each run:

1. discovers the web project's name/team from the Vercel API (`discover-web.mjs`);
2. on the first run, adopts the web project + domains and creates the admin
   project (`LUXEL_VC_ADOPT=1`); on later runs, applies changes.

**Required repo secret:** `VERCEL_API_TOKEN` (+ `VERCEL_TEAM_ID` if the projects
are on a Team). The `R2_*` / `PULUMI_CONFIG_PASSPHRASE` secrets are already set.
The workflow skips (green) until the token exists.

## One-time, in the Vercel dashboard

After the admin project is created, set its shared env vars (same values as web)
so its build succeeds, then push to deploy:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
(The non-secret `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `…FALLBACK_REDIRECT_URL`, and
`LUXEL_ADMIN_DOMAINS` are managed here in code.)

Then point the panel domain at Vercel in the Cloudflare stack:
`pulumi config set panelTarget cname.vercel-dns.com` (commit → CI applies).

## What is / isn't managed

| Managed here                                       | Not managed here                                 |
| -------------------------------------------------- | ------------------------------------------------ |
| web project identity + git + domains (adopted)     | app deployments (Vercel Git integration)         |
| admin project + domain + git link + non-secret env | shared secrets (Vercel dashboard, like web)      |
| —                                                  | web env + build commands; panel DNS (Cloudflare) |

## Manual / local (fallback)

```bash
cd infra/vercel
export VERCEL_API_TOKEN=...   # and VERCEL_TEAM_ID=team_xxx if applicable
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=auto
export PULUMI_CONFIG_PASSPHRASE=...
pulumi login "s3://luxel-pulumi-state?endpoint=a592f6c9ed79454bf7c8ab489ece9036.r2.cloudflarestorage.com&s3ForcePathStyle=true"
pulumi stack select prod || pulumi stack init prod
node scripts/discover-web.mjs
node scripts/gen-imports.mjs
LUXEL_VC_ADOPT=1 pulumi up
```
