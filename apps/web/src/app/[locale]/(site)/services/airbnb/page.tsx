import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { Bot, TrendingUp, Sparkles, KeyRound, ArrowRight, Check } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { ServiceHero } from '@/components/sections/service-hero';
import { SectionHeading } from '@/components/sections/section-heading';
import { FeatureGrid } from '@/components/sections/feature-grid';
import { Steps } from '@/components/sections/steps';
import { AI_PLAN_CLP, AI_PLAN_HANDOFF_CLP } from '@/lib/plan-pricing';
import { formatCLP, cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Gestiona tu Airbnb con Agentes de IA' };

const FEATURE_ICONS = [Bot, TrendingUp, Sparkles, KeyRound];
const STEPS = ['s1', 's2', 's3'] as const;
const INCLUDED = ['incl_1', 'incl_2', 'incl_3', 'incl_4', 'incl_5'] as const;

export default function AirbnbServicePage() {
  const t = useTranslations('services.airbnb');
  const features = FEATURE_ICONS.map((icon, i) => ({
    icon,
    title: t(`f${i + 1}_title`),
    body: t(`f${i + 1}_body`),
  }));
  const steps = STEPS.map((key) => ({ title: t(`${key}_title`), body: t(`${key}_body`) }));

  return (
    <main>
      <ServiceHero
        title={t('title')}
        subtitle={t.rich('subtitle', {
          hl: (chunks) => <span className="text-primary font-semibold">{chunks}</span>,
        })}
      >
        <Button asChild variant="default" size="xl" className="w-full sm:w-auto">
          <Link href="/calculator?service=airbnb">{t('cta_primary')}</Link>
        </Button>
        <Button asChild variant="outline" size="xl" className="w-full sm:w-auto">
          <Link href="/properties">{t('cta_secondary')}</Link>
        </Button>
      </ServiceHero>

      <section className="container py-6">
        <SectionHeading title={t('features_title')} />
        <FeatureGrid features={features} tone="primary" />
      </section>

      <section className="container py-16 sm:py-20">
        <SectionHeading title={t('how_title')} />
        <Steps steps={steps} tone="primary" />
      </section>

      <section className="container pb-24">
        <SectionHeading title={t('pricing_title')} />
        <div className="mx-auto mt-12 grid max-w-3xl items-start gap-5 sm:grid-cols-2">
          <Tier t={t} name={t('tier_base_name')} desc={t('tier_base_desc')} price={AI_PLAN_CLP} />
          <Tier
            t={t}
            name={t('tier_pro_name')}
            desc={t('tier_pro_desc')}
            price={AI_PLAN_HANDOFF_CLP}
            extra={t('tier_pro_extra')}
            handoff={t('incl_handoff')}
            featured
          />
        </div>
        <p className="text-muted-foreground mt-6 text-center text-sm">{t('price_note')}</p>
      </section>
    </main>
  );
}

function Tier({
  t,
  name,
  desc,
  price,
  extra,
  handoff,
  featured,
}: {
  t: (key: string) => string;
  name: string;
  desc: string;
  price: number;
  extra?: string;
  handoff?: string;
  featured?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-card relative flex flex-col overflow-hidden rounded-2xl border p-7',
        featured
          ? 'border-primary/30 ring-primary/15 shadow-card ring-1'
          : 'border-border shadow-soft',
      )}
    >
      {featured && (
        <div aria-hidden className="bg-brand-glow pointer-events-none absolute inset-0" />
      )}
      <div className="relative flex flex-1 flex-col">
        <h3 className="font-display text-lg font-semibold">{name}</h3>
        <p className="text-muted-foreground mt-1 text-sm">{desc}</p>
        <p className="font-display mt-5 text-4xl font-bold tabular-nums">{formatCLP(price)}</p>
        <p className="text-muted-foreground text-sm">{t('price_suffix')}</p>

        <ul className="mt-5 grid flex-1 gap-2">
          {handoff && (
            <li className="text-foreground flex items-start gap-2 text-sm font-medium">
              <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" /> {handoff}
            </li>
          )}
          {INCLUDED.map((k) => (
            <li key={k} className="text-muted-foreground flex items-start gap-2 text-sm">
              <Check className="text-success mt-0.5 h-4 w-4 shrink-0" /> {t(k)}
            </li>
          ))}
        </ul>

        {extra && <p className="text-muted-foreground mt-4 text-xs">{extra}</p>}

        <Button
          asChild
          variant={featured ? 'default' : 'outline'}
          size="lg"
          className="mt-6 w-full"
        >
          <Link href="/properties">
            {t('cta_start')} <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
