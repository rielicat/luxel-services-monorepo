import { useTranslations } from 'next-intl';
import { SignedIn, SignedOut, ClerkLoading, ClerkLoaded } from '@clerk/nextjs';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { LuxelLogo } from '@/components/brand/logo';
import { UserMenu } from '@/components/account/user-menu';
import { ServicesDropdown } from '@/components/landing/services-dropdown';
import { MobileMenu } from '@/components/landing/mobile-menu';

export function Nav() {
  const t = useTranslations('nav');
  return (
    <header className="border-border/50 bg-background/70 sticky top-0 z-40 w-full border-b backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="Servicios Luxel" className="transition-opacity hover:opacity-80">
          <LuxelLogo />
        </Link>

        {/* Marketing links (desktop): Servicios · Precios · Nosotros */}
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
          {/* Reserve the cluster's space while Clerk boots so it doesn't jump —
              incl. the sm+ secondary link that the SignedIn/SignedOut clusters show. */}
          <ClerkLoading>
            <span
              aria-hidden
              className="bg-muted hidden h-9 w-16 animate-pulse rounded-md sm:block"
            />
            <span aria-hidden className="bg-muted h-9 w-20 animate-pulse rounded-lg" />
            <span aria-hidden className="bg-muted h-9 w-9 animate-pulse rounded-full" />
          </ClerkLoading>
          <ClerkLoaded>
            <SignedIn>
              <Button asChild variant="default" size="sm">
                <Link href="/account">{t('plan')}</Link>
              </Button>
              <UserMenu />
            </SignedIn>
            <SignedOut>
              <Button asChild variant="ghost" size="sm">
                <Link href="/sign-in">{t('login')}</Link>
              </Button>
            </SignedOut>
          </ClerkLoaded>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
