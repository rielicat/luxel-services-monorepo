import { useTranslations } from 'next-intl';
import { Calculator, CalendarCheck, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const STEPS = ['quote', 'book', 'relax'] as const;
const ICONS: Record<(typeof STEPS)[number], LucideIcon> = {
  quote: Calculator,
  book: CalendarCheck,
  relax: Sparkles,
};

export function HowItWorks() {
  const t = useTranslations('landing.how');
  return (
    <section className="border-t border-border/60 bg-muted/30 py-20">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h2>
          <p className="mt-4 text-muted-foreground">{t('subtitle')}</p>
        </div>
        <ol className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-3">
          {STEPS.map((step) => {
            const Icon = ICONS[step];
            return (
              <li key={step} className="rounded-lg border border-border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 font-semibold">{t(`steps.${step}.title`)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t(`steps.${step}.description`)}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
