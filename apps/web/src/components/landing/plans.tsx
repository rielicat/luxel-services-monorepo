import { useTranslations } from 'next-intl';
import { Check, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/sections/section-heading';
import { PLAN_COMMISSION_PCT } from '@luxel/core/plan-pricing';
import { planDesc, planName, planPriceLine } from '@/lib/plan-copy';

const INCLUDED = [
  'inc_pricing',
  'inc_guests',
  'inc_cleaning',
  'inc_inventory',
  'inc_repairs',
  'inc_report',
] as const;

const FLOW = ['flow_guest', 'flow_host', 'flow_fee', 'flow_cleaning'] as const;

export function Plans() {
  const t = useTranslations('landing.plans');
  const tp = useTranslations('plans');
  const pct = Math.round(PLAN_COMMISSION_PCT * 100);

  return (
    <section id="planes" className="border-border/60 bg-muted/40 border-y py-20 sm:py-24">
      <div className="container">
        <SectionHeading title={t('title')} subtitle={t('subtitle', { pct })} />

        <div className="border-border bg-card shadow-soft mx-auto mt-12 grid max-w-4xl gap-8 rounded-3xl border p-7 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
          <div>
            <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">
              {planName(tp)}
            </p>
            <p className="font-display text-primary mt-3 text-pretty text-3xl font-bold tabular-nums sm:text-4xl">
              {planPriceLine(tp)}
            </p>
            <p className="text-muted-foreground mt-2 text-sm">{tp('per_listing')}</p>
            <p className="mt-6 text-pretty leading-relaxed">{planDesc(tp)}</p>
            <p className="text-muted-foreground mt-3 text-pretty text-sm leading-relaxed">
              {tp('billing', { pct })}
            </p>

            <div className="border-border/60 mt-6 border-t pt-6">
              <p className="text-sm font-semibold">{tp('flow_title')}</p>
              <ol className="text-muted-foreground mt-3 grid gap-2 text-sm">
                {FLOW.map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <ArrowRight className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                    <span>{tp(key, { pct })}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <ul className="border-border/60 grid content-start gap-3 border-t pt-7 sm:grid-cols-2 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
            {INCLUDED.map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm">
                <Check className="text-success mt-0.5 h-4 w-4 shrink-0" />
                <span>{tp(key)}</span>
              </li>
            ))}
          </ul>
        </div>

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
