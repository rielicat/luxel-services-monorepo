import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('landing.footer');
  return (
    <footer className="border-t border-border/60">
      <div className="container flex h-16 items-center justify-between text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Servicios Luxel</p>
        <p className="hidden sm:block">{t('tagline')}</p>
      </div>
    </footer>
  );
}
