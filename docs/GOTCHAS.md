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

Open follow-ups that need operator credentials: Meta WhatsApp go-live
(portfolio, number, templates), a billing-enabled `GOOGLE_API_KEY`,
`PROVIDER_API_KEY` on `luxel-admin`, and moving `luxel-admin` onto the Clerk
production instance (`apps/web` runs `pk_live_*` against
`clerk.serviciosluxel.cl`; `apps/admin` still runs `pk_test_*` against
`clerk.accounts.dev`). The `cleaning-review` Workflow and `LUXEL_APP_URL` ship
with the CI worker deploy. Plan activation is done: an operator moves a
subscription to `active` at `/plans` in `apps/admin`.

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
- Keep Clerk Organizations optional on the instance. Admin gating is
  app-level.
- Hospitable's calendar endpoint clamps `start_date` to the first day of the
  running month. A request for an earlier date silently returns the same
  window, so the previous month can only come from the mirrored
  `calendar_blocks`, never from the live calendar. `end_date` is honoured
  past 120 days.
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
- Playwright e2e (`apps/web/e2e`) runs against the dev server; CI needs
  `E2E_SKIP_AUTH`.
- Cloudflare and Vercel IaC adoption is import-based. Run `gen-imports`, then
  `pulumi preview`, and confirm no changes before `pulumi up`.
