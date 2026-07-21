import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { Target, Compass, HandHeart, Wallet, Cpu, MapPin } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Nosotros' };

const VALUES = [
  { key: 'v1', icon: HandHeart },
  { key: 'v2', icon: Wallet },
  { key: 'v3', icon: Cpu },
  { key: 'v4', icon: MapPin },
] as const;

export default function AboutPage() {
  const t = useTranslations('about');
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
            {t('lead')}
          </p>
        </div>
      </section>

      <section className="container pb-4 pt-6">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-center text-3xl font-semibold tracking-tight">
            {t('story_title')}
          </h2>
          <div className="text-muted-foreground mt-8 space-y-5 text-lg leading-relaxed">
            <p>{t('story_p1')}</p>
            <p>{t('story_p2')}</p>
          </div>
          <blockquote className="border-primary my-8 border-l-4 pl-5">
            <p className="text-foreground text-balance font-serif text-2xl italic leading-snug">
              {t('story_quote')}
            </p>
          </blockquote>
          <div className="text-muted-foreground space-y-5 text-lg leading-relaxed">
            <p>{t('story_p3')}</p>
            <p>{t('story_p4')}</p>
            <p>{t('story_p5')}</p>
          </div>
        </div>
      </section>

      <section className="container pb-6 pt-10">
        <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
          <Card>
            <CardContent className="p-8">
              <div className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
                <Target className="h-5 w-5" />
              </div>
              <h2 className="font-display mt-5 text-xl font-semibold">{t('mission_title')}</h2>
              <p className="text-muted-foreground mt-2">{t('mission_body')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-8">
              <div className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
                <Compass className="h-5 w-5" />
              </div>
              <h2 className="font-display mt-5 text-xl font-semibold">{t('vision_title')}</h2>
              <p className="text-muted-foreground mt-2">{t('vision_body')}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="container py-16 sm:py-20">
        <h2 className="font-display text-center text-3xl font-semibold tracking-tight">
          {t('values_title')}
        </h2>
        <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map(({ key, icon: Icon }) => (
            <div key={key} className="border-border bg-card shadow-soft rounded-xl border p-6">
              <div className="bg-accent text-accent-foreground flex h-11 w-11 items-center justify-center rounded-xl">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-display mt-5 font-semibold">{t(`${key}_title`)}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {t(`${key}_body`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="container pb-24">
        <div className="bg-primary text-primary-foreground shadow-glow relative mx-auto max-w-4xl overflow-hidden rounded-3xl px-8 py-14 text-center">
          <h2 className="font-display text-balance text-3xl font-semibold">{t('cta_title')}</h2>
          <p className="text-primary-foreground/80 mt-3">{t('cta_body')}</p>
          <Button asChild variant="lime" size="xl" className="mt-8">
            <Link href="/calculator?service=airbnb">{t('cta_button')}</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
