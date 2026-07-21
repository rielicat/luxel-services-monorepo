'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Bot, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/routing';

/** Desktop "Servicios" dropdown. Custom useState + outside-click/Escape pattern,
 *  matching components/account/user-menu.tsx (no Radix dropdown dep in the repo). */
export function ServicesDropdown() {
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="hover:text-foreground flex items-center gap-1 transition-colors"
      >
        {t('services')}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="bg-popover border-border shadow-card animate-fade-in-up absolute left-1/2 top-full z-50 mt-3 w-72 -translate-x-1/2 overflow-hidden rounded-2xl border p-1.5 [animation-duration:150ms]"
        >
          <ServiceItem
            href="/services/airbnb"
            icon={Bot}
            title={t('services_airbnb')}
            caption={t('services_airbnb_caption')}
            onNavigate={() => setOpen(false)}
          />
          <ServiceItem
            href="/services/cleaning"
            icon={Sparkles}
            title={t('services_cleaning')}
            caption={t('services_cleaning_caption')}
            onNavigate={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function ServiceItem({
  href,
  icon: Icon,
  title,
  caption,
  onNavigate,
}: {
  href: string;
  icon: typeof Bot;
  title: string;
  caption: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="hover:bg-muted flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors"
    >
      <span className="bg-primary/10 text-primary mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="text-foreground block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground block text-xs">{caption}</span>
      </span>
    </Link>
  );
}
