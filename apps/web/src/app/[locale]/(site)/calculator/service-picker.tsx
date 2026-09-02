import { useTranslations } from 'next-intl';
import { Bot, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';

export function ServicePicker() {
  const t = useTranslations('calculator.picker');
  return (
    <div className="mx-auto max-w-3xl">
      <header className="text-center">
        <h1 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t('title')}</h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">{t('subtitle')}</p>
      </header>

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        <Link
          href="/calculator?service=airbnb"
          className="border-primary/25 bg-card ring-primary/10 shadow-card hover:shadow-lift group relative flex flex-col overflow-hidden rounded-2xl border p-7 ring-1 transition-all"
        >
          <div aria-hidden className="bg-brand-glow pointer-events-none absolute inset-0" />
          <div className="relative flex flex-1 flex-col">
            <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-xl">
              <Bot className="h-6 w-6" />
            </div>
            <h2 className="font-display mt-4 text-xl font-semibold">{t('airbnb_title')}</h2>
            <p className="text-muted-foreground mt-2 flex-1 text-sm">{t('airbnb_body')}</p>
            <span className="text-primary mt-5 inline-flex items-center gap-1.5 text-sm font-semibold">
              {t('select')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>

        <Link
          href="/calculator?service=cleaning"
          className="border-border bg-card shadow-card hover:shadow-lift group flex flex-col rounded-2xl border p-7 transition-all"
        >
          <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-xl">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="font-display mt-4 text-xl font-semibold">{t('cleaning_title')}</h2>
          <p className="text-muted-foreground mt-2 flex-1 text-sm">{t('cleaning_body')}</p>
          <span className="text-primary mt-5 inline-flex items-center gap-1.5 text-sm font-semibold">
            {t('select')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </div>
  );
}
