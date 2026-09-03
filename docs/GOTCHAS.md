# Toolchain and gotchas

Compacted from `AGENTS.md` sections Toolchain, Commands, CI and deployment,
Gotchas.

## Toolchain

`pnpm` on `PATH` is a broken Node 16 corepack shim. Always run:

```bash
PATH="/opt/homebrew/bin:$PATH" npx --yes pnpm@11.0.9 <args>
```

Node 22 (`.nvmrc`). Husky's pre-commit runs the broken shim: run the checks by
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
`apps/admin` from their roots; the worker deploys with `wrangler deploy`.
Details: [`DEPLOY.md`](DEPLOY.md), [`ENV.md`](ENV.md).

Open follow-ups that need operator credentials: Clerk production instance
(prod runs the dev instance), Meta WhatsApp go-live (portfolio, number,
templates). Open follow-ups in code: plan activation and a crew/cleanings
view in `apps/admin`.

## Gotchas

- Supabase local image pulls can 403 from `public.ecr.aws`; mirror from
  Docker Hub.
- Clerk keyless mode breaks next-intl routing. Use real dev keys and set
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `..._SIGN_UP_URL=/sign-up` so auth
  stays on localhost. Test user: `you+clerk_test@example.com`, OTP `424242`.
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
- Playwright e2e (`apps/web/e2e`) runs against the dev server; CI needs
  `E2E_SKIP_AUTH`.
- Cloudflare and Vercel IaC adoption is import-based. Run `gen-imports`, then
  `pulumi preview`, and confirm no changes before `pulumi up`.
