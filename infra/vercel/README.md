# Vercel IaC (Pulumi · TypeScript)

Manages the two Vercel projects as code via `@pulumiverse/vercel`:

- **web** — the live customer site (`serviciosluxel.cl`, `www`), **adopted** via
  import. Its environment variables are left managed in Vercel (not declared
  here), so adoption never touches them.
- **admin** — the operator panel (`apps/admin`), **created** here, git-linked,
  with its env vars, and served at `panel.serviciosluxel.cl`.

State reuses the same Cloudflare **R2** backend as `infra/cloudflare`. The
`panel` DNS record lives in `infra/cloudflare` (set `panelTarget` there).

> ⚠️ The web project serves production. Adoption is import-based: review
> `pulumi preview` and confirm no build-setting changes before `pulumi up`.

## Prerequisites

- Pulumi CLI, Node 22 + pnpm.
- A **Vercel API token** (Account Settings → Tokens), scoped to the team that
  owns the projects. Export `VERCEL_API_TOKEN` (and `VERCEL_TEAM_ID` if a Team).
- R2 state creds + passphrase (same as `infra/cloudflare`).

## Steps

```bash
cd infra/vercel
export VERCEL_API_TOKEN=...            # and VERCEL_TEAM_ID=team_xxx if applicable
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=auto
export PULUMI_CONFIG_PASSPHRASE=...

pulumi login "s3://luxel-pulumi-state?endpoint=a592f6c9ed79454bf7c8ab489ece9036.r2.cloudflarestorage.com&s3ForcePathStyle=true"
pulumi stack init prod || pulumi stack select prod

# 1) discover live state + seed config (prints the config commands to run):
VERCEL_API_TOKEN=$VERCEL_API_TOKEN pnpm --filter @luxel/infra-vercel export
#    → pulumi config set web.name <name>; set teamId; seed adminSharedEnv secrets.

# 2) adopt the web project + create the admin project:
VERCEL_API_TOKEN=$VERCEL_API_TOKEN pnpm --filter @luxel/infra-vercel import   # writes imports.json
LUXEL_VC_ADOPT=1 pulumi up            # imports web + domains; creates admin + env

# 3) confirm steady state:
pulumi preview                        # web: no changes; admin: created
#    (web build/runtime commands are ignoreChanges'd, so a custom install/build
#     command in Vercel won't show as drift. If preview shows ANY web change,
#     stop and reconcile before applying.)

# 4) point the panel domain at Vercel (in the Cloudflare stack):
cd ../cloudflare
pulumi config set panelTarget cname.vercel-dns.com   # or the target Vercel shows for the admin domain
pulumi up
```

Vercel auto-deploys the admin project on the next push to `main` (it's
git-linked). To deploy immediately, trigger a deployment from the Vercel
dashboard or `vercel --prod` once, or push any commit.

After the one-time run above, **commit the seeded `Pulumi.prod.yaml`** (it now
holds `web.name`, `teamId`, and the encrypted `adminSharedEnv`) so CI can apply
it.

## CI (after bootstrap)

`.github/workflows/infra-vercel.yml` keeps this stack applied:

- **PR** touching `infra/vercel/**` → `pulumi preview` (commented on the PR).
- **Push to `main`** touching `infra/vercel/**` (or manual dispatch) → `pulumi up`.

Add repo secret **`VERCEL_API_TOKEN`** (the `R2_*` / `PULUMI_CONFIG_PASSPHRASE`
secrets are already set for the Cloudflare workflow). The admin env stays in sync
with the values committed in `adminSharedEnv`; re-seed + commit to rotate them.

## What is / isn't managed

| Managed                                  | Not managed                                    |
| ---------------------------------------- | ---------------------------------------------- |
| web project identity + git + domains     | web env vars + build/runtime commands (Vercel) |
| admin project + domains + env + git link | the panel DNS record (in `infra/cloudflare`)   |
