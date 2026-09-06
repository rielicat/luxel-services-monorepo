# Toolchain and gotchas

Compacted from `AGENTS.md` sections Toolchain, Commands, CI and deployment,
Gotchas.

## Toolchain

`pnpm` on `PATH` is a broken Node 16 corepack shim. Always run:

```bash
PATH="/opt/homebrew/bin:$PATH" npx --yes pnpm@11.0.9 <args>
```

Node 24 (`.nvmrc`); eve needs it and `engine-strict=true` enforces it. Vercel's
Node version is pinned in `infra/vercel`, not by `.nvmrc`. Husky's pre-commit
runs the broken shim: run the checks by
hand, then `git commit --no-verify`.

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

## CI and deployment

`.github/workflows/ci.yml`: frozen install → format:check → typecheck → lint
→ test → build. `db-migrate.yml` applies migrations to prod Supabase.
`infra.yml` / `infra-vercel.yml` run Pulumi. Vercel deploys `apps/web` and
`apps/admin` from their roots; `worker-deploy.yml` runs `wrangler deploy` on a
push to `main` touching `workers/**`.
Details: [`DEPLOY.md`](DEPLOY.md), [`ENV.md`](ENV.md).

No follow-up needs operator credentials. Meta WhatsApp is live,
`PROVIDER_API_KEY` is set on `luxel-admin`, and the walkthrough model runs on
the AI Gateway credential. The `cleaning-review` Workflow and `LUXEL_APP_URL` ship with
the CI worker deploy. Plan activation is done: an operator moves a subscription
to `active` at `/plans` in `apps/admin`.

The two apps run separate Clerk applications on purpose. `apps/web` uses the
production instance at `clerk.serviciosluxel.cl`; `apps/admin` uses its own
`pk_test_*` instance on `clerk.accounts.dev`. Hosts and operators never share a
session. Do not point both at one instance.

## Gotchas

- Supabase local image pulls can 403 from `public.ecr.aws`; mirror from
  Docker Hub.
- PostgREST refuses an `or=` filter on an **UPDATE**: it answers a bare
  `42703` "column does not exist" even when the column is there. The same
  filter is fine on a `select`. `claimDraft` in `lib/cleaning/inventory.ts`
  reads the row first, then updates with a compare-and-swap on the old
  `claimed_at`. Do not reach for `.or()` on an update.
- A migration applied with `psql` does not reload PostgREST's schema cache. Run
  `NOTIFY pgrst, 'reload schema';`, or `pnpm supabase:reset`, or every new column
  reads as missing over the REST API while `\d` shows it.
- Clerk keyless mode breaks next-intl routing. Use real dev keys and set
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `..._SIGN_UP_URL=/sign-up` so auth
  stays on localhost. Test user: `you+clerk_test@example.com`, OTP `424242`.
- A Clerk production instance serves its own frontend API from `clerk.<domain>`,
  not `clerk.accounts.dev`. Nothing loads until the five CNAMEs resolve; the
  failure is a bare `ERR_NAME_NOT_RESOLVED` on a page that still renders. The
  records are Pulumi's (`clerkMailHash` in `infra/cloudflare/Pulumi.prod.yaml`);
  never use Clerk's "Configure automatically" flow. A production instance also
  starts with an empty user pool and no organizations.
- Promoting Clerk to production orphans every existing host. `customers` keys on
  the unique `clerk_user_id`, so the same person signing in on the production
  instance gets a second row with the same email and a new uuid. Assignments and
  `properties.owner_id` still point at the first row, so the host sees nothing,
  and the duplicate email makes `autoAssignListings` ambiguous. Fix it with one
  write: move the original row onto the new `clerk_user_id` and delete the
  duplicate. Never match a customer by email; it is not unique.
- Keep Clerk Organizations optional on the instance. Admin gating is
  app-level.
- Hospitable's calendar endpoint clamps `start_date` to the first day of the
  running month. A request for an earlier date silently returns the same
  window, so the previous month can only come from the mirrored
  `calendar_blocks`, never from the live calendar. `end_date` is honoured
  past 120 days.
- Turborepo 2 runs tasks in **strict environment mode**. A task sees only the
  variables its `turbo.json` entry names. The `test` task named none, so vitest
  saw no Supabase credentials and every live test skipped while the run stayed
  green. Name a variable in the task before a test can read it.
- Supabase free tier auto-pauses. A paused project looks deleted and blocks
  prod migrations while CI stays green.
- Vercel Hobby rejects sub-daily crons in `vercel.json` and silently blocks
  every deploy. Do not add a `vercel.json` cron.
- Cloudflare Workflows need `compatibility_date >= 2024-10-22`.
  `workers/whatsapp/wrangler.toml` pins exactly that. Do not lower it.
- `cloudflare:workers` does not resolve under vitest, and the worker entrypoint
  re-exports the Workflow class. `apps/web/vitest.config.ts` aliases the module
  to `test/stubs/cloudflare-workers.ts`. Without that alias
  `whatsapp-bridge.e2e.test.ts` fails to load the worker at all.
- An eve turn is a Vercel Workflow, and it outlives a short function budget. A
  turn that uses tools runs for tens of seconds, and the stream that follows it
  reaches its own limit. `runAgentTurn` waits for that stream inside the caller's
  request, so the caller's `maxDuration` must exceed `AGENT_TURN_BUDGET_MS` plus
  the caller's own reads and writes. It was 55 seconds inside a 60 second page,
  and the platform killed the action with a 504 before the dispatcher could
  answer. Pass `budgetMs` when a route allows less than 300 seconds.
- Vercel Hobby caps deployments at 100 a day, and PR previews count. Past the
  cap Vercel creates no deployment row, so production silently stays behind while
  CI is green. The tell is the GitHub commit status, not the Vercel dashboard:
  `gh api repos/<owner>/<repo>/commits/<sha>/status` answers
  `Deployment rate limited - retry in 24 hours`. Waiting or Pro clears it; a
  manual redeploy is capped too.
- A `message.created` webhook once left the message unimported, and a manual
  sync three minutes later picked it up. The cause is not proven, because the
  route swallowed the error. It now logs `webhook.ingest_failed`, and it retries
  `ingestThread` at 0, 5 and 20 seconds. A pass that imports nothing logs
  `webhook.ingest_empty`. Never restore a bare `catch {}` there.
- A `'use server'` module must not re-export a type. `export type { X }` there
  survives the Turbopack dev transform, so the route answers 500 with
  `ReferenceError: X is not defined`. `next build` passes, so CI never sees it.
  `apps/admin/(panel)/inbox` failed this way. Import the type straight from the
  module that declares it.
- Playwright e2e (`apps/web/e2e`) runs against the dev server; CI needs
  `E2E_SKIP_AUTH`.
- Cloudflare and Vercel IaC adoption is import-based. Run `gen-imports`, then
  `pulumi preview`, and confirm no changes before `pulumi up`.
