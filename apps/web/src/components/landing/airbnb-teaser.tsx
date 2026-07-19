import { useTranslations } from 'next-intl';
import { Bot, TrendingUp, Sparkles, KeyRound, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/card';

/** Landing section presenting the Airbnb manager as Luxel's second service line,
 *  alongside the cleaning marketplace. */
export function AirbnbTeaser() {
  const t = useTranslations('landing.airbnb');
  const items = [
    { icon: Bot, title: t('f1_title'), body: t('f1_body') },
    { icon: TrendingUp, title: t('f2_title'), body: t('f2_body') },
    { icon: Sparkles, title: t('f3_title'), body: t('f3_body') },
    { icon: KeyRound, title: t('f4_title'), body: t('f4_body') },
  ];

  return (
    <section id="airbnb" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <div className="mb-8 max-w-2xl">
        <span className="bg-secondary/60 text-secondary-foreground mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
          {t('badge')}
        </span>
        <h2 className="font-display text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('title')}
        </h2>
        <p className="text-muted-foreground mt-3 text-lg">{t('subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <CardContent className="grid gap-2 p-5">
              <span className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
                <Icon className="h-5 w-5" />
              </span>
              <p className="font-display font-semibold">{title}</p>
              <p className="text-muted-foreground text-sm">{body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link
          href="/properties"
          className="bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 inline-flex h-11 items-center gap-2 rounded-md px-6 text-sm font-medium transition-colors"
        >
          {t('cta')} <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="text-muted-foreground text-sm">{t('price_note')}</p>
      </div>
    </section>
  );
}
