import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { Calculator, CalendarCheck, ShieldCheck, CreditCard, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Plan de Aseo profesional' };

const FEATURES = [
  { key: 'f1', icon: Calculator },
  { key: 'f2', icon: CalendarCheck },
  { key: 'f3', icon: ShieldCheck },
  { key: 'f4', icon: CreditCard },
] as const;

const STEPS = ['s1', 's2', 's3'] as const;

export default function CleaningServicePage() {
  const t = useTranslations('services.cleaning');
  return (
    <main>
      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
        <div className="container py-20 text-center sm:py-28">
          <span className="text-secondary text-sm font-semibold uppercase tracking-wide">
            {t('eyebrow')}
          </span>
          <h1 className="mx-auto mt-4 max-w-3xl text-balance font-serif text-4xl font-medium tracking-tight sm:text-6xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-pretty text-lg">
            {t('subtitle')}
          </p>
          <div className="mt-9">
            <Button asChild variant="lime" size="xl">
              <Link href="/calculator?service=cleaning">
                {t('cta_primary')} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
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
                <div className="bg-accent text-accent-foreground flex h-11 w-11 items-center justify-center rounded-xl">
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
              <span className="bg-secondary text-secondary-foreground font-display mx-auto flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold">
                {i + 1}
              </span>
              <h3 className="font-display mt-4 font-semibold">{t(`${key}_title`)}</h3>
              <p className="text-muted-foreground mt-2 text-sm">{t(`${key}_body`)}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Button asChild variant="outline" size="lg">
            <Link href="/calculator?service=cleaning">{t('cta_primary')}</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
