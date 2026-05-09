import { useTranslations } from 'next-intl';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { Link } from '@/i18n/routing';
import { Sparkles } from 'lucide-react';

export function Nav() {
  const t = useTranslations('nav');
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="text-lg">Servicios Luxel</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/calculadora" className="text-muted-foreground hover:text-foreground">
            {t('calculator')}
          </Link>
          <SignedIn>
            <Link href="/cuenta" className="text-muted-foreground hover:text-foreground">
              {t('account')}
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="text-muted-foreground hover:text-foreground">
                {t('login')}
              </button>
            </SignInButton>
          </SignedOut>
        </nav>
      </div>
    </header>
  );
}
