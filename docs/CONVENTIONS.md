# Conventions

Compacted from `AGENTS.md` sections Prose, Conventions.

## Prose

Write plans, docs, and PR descriptions in ASD-STE100 Simplified Technical
English: one idea per sentence, active voice, present tense, one term per
concept, sentences under 20 words. That rule covers what a maintainer reads. It
does not cover what a customer or a guest reads.

Product copy stays `es-CL`, follows [`BRAND.md`](BRAND.md) and is written in
**simplified Spanish**: short sentences, common words, one idea per sentence.
Use a full stop where a subordinate clause would go. Delete a sentence that only
reassures.

Two registers apply that rule differently:

- **Marketing surfaces** — the landing page, `/about`, `/calculator` and the
  legal pages — may persuade and reassure.
- **Product surfaces** — anything behind a login, the guest check-in page and
  the crew page. They carry only what the user needs to act: labels, values,
  errors and the notices the law requires. No greeting. No reassurance. No sentence
  that repeats what a label already says. No benefit framing.

## Code

- No comments. Anywhere. Every file this repository authors carries no comments:
  source, tests, SQL migrations, CI workflows, `wrangler.toml`, the Pulumi stack
  config and `supabase/config.toml`. Operator knowledge goes in `docs/`, not in a
  comment. Only tool directives stay (`eslint-disable`, `@ts-expect-error`), and
  a blanket `eslint-disable` is itself an error — always name the rules you
  disable. `.env.example` is the one exemption. Never add a comment to explain a
  change; that belongs in the commit message. ESLint (`luxel/no-comments`) and
  `pnpm lint:comments` enforce this.
- No hardcoded user-facing strings. Site copy lives in
  `packages/shared/src/i18n/es-CL.json`. The guest check-in page also has
  `checkin.en.json` and `checkin.pt.json` with the same key set. Locale prefix
  is `never`. The privacy policy and the terms of service deviate on purpose.
  They are long legal documents. Their copy lives in
  `privacy.{es,en,pt}.json` and `terms.{es,en,pt}.json`, behind
  `@luxel/shared/privacy` and `@luxel/shared/terms`. Both are typed objects,
  not `t()` keys. Both use the one `LegalDoc` shape in `@luxel/shared/legal`
  and render through `apps/web/src/components/legal/legal-page.tsx`.
  `apps/web/test/privacy-copy.test.ts` and `terms-copy.test.ts` hold each trio
  in step.
- Domain logic lives in `packages/core`. `apps/admin` and `apps/web` call it.
  Neither app re-implements a Hospitable call, a connection state change, a phone
  normaliser or an analytics write of its own. Add the function to `@luxel/core`
  and import it.
- Routes are English: `/calculator`, `/account`, `/properties`, `/privacy`,
  `/terms`, `/checkin/[id]`, `/cleaning/confirm/[token]`. Never a Spanish path
  segment.
- TypeScript strict. Extend `@luxel/config/tsconfig/{next,library,base}.json`.
  `infra/cloudflare` is standalone CommonJS for Pulumi.

## Commits

Conventional Commits. End the message with
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Branch off `main`.
Before pushing, run format:check, typecheck, lint, test, build. CI enforces
exactly that.
