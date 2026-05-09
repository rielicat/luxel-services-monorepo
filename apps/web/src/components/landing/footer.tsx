import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('landing.footer');
  return (
    <footer className="border-border/60 border-t">
      <div className="text-muted-foreground container flex h-16 items-center justify-between text-sm">
        <p>© {new Date().getFullYear()} Servicios Luxel</p>
        <p className="hidden sm:block">{t('tagline')}</p>
      </div>
    </footer>
  );
}
