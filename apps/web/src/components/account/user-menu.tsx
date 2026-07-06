'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUser, useClerk } from '@clerk/nextjs';
import { LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function UserMenu() {
  const t = useTranslations('nav');
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isLoaded) {
    return <span className="bg-muted h-9 w-9 shrink-0 animate-pulse rounded-full" aria-hidden />;
  }

  const name = user?.fullName || user?.firstName || '';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const initials =
    (name || email)
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name || t('account')}
        className="ring-offset-background focus-visible:ring-primary flex h-9 w-9 items-center justify-center rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {user?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.imageUrl}
            alt=""
            className="h-9 w-9 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="bg-primary text-primary-foreground flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold">
            {initials}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="bg-popover border-border shadow-card animate-fade-in-up absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border [animation-duration:150ms]"
        >
          <div className="border-border/60 border-b px-4 py-3">
            {name && <p className="truncate text-sm font-semibold">{name}</p>}
            {email && <p className="text-muted-foreground truncate text-xs">{email}</p>}
          </div>
          <nav className="p-1.5">
            <MenuLink href="/account" icon={LayoutDashboard} onNavigate={() => setOpen(false)}>
              {t('plan')}
            </MenuLink>
            <MenuLink href="/account/profile" icon={UserRound} onNavigate={() => setOpen(false)}>
              {t('account')}
            </MenuLink>
          </nav>
          <div className="border-border/60 border-t p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void signOut({ redirectUrl: '/' });
              }}
              className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {t('logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  onNavigate,
  children,
}: {
  href: string;
  icon: typeof UserRound;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className={cn(
        'text-foreground hover:bg-muted flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
      )}
    >
      <Icon className="text-muted-foreground h-4 w-4" />
      {children}
    </Link>
  );
}
