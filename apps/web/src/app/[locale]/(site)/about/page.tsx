import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Target, Compass, HandHeart, Wallet, Cpu, MapPin, Sprout, ChevronDown } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChatOpenButton } from '@/components/chat/chat-open-button';
import { PhotoFrame } from '@/components/sections/photo-frame';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('about');
  return { title: t('meta_title') };
}

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
        <div className="container grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16">
          <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
            <h1 className="text-balance font-serif text-4xl font-medium tracking-tight sm:text-6xl">
              {t('title')}
            </h1>
            <p className="text-muted-foreground mt-6 max-w-2xl text-pretty text-lg">{t('lead')}</p>
          </div>
          <PhotoFrame src="/img/jmi/living-piano.jpg" alt={t('hero_alt')} priority />
        </div>
      </section>

      <section className="container pb-4 pt-6">
        <details className="border-border bg-card shadow-soft hover:border-primary/30 group mx-auto max-w-2xl overflow-hidden rounded-2xl border transition-colors">
          <summary className="flex cursor-pointer list-none items-center gap-4 p-5 [&::-webkit-details-marker]:hidden">
            <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
              <Sprout className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-display block text-lg font-semibold">{t('story_title')}</span>
              <span className="text-muted-foreground block text-sm">{t('story_teaser')}</span>
            </span>
            <ChevronDown className="text-muted-foreground h-5 w-5 shrink-0 transition-transform duration-300 group-open:rotate-180" />
          </summary>
          <div className="border-border/60 border-t px-6 pb-7 pt-6">
            <div className="text-muted-foreground space-y-4 leading-relaxed">
              <p>{t('story_p1')}</p>
              <p>{t('story_p2')}</p>
            </div>
            <blockquote className="border-primary my-6 border-l-4 pl-5">
              <p className="text-foreground text-balance font-serif text-xl italic leading-snug">
                {t('story_quote')}
              </p>
            </blockquote>
            <div className="text-muted-foreground space-y-4 leading-relaxed">
              <p>{t('story_p3')}</p>
              <p>{t('story_p4')}</p>
              <p>{t('story_p5')}</p>
            </div>
          </div>
        </details>
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
        <h2 className="text-center font-serif text-4xl font-medium tracking-tight sm:text-5xl">
          {t('values_title')}
        </h2>
        <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map(({ key, icon: Icon }) => (
            <div key={key} className="border-border bg-card shadow-soft rounded-xl border p-6">
              <div className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
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

      <section id="contacto" className="container pb-24">
        <div className="from-primary to-secondary shadow-lift relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-gradient-to-br px-8 py-16 text-center">
          <div
            aria-hidden
            className="bg-lime/25 pointer-events-none absolute -top-20 left-1/2 h-52 w-[28rem] -translate-x-1/2 rounded-full blur-3xl"
          />
          <div className="relative">
            <h2 className="text-primary-foreground text-balance font-serif text-3xl font-medium sm:text-4xl">
              {t('cta_title')}
            </h2>
            <p className="text-primary-foreground/85 mx-auto mt-3 max-w-md text-pretty">
              {t('cta_body')}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ChatOpenButton
                variant="default"
                className="bg-background text-foreground hover:bg-background/90 w-full shadow-lg sm:w-auto"
              >
                {t('cta_chat')}
              </ChatOpenButton>
              <Button
                asChild
                variant="outline"
                size="xl"
                className="text-primary-foreground hover:text-primary-foreground w-full border-white/70 bg-white/15 hover:bg-white/10 sm:w-auto"
              >
                <Link href="/calculator">{t('cta_button')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
