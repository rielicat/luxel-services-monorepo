import { useTranslations } from 'next-intl';
import { Sparkles, ShieldCheck, CalendarClock, CreditCard, Zap } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';

const TRUST = [
  { key: 'instant', Icon: Zap },
  { key: 'operators', Icon: ShieldCheck },
  { key: 'flexible', Icon: CalendarClock },
  { key: 'secure', Icon: CreditCard },
] as const;

export function Hero() {
  const t = useTranslations('landing.hero');
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="bg-dot-grid pointer-events-none absolute inset-0 -z-10 opacity-50 [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]"
      />

      <div className="container py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <span className="border-border/70 glass text-muted-foreground animate-fade-in-up shadow-soft mx-auto inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium">
            <Sparkles className="text-secondary h-3.5 w-3.5" />
            {t('eyebrow')}
          </span>

          <h1 className="animate-fade-in-up mt-7 text-balance font-serif text-5xl font-medium leading-[1.02] tracking-tight [animation-delay:80ms] sm:text-7xl">
            {t('title_lead')}{' '}
            <span className="text-gradient-brand italic">{t('title_accent')}</span>
          </h1>

          <p className="text-muted-foreground animate-fade-in-up mx-auto mt-7 max-w-2xl text-pretty text-lg [animation-delay:160ms]">
            {t('subtitle')}
          </p>

          <div className="animate-fade-in-up mt-10 flex flex-col items-center justify-center gap-3 [animation-delay:240ms] sm:flex-row">
            <Button asChild variant="lime" size="xl" className="w-full sm:w-auto">
              <Link href="/calculator?service=airbnb">{t('cta_primary')}</Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="w-full sm:w-auto">
              <Link href="/services/airbnb">{t('cta_secondary')}</Link>
            </Button>
          </div>

          <ul className="text-muted-foreground animate-fade-in-up mt-11 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm [animation-delay:320ms]">
            {TRUST.map(({ key, Icon }) => (
              <li key={key} className="flex items-center gap-2">
                <Icon className="text-primary h-4 w-4" />
                {t(`trust.${key}`)}
              </li>
            ))}
          </ul>
        </div>

        {/* Placeholder hero visual — replace with real photography/illustration.
            See docs/BRAND.md § Assets to create separately. */}
        <div className="border-border/60 glass shadow-lift animate-fade-in-up relative mx-auto mt-16 aspect-[16/7] max-w-5xl overflow-hidden rounded-3xl border [animation-delay:400ms]">
          <div className="bg-aurora absolute inset-0" />
          <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm">
            <Sparkles className="text-secondary animate-float h-8 w-8" />
            <span className="font-display text-base font-semibold">Imagen de portada</span>
            <span className="max-w-md px-6 text-xs">
              Placeholder — reemplazar con fotografía de un espacio impecable o ilustración de marca
              (ver docs/BRAND.md).
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
