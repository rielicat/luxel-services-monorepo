import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { FileWarning, Info, ShieldQuestion } from 'lucide-react';
import { privacyDoc, type PrivacyDoc } from '@luxel/shared/privacy';
import { GUEST_LOCALES, type GuestLocale } from '@luxel/shared/i18n';
import { guestLang, resolveGuestLang } from '@luxel/core/checkin/lang';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ lang?: string | string[] }>;

const LANG_KEY = { es: 'lang_es', en: 'lang_en', pt: 'lang_pt' } as const;

const PLACEHOLDER = /(\[[^\]]+\])/g;
const IS_PLACEHOLDER = /^\[[^\]]+\]$/;

async function pickLang(searchParams: SearchParams): Promise<GuestLocale> {
  const { lang } = await searchParams;
  const raw = Array.isArray(lang) ? lang[0] : lang;
  const asked = guestLang(raw);
  if (asked) return asked;
  return resolveGuestLang(null, (await headers()).get('accept-language'));
}

function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(PLACEHOLDER).map((part, i) =>
        IS_PLACEHOLDER.test(part) ? (
          <span
            key={i}
            className="bg-warning/20 text-foreground ring-warning/50 rounded px-1.5 py-0.5 font-mono text-[0.8em] font-semibold ring-1"
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const doc: PrivacyDoc = privacyDoc(await pickLang(searchParams));
  return {
    title: doc.meta_title,
    description: doc.meta_description,
    robots: { index: false, follow: false },
    alternates: {
      languages: Object.fromEntries(GUEST_LOCALES.map((l) => [l, `/privacy?lang=${l}`])),
    },
  };
}

export default async function PrivacyPage({ searchParams }: { searchParams: SearchParams }) {
  const lang = await pickLang(searchParams);
  const doc = privacyDoc(lang);

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
              href={`/privacy?lang=${l}`}
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

      <section
        aria-labelledby="placeholders-title"
        className="border-border bg-card shadow-soft mt-5 grid gap-4 rounded-2xl border p-6"
      >
        <div className="flex items-start gap-3">
          <ShieldQuestion className="text-primary mt-0.5 h-5 w-5 shrink-0" />
          <h2 id="placeholders-title" className="font-display text-lg font-semibold">
            {doc.placeholders_title}
          </h2>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">{doc.placeholders_body}</p>
        <ul className="grid gap-2 text-sm">
          {doc.placeholders_items.map((item, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
              <Prose text={item} />
            </li>
          ))}
        </ul>
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
                <p key={j}>
                  <Prose text={p} />
                </p>
              ))}
            </div>
            {s.rows.length > 0 && (
              <dl className="divide-border border-border mt-6 grid divide-y rounded-xl border">
                {s.rows.map((row) => (
                  <div key={row.name} className="grid gap-1 p-4 sm:grid-cols-3 sm:gap-4">
                    <dt className="font-medium">{row.name}</dt>
                    <dd className="text-muted-foreground text-sm leading-relaxed sm:col-span-2">
                      <Prose text={row.detail} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
      </div>

      <p className="text-muted-foreground border-border mt-14 flex items-start gap-2 border-t pt-6 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {doc.updated_label} {doc.updated_value} · {doc.version_label} {doc.version_value}
        </span>
      </p>
    </main>
  );
}
