'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  LayoutDashboard,
  Link2,
  Radio,
  CreditCard,
  HardHat,
  Users2,
  Activity,
  Bot,
  MessagesSquare,
  Building2,
  Wrench,
  CalendarPlus,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LuxelMark } from './ui';

const NAV = [
  { href: '/', label: 'Panel', Icon: LayoutDashboard },
  { href: '/connections', label: 'Conexiones', Icon: Link2 },
  { href: '/leads', label: 'Leads', Icon: Radio },
  { href: '/plans', label: 'Planes', Icon: CreditCard },
  { href: '/crew', label: 'Equipo', Icon: HardHat },
  { href: '/cleanings', label: 'Aseos', Icon: Sparkles },
  { href: '/stays', label: 'Estadías', Icon: CalendarPlus },
  { href: '/ai', label: 'Lux', Icon: Bot },
  { href: '/inbox', label: 'Inbox', Icon: MessagesSquare },
  { href: '/listings', label: 'Propiedades', Icon: Building2 },
  { href: '/sessions', label: 'Sesiones', Icon: Users2 },
  { href: '/telemetry', label: 'Telemetría', Icon: Activity },
  { href: '/debug', label: 'Diagnóstico', Icon: Wrench },
] as const;

function NavSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className={cn('h-3.5 w-3.5 shrink-0 animate-spin', className)} />;
}

export function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="flex min-h-dvh">
      <aside className="border-border bg-card sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r p-4 sm:flex">
        <div className="flex items-center gap-2 px-2 py-1">
          <LuxelMark />
          <div className="leading-tight">
            <p className="font-display text-sm font-extrabold">Luxel</p>
            <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Operación</p>
          </div>
        </div>

        <nav className="mt-6 grid gap-1">
          {NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive(href)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <NavSpinner />
            </Link>
          ))}
        </nav>

        <div className="border-border mt-auto flex items-center gap-2 border-t pt-3">
          <UserButton afterSignOutUrl="/" />
          <span className="text-muted-foreground truncate text-xs">{email}</span>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-border bg-card flex items-center justify-between border-b px-4 py-3 sm:hidden">
          <div className="flex items-center gap-2">
            <LuxelMark className="h-5 w-5" />
            <span className="font-display text-sm font-bold">Operación</span>
          </div>
          <UserButton afterSignOutUrl="/" />
        </header>
        <nav className="border-border bg-card sticky top-0 z-10 flex gap-1 overflow-x-auto border-b px-2 py-2 sm:hidden">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                isActive(href) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
              <NavSpinner />
            </Link>
          ))}
        </nav>
        <main className="p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
