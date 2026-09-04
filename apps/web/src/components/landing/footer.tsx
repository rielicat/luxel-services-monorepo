import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { LuxelLogo } from '@/components/brand/logo';

export function Footer() {
  const t = useTranslations('landing.footer');
  const tNav = useTranslations('nav');
  return (
    <footer className="border-border/60 bg-muted/30 border-t">
      <div className="container flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <LuxelLogo />
          <p className="text-muted-foreground max-w-xs text-sm">{t('tagline')}</p>
        </div>
        <nav className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/#servicio" className="hover:text-foreground transition-colors">
            {tNav('services')}
          </Link>
          <Link href="/calculator" className="hover:text-foreground transition-colors">
            {tNav('precios')}
          </Link>
          <Link href="/about" className="hover:text-foreground transition-colors">
            {tNav('about')}
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            {tNav('privacy')}
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            {tNav('terms')}
          </Link>
        </nav>
      </div>
      <div className="border-border/60 border-t">
        <p className="text-muted-foreground container py-4 text-xs">
          {t('legal', { year: String(new Date().getFullYear()) })}
        </p>
      </div>
    </footer>
  );
}
