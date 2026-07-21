import { useTranslations } from 'next-intl';
import { Bot, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';

/** Homepage services block — AirBnB management as the flagship (emphasized),
 *  cleaning as the second line. Replaces the old standalone AirBnB section. */
export function ServicesOverview() {
  const t = useTranslations('landing.services');
  return (
    <section id="servicios" className="container py-20 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t('title')}</h2>
        <p className="text-muted-foreground mt-4 text-lg">{t('subtitle')}</p>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl gap-5 lg:grid-cols-5">
        {/* Flagship — AirBnB (wider, primary-accented) */}
        <Link
          href="/services/airbnb-management"
          className="border-primary/20 bg-card ring-primary/10 shadow-card hover:shadow-lift group relative overflow-hidden rounded-2xl border p-8 ring-1 transition-all lg:col-span-3"
        >
          <div aria-hidden className="bg-brand-glow pointer-events-none absolute inset-0" />
          <div className="relative">
            <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              {t('airbnb_badge')}
            </span>
            <div className="bg-primary/10 text-primary mt-5 flex h-12 w-12 items-center justify-center rounded-xl">
              <Bot className="h-6 w-6" />
            </div>
            <h3 className="font-display mt-5 text-2xl font-semibold">{t('airbnb_title')}</h3>
            <p className="text-muted-foreground mt-2 max-w-md">{t('airbnb_body')}</p>
            <span className="text-primary mt-6 inline-flex items-center gap-1.5 text-sm font-semibold">
              {t('airbnb_cta')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>

        {/* Second line — cleaning */}
        <Link
          href="/services/cleaning"
          className="border-border bg-card shadow-card hover:shadow-lift group flex flex-col rounded-2xl border p-8 transition-all lg:col-span-2"
        >
          <span className="bg-muted text-muted-foreground inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            {t('cleaning_badge')}
          </span>
          <div className="bg-accent text-accent-foreground mt-5 flex h-12 w-12 items-center justify-center rounded-xl">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="font-display mt-5 text-2xl font-semibold">{t('cleaning_title')}</h3>
          <p className="text-muted-foreground mt-2">{t('cleaning_body')}</p>
          <span className="text-primary mt-6 inline-flex items-center gap-1.5 text-sm font-semibold">
            {t('cleaning_cta')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </section>
  );
}
