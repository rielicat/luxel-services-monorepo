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
- No hardcoded user-facing strings. Site copy lives in
  `packages/shared/src/i18n/es-CL.json`. The guest check-in page also has
  `checkin.en.json` and `checkin.pt.json` with the same key set. Locale prefix
  is `never`.
- Routes are English: `/calculator`, `/account`, `/properties`,
  `/checkin/[token]`, `/cleaning/confirm/[token]`. Never a Spanish path
  segment.
- TypeScript strict. Extend `@luxel/config/tsconfig/{next,library,base}.json`.
  `infra/cloudflare` is standalone CommonJS for Pulumi.

## Commits

Conventional Commits. End the message with
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Branch off `main`.
Before pushing, run format:check, typecheck, lint, test, build. CI enforces
exactly that.
