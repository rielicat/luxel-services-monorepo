import { useTranslations } from 'next-intl';

const ITEMS = ['coverage', 'tools', 'payment', 'cancel'] as const;

export function FAQSection() {
  const t = useTranslations('faq');
  return (
    <section id="faq" className="border-border/60 bg-muted/40 border-t py-20 sm:py-24">
      <div className="container">
        <h2 className="text-center font-serif text-4xl font-medium tracking-tight sm:text-5xl">
          {t('section_title')}
        </h2>
        <dl className="divide-border border-border bg-card shadow-soft mx-auto mt-10 max-w-3xl divide-y overflow-hidden rounded-xl border">
          {ITEMS.map((key) => (
            <details key={key} className="open:bg-accent/30 group p-5 transition-colors">
              <summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium">
                <span>{t(`q.${key}` as 'q.coverage')}</span>
                <span className="text-primary text-xl transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                {t(`a.${key}` as 'a.coverage')}
              </p>
            </details>
          ))}
        </dl>
      </div>
    </section>
  );
}
