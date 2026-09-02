'use client';

import { useTranslations } from 'next-intl';
import { SignedIn, SignedOut, ClerkLoading, ClerkLoaded } from '@clerk/nextjs';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/account/user-menu';

export function NavAuth() {
  const t = useTranslations('nav');
  return (
    <>
      <ClerkLoading>
        <span aria-hidden className="bg-muted hidden h-9 w-16 animate-pulse rounded-md sm:block" />
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
    </>
  );
}
