import { useTranslations } from 'next-intl';
import { Sparkles, MessageCircle, WashingMachine, Unlock, FileText } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { ChatOpenButton } from '@/components/chat/chat-open-button';
import { PhotoFrame } from '@/components/sections/photo-frame';

const TRUST = [
  { key: 'guests', Icon: MessageCircle },
  { key: 'cleaning', Icon: WashingMachine },
  { key: 'contract', Icon: Unlock },
  { key: 'report', Icon: FileText },
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

      <div className="container grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16 lg:py-28">
        <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
          <span className="border-border/70 glass text-muted-foreground animate-fade-in-up shadow-soft inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium">
            <Sparkles className="text-secondary h-3.5 w-3.5" />
            {t('eyebrow')}
          </span>

          <h1 className="animate-fade-in-up mt-7 text-balance font-serif text-5xl font-medium leading-[1.02] tracking-tight [animation-delay:80ms] sm:text-6xl xl:text-7xl">
            {t('title_lead')}{' '}
            <span className="text-gradient-brand animate-gradient italic">{t('title_accent')}</span>
          </h1>

          <p className="text-muted-foreground animate-fade-in-up mt-7 max-w-xl text-pretty text-lg [animation-delay:160ms]">
            {t('subtitle')}
          </p>

          <div className="animate-fade-in-up mt-10 flex flex-col items-center gap-3 [animation-delay:240ms] sm:flex-row sm:justify-center lg:justify-start">
            <Button asChild variant="default" size="xl" className="w-full sm:w-auto">
              <Link href="/calculator">{t('cta_primary')}</Link>
            </Button>
            <ChatOpenButton className="w-full sm:w-auto">{t('cta_secondary')}</ChatOpenButton>
          </div>

          <ul className="text-muted-foreground animate-fade-in-up mt-11 grid grid-cols-2 gap-x-6 gap-y-3 text-left text-sm [animation-delay:320ms] sm:flex sm:flex-wrap sm:justify-center lg:justify-start">
            {TRUST.map(({ key, Icon }) => (
              <li key={key} className="flex items-center gap-2">
                <Icon className="text-primary h-4 w-4 shrink-0" />
                {t(`trust.${key}`)}
              </li>
            ))}
          </ul>
        </div>

        <PhotoFrame
          src="/img/jmi/terrace-sunset.jpg"
          alt={t('image_alt')}
          priority
          className="animate-fade-in-up [animation-delay:200ms]"
        />
      </div>
    </section>
  );
}
