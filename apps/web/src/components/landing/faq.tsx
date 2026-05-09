import { useTranslations } from 'next-intl';

const ITEMS = ['coverage', 'tools', 'payment', 'cancel'] as const;

export function FAQSection() {
  const t = useTranslations('faq');
  return (
    <section className="border-t border-border/60 py-20">
      <div className="container">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('section_title')}
        </h2>
        <dl className="mx-auto mt-10 max-w-3xl divide-y divide-border rounded-lg border border-border">
          {ITEMS.map((key) => (
            <details key={key} className="group p-5">
              <summary className="flex cursor-pointer items-center justify-between text-base font-medium">
                <span>{t(`q.${key}` as 'q.coverage')}</span>
                <span className="text-muted-foreground transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">
                {t(`a.${key}` as 'a.coverage')}
              </p>
            </details>
          ))}
        </dl>
      </div>
    </section>
  );
}
