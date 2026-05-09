import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export function Hero() {
  const t = useTranslations('landing.hero');
  return (
    <section className="relative overflow-hidden">
      {/* radial accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--accent))_0%,transparent_70%)]"
      />
      <div className="container py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-balance text-5xl font-bold tracking-tight sm:text-6xl">
            {t('title')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            {t('subtitle')}
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link
              href="/calculadora"
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90"
            >
              {t('cta_primary')}
            </Link>
            <a
              href="#caracteristicas"
              className="inline-flex h-11 items-center justify-center rounded-md border border-border px-6 text-sm font-medium hover:bg-muted"
            >
              {t('cta_secondary')}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
