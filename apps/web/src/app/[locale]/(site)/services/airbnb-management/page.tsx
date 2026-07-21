import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { Bot, TrendingUp, Sparkles, KeyRound, ArrowRight, Check } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AI_PLAN_CLP, AI_PLAN_HANDOFF_CLP } from '@/lib/plan-pricing';
import { formatCLP, cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Gestiona tu Airbnb con Agentes de IA' };

const FEATURES = [
  { key: 'f1', icon: Bot },
  { key: 'f2', icon: TrendingUp },
  { key: 'f3', icon: Sparkles },
  { key: 'f4', icon: KeyRound },
] as const;

const STEPS = ['s1', 's2', 's3'] as const;
const INCLUDED = ['incl_1', 'incl_2', 'incl_3', 'incl_4', 'incl_5'] as const;

export default function AirbnbServicePage() {
  const t = useTranslations('services.airbnb');
  return (
    <main>
      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
        <div className="container py-20 text-center sm:py-28">
          <h1 className="mx-auto max-w-3xl text-balance font-serif text-4xl font-medium tracking-tight sm:text-6xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-pretty text-lg">
            {t('subtitle')}
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild variant="lime" size="xl" className="w-full sm:w-auto">
              <Link href="/calculator?service=airbnb">{t('cta_primary')}</Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="w-full sm:w-auto">
              <Link href="/properties">{t('cta_secondary')}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container py-6">
        <h2 className="font-display text-center text-3xl font-semibold tracking-tight">
          {t('features_title')}
        </h2>
        <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ key, icon: Icon }) => (
            <Card key={key}>
              <CardContent className="p-6">
                <div className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display mt-5 font-semibold">{t(`${key}_title`)}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {t(`${key}_body`)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="container py-16 sm:py-20">
        <h2 className="font-display text-center text-3xl font-semibold tracking-tight">
          {t('how_title')}
        </h2>
        <div className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-3">
          {STEPS.map((key, i) => (
            <div key={key} className="text-center">
              <span className="bg-primary text-primary-foreground font-display mx-auto flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold">
                {i + 1}
              </span>
              <h3 className="font-display mt-4 font-semibold">{t(`${key}_title`)}</h3>
              <p className="text-muted-foreground mt-2 text-sm">{t(`${key}_body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container pb-24">
        <h2 className="font-display text-center text-3xl font-semibold tracking-tight">
          {t('pricing_title')}
        </h2>
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

        <Button asChild variant={featured ? 'lime' : 'outline'} size="lg" className="mt-6 w-full">
          <Link href="/calculator?service=airbnb">
            {t('cta_primary')} <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
