import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { Bot, TrendingUp, Sparkles, KeyRound, ArrowRight, Check } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AI_PLAN_CLP } from '@/lib/plan-pricing';
import { formatCLP } from '@/lib/utils';

export const metadata: Metadata = { title: 'Administración Airbnb con IA' };

const FEATURES = [
  { key: 'f1', icon: Bot },
  { key: 'f2', icon: TrendingUp },
  { key: 'f3', icon: Sparkles },
  { key: 'f4', icon: KeyRound },
] as const;

const STEPS = ['s1', 's2', 's3'] as const;

export default function AirbnbServicePage() {
  const t = useTranslations('services.airbnb');
  return (
    <main>
      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
        <div className="container py-20 text-center sm:py-28">
          <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            {t('eyebrow')}
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-balance font-serif text-4xl font-medium tracking-tight sm:text-6xl">
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
        <div className="border-primary/20 bg-card ring-primary/10 shadow-card relative mx-auto max-w-xl overflow-hidden rounded-3xl border p-10 text-center ring-1">
          <div aria-hidden className="bg-brand-glow pointer-events-none absolute inset-0" />
          <div className="relative">
            <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">
              {t('pricing_title')}
            </p>
            <p className="font-display mt-3 text-5xl font-bold tabular-nums">
              {formatCLP(AI_PLAN_CLP)}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">{t('pricing_suffix')}</p>
            <p className="text-muted-foreground mx-auto mt-3 flex max-w-sm items-center justify-center gap-1.5 text-sm">
              <Check className="text-success h-4 w-4 shrink-0" /> {t('pricing_note')}
            </p>
            <Button asChild variant="lime" size="xl" className="mt-8 w-full sm:w-auto">
              <Link href="/calculator?service=airbnb">
                {t('cta_primary')} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
