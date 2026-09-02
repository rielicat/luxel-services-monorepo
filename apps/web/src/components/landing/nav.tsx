import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { LuxelLogo } from '@/components/brand/logo';
import { ServicesDropdown } from '@/components/landing/services-dropdown';
import { MobileMenu } from '@/components/landing/mobile-menu';
import { NavAuth } from '@/components/landing/nav-auth';

export function Nav() {
  const t = useTranslations('nav');
  return (
    <header className="border-border/50 bg-background/70 sticky top-0 z-40 w-full border-b backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="Servicios Luxel" className="transition-opacity hover:opacity-80">
          <LuxelLogo />
        </Link>

        <nav className="text-muted-foreground hidden items-center gap-7 text-sm font-medium md:flex">
          <ServicesDropdown />
          <Link href="/calculator" className="hover:text-foreground transition-colors">
            {t('precios')}
          </Link>
          <Link href="/about" className="hover:text-foreground transition-colors">
            {t('about')}
          </Link>
        </nav>

        <div className="flex items-center gap-2 text-sm sm:gap-3">
          <NavAuth />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
