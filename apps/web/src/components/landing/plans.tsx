import { useTranslations } from 'next-intl';
import { Check, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/sections/section-heading';
import { PLAN_KEYS } from '@/lib/plan-pricing';
import { planDesc, planName, planPriceLine } from '@/lib/plan-copy';

export function Plans() {
  const t = useTranslations('landing.plans');
  const tp = useTranslations('plans');
  return (
    <section id="planes" className="border-border/60 bg-muted/40 border-y py-20 sm:py-24">
      <div className="container">
        <SectionHeading title={t('title')} subtitle={t('subtitle')} />
        <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-3">
          {PLAN_KEYS.map((plan) => (
            <div
              key={plan}
              className="border-border bg-card shadow-soft hover:border-primary/30 hover:shadow-lift hover-lift flex flex-col rounded-2xl border p-7"
            >
              <h3 className="font-display text-lg font-semibold">{planName(tp, plan)}</h3>
              <p className="font-display mt-4 text-2xl font-bold tabular-nums">
                {planPriceLine(tp, plan)}
              </p>
              <p className="text-muted-foreground text-sm">{tp('per_listing')}</p>
              <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
                {planDesc(tp, plan)}
              </p>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mx-auto mt-8 flex max-w-3xl items-start justify-center gap-2 text-pretty text-center text-sm">
          <Check className="text-success mt-0.5 h-4 w-4 shrink-0" />
          <span>{tp('included')}</span>
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild variant="default" size="xl">
            <Link href="/calculator">
              {t('cta')} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
