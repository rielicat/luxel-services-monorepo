import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';

export function PricingTeaser() {
  const t = useTranslations('landing.pricing');
  return (
    <section className="container py-20 sm:py-24">
      <div className="border-border shadow-glow from-primary to-secondary relative mx-auto max-w-4xl overflow-hidden rounded-2xl border bg-gradient-to-br p-10 text-center sm:p-14">
        <div aria-hidden className="bg-dot-grid absolute inset-0 opacity-20" />
        <div className="relative">
          <h2 className="text-primary-foreground font-serif text-4xl font-medium tracking-tight sm:text-5xl">
            {t('title')}
          </h2>
          <p className="text-primary-foreground/85 mx-auto mt-4 max-w-xl">{t('subtitle')}</p>
          <Button asChild variant="default" size="xl" className="mt-8">
            <Link href="/calculator">{t('cta')}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
