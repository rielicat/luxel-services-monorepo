'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  CalendarDays,
  Home,
  TrendingUp,
  Wallet,
  Info,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import type { Block, PropertyRow } from '../properties-client';
import { StaysTimeline, buildStays, type LiveDay } from '../stays-timeline';
import { AutomationsPanel } from '../automations-panel';

export type { LiveDay } from '../stays-timeline';

const DAY = 86_400_000;
const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;
const addDays = (d: string, n: number) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY,
  );
const fmtDay = (d: string) =>
  new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${d}T00:00:00Z`),
  );
const fmtMonth = (d: string) =>
  new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${d}T00:00:00Z`),
  );

export type MonthWindow = { from: string; to: string; prevFrom: string };

export function monthStats(blocks: Block[], monthDays: LiveDay[] | null, month: MonthWindow) {
  const bookedNights = (a: string, b: string) => {
    const booked = new Set<string>();
    for (const blk of blocks) {
      if (blk.ends_on < a || blk.starts_on > b) continue;
      let d = blk.starts_on > a ? blk.starts_on : a;
      const end = blk.ends_on < b ? blk.ends_on : b;
      while (d < end) {
        booked.add(d);
        d = addDays(d, 1);
      }
    }
    return booked;
  };

  const monthNights = Math.max(1, daysBetween(month.from, month.to));
  const prevNights = Math.max(1, daysBetween(month.prevFrom, month.from));

  const booked = bookedNights(month.from, month.to);
  for (const d of monthDays ?? []) if (d.reserved) booked.add(d.date);

  const occupancy = Math.round((booked.size / monthNights) * 100);
  const pastOccupancy = Math.round(
    (bookedNights(month.prevFrom, month.from).size / prevNights) * 100,
  );

  const reservedPriced = (monthDays ?? []).filter((d) => d.reserved && d.priceClp != null);
  const revenue = monthDays ? reservedPriced.reduce((sum, d) => sum + d.priceClp!, 0) : null;
  const priced = (monthDays ?? []).filter((d) => d.priceClp != null);
  const adr = priced.length
    ? Math.round(priced.reduce((sum, d) => sum + d.priceClp!, 0) / priced.length)
    : null;

  return { occupancy, pastOccupancy, revenue, adr };
}

function SlimHero({ property }: { property: PropertyRow }) {
  const tp = useTranslations('properties');
  return (
    <div className="mb-6 flex items-center gap-4">
      <div className="bg-accent relative h-20 w-28 shrink-0 overflow-hidden rounded-lg">
        {property.picture_url ? (
          <Image
            src={property.picture_url}
            alt={property.nickname}
            fill
            sizes="112px"
            className="object-cover"
          />
        ) : (
          <div className="text-primary/40 flex h-full items-center justify-center">
            <Home className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="grid min-w-0 gap-1">
        <h1 className="font-display truncate text-xl font-semibold tracking-tight sm:text-2xl">
          {property.nickname}
        </h1>
        <p className="text-muted-foreground truncate text-sm">
          {[property.address, property.comuna].filter(Boolean).join(', ') || tp('no_address')}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {property.external_listing_id && (
            <span className="bg-secondary/60 text-secondary-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              Airbnb
            </span>
          )}
          {!property.listed && (
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {tp('unlisted')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export interface RealizedMonth {
  cleaningFeeClp: number;
  commissionBaseClp: number;
  stays: number;
}

export function PropertyDetailClient({
  property,
  liveDays,
  realized,
  today,
  month,
  recommended,
}: {
  property: PropertyRow;
  liveDays: LiveDay[] | null;
  realized: RealizedMonth;
  today: string;
  month: MonthWindow;
  recommended?: Record<string, number> | null;
}) {
  const t = useTranslations('detail');
  const monthDays = liveDays?.filter((d) => d.date >= month.from && d.date < month.to) ?? null;
  const upcoming = liveDays?.filter((d) => d.date >= today) ?? null;
  const monthName = fmtMonth(month.from);
  const monthRunning = today < addDays(month.to, -1);
  const s = monthStats(property.calendar_blocks, monthDays, month);

  const stays = buildStays(upcoming, property.calendar_blocks, today);
  const pricedStays = stays.filter((st) => st.revenueClp != null).slice(0, 6);

  type MetricId = 'revenue' | 'occupancy' | 'adr';
  const [openMetric, setOpenMetric] = useState<MetricId | null>(null);
  const reservedNights = monthDays ? monthDays.filter((d) => d.reserved).length : null;
  const openNights = monthDays
    ? monthDays.filter((d) => d.available && d.priceClp != null).length
    : null;
  const pricedNights = monthDays ? monthDays.filter((d) => d.priceClp != null) : [];
  const priceMin = pricedNights.length ? Math.min(...pricedNights.map((d) => d.priceClp!)) : null;
  const priceMax = pricedNights.length ? Math.max(...pricedNights.map((d) => d.priceClp!)) : null;

  const occDelta = s.occupancy - s.pastOccupancy;
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

  const metrics: {
    id: MetricId;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
    label: string;
    value: string;
    sub: string;
    delta?: { value: number; label: string };
    detail: string[];
  }[] = [
    {
      id: 'revenue',
      icon: Wallet,
      tone: 'bg-primary/10 text-primary',
      label: t('m_revenue'),
      value: s.revenue != null ? clp(s.revenue) : '—',
      sub: t('m_revenue_sub'),
      detail: [
        reservedNights != null
          ? t('d_revenue_nights', { n: reservedNights, month: monthName })
          : t('d_no_calendar'),
        ...(monthRunning ? [t('d_month_partial', { month: monthName })] : []),
        realized.stays > 0
          ? t('d_revenue_split', {
              income: clp(realized.commissionBaseClp),
              cleaning: clp(realized.cleaningFeeClp),
            })
          : t('d_revenue_no_stays'),
        t('d_revenue_disclaimer'),
      ],
    },
    {
      id: 'occupancy',
      icon: TrendingUp,
      tone: 'bg-success/10 text-success',
      label: t('m_occupancy'),
      value: `${s.occupancy}%`,
      sub: t('m_occupancy_sub'),
      delta: { value: occDelta, label: t('delta_prev_month', { d: signed(occDelta) }) },
      detail: [
        ...(reservedNights != null
          ? [
              t('d_occupancy_split', {
                reserved: reservedNights,
                open: openNights ?? 0,
                month: monthName,
              }),
            ]
          : [t('d_no_calendar')]),
        t('d_occupancy_prev', { p: s.pastOccupancy }),
        ...(monthRunning ? [t('d_month_partial', { month: monthName })] : []),
        t('d_occupancy_note'),
      ],
    },
    {
      id: 'adr',
      icon: CalendarDays,
      tone: 'bg-secondary/60 text-secondary-foreground',
      label: t('m_adr'),
      value: s.adr != null ? clp(s.adr) : '—',
      sub: t('m_adr_sub'),
      detail:
        priceMin != null && priceMax != null
          ? [
              t('d_adr_range', { min: clp(priceMin), max: clp(priceMax), month: monthName }),
              t('d_adr_note'),
            ]
          : [t('d_no_calendar')],
    },
  ];
  const expanded = metrics.find((m) => m.id === openMetric) ?? null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8">
      <nav aria-label="breadcrumb" className="mb-5 flex items-center gap-1.5 text-sm">
        <Link
          href="/properties"
          className="text-muted-foreground hover:text-foreground hover:border-primary/30 border-border bg-card flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t('back')}
        </Link>
        <span className="text-muted-foreground/50 text-xs">/</span>
        <span className="text-muted-foreground max-w-[50vw] truncate text-xs font-medium">
          {property.nickname}
        </span>
      </nav>

      <SlimHero property={property} />

      <div className="border-border/60 mb-10 grid grid-cols-2 gap-x-6 gap-y-5 border-y py-5 sm:grid-cols-3">
        {metrics.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpenMetric(m.id)}
            className="group text-left"
          >
            <span className="text-muted-foreground group-hover:text-foreground flex items-center gap-1.5 text-xs transition-colors">
              <m.icon className="h-3.5 w-3.5" /> {m.label}
              <Info className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
            </span>
            <span className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-semibold tabular-nums">{m.value}</span>
              {m.delta && m.delta.value !== 0 && (
                <span
                  className={cn(
                    'flex items-center gap-0.5 text-[11px] font-semibold tabular-nums',
                    m.delta.value > 0 ? 'text-success' : 'text-warning',
                  )}
                >
                  {m.delta.value > 0 ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {m.delta.label}
                </span>
              )}
            </span>
            <span className="text-muted-foreground mt-0.5 block text-xs">{m.sub}</span>
          </button>
        ))}
      </div>

      <AutomationsPanel
        propertyId={property.id}
        priceOptEnabled={property.price_optimization_enabled === true}
        guestInfo={property.guest_info}
        liveDays={upcoming}
        pricelabsStatus={property.pricelabs_status ?? 'off'}
      />

      <Modal open={expanded != null} onClose={() => setOpenMetric(null)} title={expanded?.label}>
        {expanded && (
          <div className="grid gap-3">
            <div>
              <p className="font-display text-3xl font-semibold tabular-nums">{expanded.value}</p>
              <p className="text-muted-foreground text-sm">{expanded.sub}</p>
            </div>
            <div className="grid gap-1.5">
              {expanded.detail.map((line, i) => (
                <p
                  key={i}
                  className={cn(
                    'text-sm',
                    i === expanded.detail.length - 1 && 'text-muted-foreground text-xs',
                  )}
                >
                  {line}
                </p>
              ))}
            </div>
            {expanded.id === 'revenue' && pricedStays.length > 0 && (
              <div className="grid gap-1.5">
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                  {t('d_revenue_by_stay')}
                </p>
                {pricedStays.map((st) => (
                  <div
                    key={st.from}
                    className="border-border flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="capitalize">
                      {fmtDay(st.from)} → {fmtDay(st.to)}
                    </span>
                    <span className="font-medium tabular-nums">{clp(st.revenueClp!)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <div className="grid gap-8">
        <Section icon={CalendarDays} title={t('sec_stays')}>
          <StaysTimeline
            stays={stays}
            today={today}
            liveDays={upcoming}
            recommended={recommended}
          />
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  warn,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="scroll-mt-24">
      <CardContent className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-center gap-2.5 pb-1">
          <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <span className="font-display flex-1 font-semibold">{title}</span>
          {warn && <span className={cn('bg-warning h-2 w-2 rounded-full')} aria-hidden />}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
