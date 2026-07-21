'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, X, Bot, Sparkles, Users, HelpCircle } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';

/** Mobile marketing menu — the site previously had NO mobile access to the
 *  marketing links. Custom useState + outside-click/Escape, like user-menu.tsx. */
export function MobileMenu() {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
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

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? t('close') : t('menu')}
        className="text-foreground hover:bg-muted flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div
          role="menu"
          className="bg-popover border-border shadow-card animate-fade-in-up absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border p-1.5 [animation-duration:150ms]"
        >
          <Item href="/services/airbnb-management" icon={Bot} onNavigate={close}>
            {t('services_airbnb')}
          </Item>
          <Item href="/services/cleaning" icon={Sparkles} onNavigate={close}>
            {t('services_cleaning')}
          </Item>
          <Item href="/about" icon={Users} onNavigate={close}>
            {t('about')}
          </Item>
          <a
            href="/#faq"
            role="menuitem"
            onClick={close}
            className="text-foreground hover:bg-muted flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
          >
            <HelpCircle className="text-muted-foreground h-4 w-4" />
            {t('faq')}
          </a>
          <div className="p-1.5">
            <Button asChild variant="lime" size="sm" className="w-full">
              <Link href="/calculator" onClick={close}>
                {t('calculator')}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Item({
  href,
  icon: Icon,
  onNavigate,
  children,
}: {
  href: string;
  icon: typeof Bot;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="text-foreground hover:bg-muted flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
    >
      <Icon className="text-muted-foreground h-4 w-4" />
      {children}
    </Link>
  );
}
