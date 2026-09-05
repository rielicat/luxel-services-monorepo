import { useTranslations } from 'next-intl';
import { Video, PhoneCall, Sparkles, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PLAN_COMMISSION_PCT } from '@luxel/core/plan-pricing';

const STEPS = ['video', 'connect', 'run', 'earn'] as const;
const ICONS: Record<(typeof STEPS)[number], LucideIcon> = {
  video: Video,
  connect: PhoneCall,
  run: Sparkles,
  earn: Wallet,
};

export function HowItWorks() {
  const t = useTranslations('landing.how');
  const pct = Math.round(PLAN_COMMISSION_PCT * 100);
  return (
    <section id="como-funciona" className="container py-20 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance font-serif text-4xl font-medium tracking-tight sm:text-5xl">
          {t('title')}
        </h2>
        <p className="text-muted-foreground mt-4">{t('subtitle')}</p>
      </div>
      <ol className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => {
          const Icon = ICONS[step];
          return (
            <li
              key={step}
              className="border-border bg-card shadow-soft hover:shadow-card hover:border-primary/30 hover-lift group relative rounded-xl border p-6"
            >
              <span className="text-primary/15 font-display ease-lux group-hover:text-primary/25 absolute right-5 top-4 text-5xl font-extrabold leading-none transition-colors duration-300">
                {i + 1}
              </span>
              <div className="bg-primary/10 text-primary ease-lux flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-display mt-5 text-lg font-semibold">
                {t(`steps.${step}.title`)}
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {t(`steps.${step}.body`, { pct })}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
