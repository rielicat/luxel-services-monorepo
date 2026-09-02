import { useTranslations } from 'next-intl';
import { Bot, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';

export function ServicesOverview() {
  const t = useTranslations('landing.services');
  return (
    <section id="servicios" className="container py-20 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t('title')}</h2>
        <p className="text-muted-foreground mt-4 text-lg">{t('subtitle')}</p>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl gap-5 lg:grid-cols-5">
        <Link
          href="/services/airbnb"
          className="border-primary/20 bg-card ring-primary/10 shadow-card hover:shadow-lift hover-lift group relative overflow-hidden rounded-2xl border p-8 ring-1 lg:col-span-3"
        >
          <div
            aria-hidden
            className="bg-brand-glow pointer-events-none absolute inset-0 opacity-80 transition-opacity duration-500 group-hover:opacity-100"
          />
          <div className="relative">
            <div className="bg-primary/10 text-primary ease-lux flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110">
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

        <Link
          href="/services/cleaning"
          className="border-border bg-card shadow-card hover:shadow-lift hover-lift hover:border-primary/30 group flex flex-col rounded-2xl border p-8 lg:col-span-2"
        >
          <div className="bg-primary/10 text-primary ease-lux flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110">
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
