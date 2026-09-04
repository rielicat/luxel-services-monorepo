# Conventions

Compacted from `AGENTS.md` sections Prose, Conventions.

## Prose

Write plans, docs, and PR descriptions in ASD-STE100 Simplified Technical
English: one idea per sentence, active voice, present tense, one term per
concept, sentences under 20 words. Product copy stays `es-CL` and follows
[`BRAND.md`](BRAND.md).

## Code

- No code comments. Source and tests explain themselves. Only tool directives
  stay (`eslint-disable`, `@ts-expect-error`).
  The ban covers `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.css` and the SQL
  migrations in `supabase/migrations`. ESLint (`luxel/no-comments`) and
  `pnpm lint:comments` enforce it. A blanket `eslint-disable` is itself an error;
  always name the rules you disable. Only CI workflows, Pulumi stack config,
  `wrangler.toml`, `supabase/config.toml` and `.env.example` keep their operator
  comments.
- No hardcoded user-facing strings. Site copy lives in
  `packages/shared/src/i18n/es-CL.json`. The guest check-in page also has
  `checkin.en.json` and `checkin.pt.json` with the same key set. Locale prefix
  is `never`. The privacy policy deviates on purpose: it is a long legal
  document, so its copy lives in `privacy.{es,en,pt}.json` behind
  `@luxel/shared/privacy`, as a typed object rather than `t()` keys.
  `apps/web/test/privacy-copy.test.ts` holds the three files in step.
- Routes are English: `/calculator`, `/account`, `/properties`, `/privacy`,
  `/checkin/[id]`, `/cleaning/confirm/[token]`. Never a Spanish path
  segment.
- TypeScript strict. Extend `@luxel/config/tsconfig/{next,library,base}.json`.
  `infra/cloudflare` is standalone CommonJS for Pulumi.

## Commits

Conventional Commits. End the message with
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Branch off `main`.
Before pushing, run format:check, typecheck, lint, test, build. CI enforces
exactly that.
