import { useTranslations } from 'next-intl';
import { Plug, Bot, LayoutDashboard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const STEPS = ['connect', 'automate', 'relax'] as const;
const ICONS: Record<(typeof STEPS)[number], LucideIcon> = {
  connect: Plug,
  automate: Bot,
  relax: LayoutDashboard,
};

export function HowItWorks() {
  const t = useTranslations('landing.how');
  return (
    <section id="como-funciona" className="border-border/60 bg-muted/40 border-y py-20 sm:py-24">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">
            {t('title')}
          </h2>
          <p className="text-muted-foreground mt-4">{t('subtitle')}</p>
        </div>
        <ol className="mx-auto mt-14 grid max-w-4xl gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => {
            const Icon = ICONS[step];
            return (
              <li
                key={step}
                className="border-border bg-card shadow-soft relative rounded-xl border p-6"
              >
                <span className="text-primary/15 font-display absolute right-5 top-4 text-5xl font-extrabold leading-none">
                  {i + 1}
                </span>
                <div className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display mt-5 text-lg font-semibold">
                  {t(`steps.${step}.title`)}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
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
