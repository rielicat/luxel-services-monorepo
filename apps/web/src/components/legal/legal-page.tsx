import { headers } from 'next/headers';
import { FileWarning, Info, ArrowUpRight } from 'lucide-react';
import type { LegalDoc } from '@luxel/shared/legal';
import { GUEST_LOCALES, type GuestLocale } from '@luxel/shared/i18n';
import { guestLang, resolveGuestLang } from '@luxel/core/checkin/lang';

export type LegalSearchParams = Promise<{ lang?: string | string[] }>;

const LANG_KEY = { es: 'lang_es', en: 'lang_en', pt: 'lang_pt' } as const;

export async function pickLegalLang(searchParams: LegalSearchParams): Promise<GuestLocale> {
  const { lang } = await searchParams;
  const raw = Array.isArray(lang) ? lang[0] : lang;
  const asked = guestLang(raw);
  if (asked) return asked;
  return resolveGuestLang(null, (await headers()).get('accept-language'));
}

export function legalLanguageAlternates(basePath: string): Record<string, string> {
  return Object.fromEntries(GUEST_LOCALES.map((l) => [l, `${basePath}?lang=${l}`]));
}

export function LegalPage({
  doc,
  lang,
  basePath,
  siblingPath,
}: {
  doc: LegalDoc;
  lang: GuestLocale;
  basePath: string;
  siblingPath: string;
}) {
  return (
    <main lang={lang} className="container max-w-3xl py-14 sm:py-20">
      <header className="grid gap-5">
        <h1 className="text-balance font-serif text-4xl font-medium tracking-tight sm:text-5xl">
          {doc.title}
        </h1>
        <p className="text-muted-foreground text-pretty text-lg">{doc.lead}</p>
        <dl className="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt>{doc.updated_label}</dt>
            <dd className="text-foreground font-medium">{doc.updated_value}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>{doc.version_label}</dt>
            <dd className="text-foreground font-medium">{doc.version_value}</dd>
          </div>
        </dl>
        <nav aria-label={doc.lang_label} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{doc.lang_label}</span>
          {GUEST_LOCALES.map((l) => (
            <a
              key={l}
              href={`${basePath}?lang=${l}`}
              hrefLang={l}
              aria-current={l === lang ? 'true' : undefined}
              className={
                l === lang
                  ? 'bg-primary text-primary-foreground rounded-full px-3 py-1 font-medium'
                  : 'border-border hover:border-primary/40 hover:text-foreground text-muted-foreground rounded-full border px-3 py-1 transition-colors'
              }
            >
              {doc[LANG_KEY[l]]}
            </a>
          ))}
        </nav>
      </header>

      <section
        aria-labelledby="draft-title"
        className="border-warning/40 bg-warning/10 mt-10 grid gap-4 rounded-2xl border p-6"
      >
        <div className="flex items-start gap-3">
          <FileWarning className="text-warning mt-0.5 h-5 w-5 shrink-0" />
          <h2 id="draft-title" className="font-display text-lg font-semibold">
            {doc.draft_title}
          </h2>
        </div>
        <div className="grid gap-3 text-sm leading-relaxed">
          {doc.draft_body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      <nav aria-labelledby="toc-title" className="mt-12">
        <h2 id="toc-title" className="font-display text-sm font-semibold uppercase tracking-wide">
          {doc.toc_title}
        </h2>
        <ol className="text-muted-foreground mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {doc.sections.map((s, i) => (
            <li key={s.id} className="flex gap-2">
              <span className="tabular-nums">{i + 1}.</span>
              <a href={`#${s.id}`} className="hover:text-foreground transition-colors">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-14 grid gap-12">
        {doc.sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              <span className="text-muted-foreground mr-2 tabular-nums">{i + 1}.</span>
              {s.title}
            </h2>
            <p className="border-primary/40 bg-accent/40 text-accent-foreground mt-4 rounded-r-lg border-l-4 py-3 pl-4 pr-3 text-[0.95rem] leading-relaxed">
              {s.plain}
            </p>
            <div className="mt-4 grid gap-3 leading-relaxed">
              {s.body.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
            {s.rows.length > 0 && (
              <dl className="divide-border border-border mt-6 grid divide-y rounded-xl border">
                {s.rows.map((row) => (
                  <div key={row.name} className="grid gap-1 p-4 sm:grid-cols-3 sm:gap-4">
                    <dt className="font-medium">{row.name}</dt>
                    <dd className="text-muted-foreground text-sm leading-relaxed sm:col-span-2">
                      {row.detail}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
      </div>

      <div className="border-border mt-14 grid gap-4 border-t pt-6">
        <p className="text-sm">
          <span className="text-muted-foreground">{doc.sibling_label} </span>
          <a
            href={`${siblingPath}?lang=${lang}`}
            hrefLang={lang}
            className="text-primary hover:text-foreground inline-flex items-center gap-1 font-medium underline underline-offset-4 transition-colors"
          >
            {doc.sibling_title}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </p>
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {doc.updated_label} {doc.updated_value} · {doc.version_label} {doc.version_value}
          </span>
        </p>
      </div>
    </main>
  );
}
