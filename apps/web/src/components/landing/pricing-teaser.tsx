import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';

export function PricingTeaser() {
  const t = useTranslations('landing.pricing');
  return (
    <section className="container py-20">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-gradient-to-br from-accent/40 via-card to-card p-10 text-center shadow-sm">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{t('subtitle')}</p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/calculadora">{t('cta')}</Link>
        </Button>
      </div>
    </section>
  );
}
