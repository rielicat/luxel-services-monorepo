import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { ChatOpenButton } from '@/components/chat/chat-open-button';

export function ClosingCta() {
  const t = useTranslations('landing.closing');
  return (
    <section className="container pb-20 sm:pb-24">
      <div className="from-primary to-secondary shadow-lift relative mx-auto max-w-5xl overflow-hidden rounded-2xl bg-gradient-to-br p-8 text-center sm:p-10">
        <div aria-hidden className="bg-dot-grid absolute inset-0 opacity-20" />
        <div className="relative">
          <h2 className="text-primary-foreground text-balance font-serif text-3xl font-medium sm:text-4xl">
            {t('title')}
          </h2>
          <p className="text-primary-foreground/85 mx-auto mt-3 max-w-md text-pretty">
            {t('body')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ChatOpenButton
              variant="default"
              className="bg-background text-foreground hover:bg-background/90 w-full shadow-lg sm:w-auto"
            >
              {t('secondary')}
            </ChatOpenButton>
            <Button
              asChild
              variant="outline"
              size="xl"
              className="text-primary-foreground hover:text-primary-foreground w-full border-white/70 bg-white/15 hover:bg-white/10 sm:w-auto"
            >
              <Link href="/calculator">{t('primary')}</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
