'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  MessagesSquare,
  CalendarDays,
  Sparkles,
  KeyRound,
  BotOff,
  Home,
  TriangleAlert,
  CheckCircle2,
  TrendingUp,
  Bot,
  Wallet,
  ChevronDown,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PropertyRow } from '../properties-client';
import { AccessPanel } from '../access-panel';
import { StaysTimeline, buildStays, type LiveDay } from '../stays-timeline';
import { CleaningPanel } from '../cleaning-panel';
import { MessagingPanel } from '../messaging-panel';
import { AiSettings } from '../ai-settings';

export type { LiveDay } from '../stays-timeline';

const DAY = 86_400_000;
const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;
const addDays = (d: string, n: number) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);

/** `from` is the Santiago calendar date computed on the SERVER — the client
 *  never reads its own clock during render, so hydration is stable. */
function stats(property: PropertyRow, liveDays: LiveDay[] | null, from: string) {
  const horizon = liveDays?.length ? liveDays.slice(0, 30) : null;

  let occupancy: number;
  if (horizon) {
    occupancy = Math.round(
      (horizon.filter((d) => d.reserved).length / Math.max(1, horizon.length)) * 100,
    );
  } else {
    const to = addDays(from, 30);
    const booked = new Set<string>();
    for (const b of property.calendar_blocks) {
      if (b.ends_on < from || b.starts_on > to) continue;
      let d = b.starts_on > from ? b.starts_on : from;
      const end = b.ends_on < to ? b.ends_on : to;
      while (d < end) {
        booked.add(d);
        d = addDays(d, 1);
      }
    }
    occupancy = Math.round((booked.size / 30) * 100);
  }

  // Money metrics straight from the listing's real nightly rates.
  const reservedPriced = (horizon ?? []).filter((d) => d.reserved && d.priceClp != null);
  const revenue30 = horizon ? reservedPriced.reduce((sum, d) => sum + d.priceClp!, 0) : null;
  const priced = (horizon ?? []).filter((d) => d.priceClp != null);
  const adr = priced.length
    ? Math.round(priced.reduce((sum, d) => sum + d.priceClp!, 0) / priced.length)
    : null;

  const upcoming = property.cleanings
    .filter((c) => c.status !== 'skipped' && c.status !== 'done' && c.cleaning_date >= from)
    .map((c) => c.cleaning_date)
    .sort();

  return {
    occupancy,
    revenue30,
    adr,
    pendingCleanings: upcoming.length,
    suggestedCleanings: property.cleanings.filter(
      (c) => c.status === 'suggested' && c.cleaning_date >= from,
    ).length,
    needsReply: property.guest_threads.filter((t) => t.status === 'needs_host').length,
    aiReplies7d: property.guest_threads
      .flatMap((th) => th.guest_messages ?? [])
      .filter(
        (m) =>
          m.source === 'ai' &&
          m.created_at >= new Date(new Date(`${from}T00:00:00Z`).getTime() - 7 * DAY).toISOString(),
      ).length,
  };
}

/** Identity only — the full listing record lives on Airbnb (and feeds the AI);
 *  repeating it here was noise. */
function SlimHero({ property, aiOff }: { property: PropertyRow; aiOff: boolean }) {
  const t = useTranslations('detail');
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
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <h1 className="font-display truncate text-xl font-semibold tracking-tight sm:text-2xl">
            {property.nickname}
          </h1>
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
          {aiOff && (
            <span className="bg-warning/15 text-warning flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              <BotOff className="h-3 w-3" /> {t('ai_off')}
            </span>
          )}
        </div>
        <p className="text-muted-foreground truncate text-sm">
          {[property.address, property.comuna].filter(Boolean).join(', ') || tp('no_address')}
        </p>
      </div>
    </div>
  );
}

type SectionId = 'estadias' | 'mensajes' | 'aseos' | 'acceso';

export function PropertyDetailClient({
  property,
  liveDays,
  today,
  turnoverPrice,
  showSim,
}: {
  property: PropertyRow;
  liveDays: LiveDay[] | null;
  /** Santiago calendar date, server-computed (YYYY-MM-DD). */
  today: string;
  turnoverPrice: number | null;
  showSim: boolean;
}) {
  const t = useTranslations('detail');
  const s = stats(property, liveDays, today);
  const accessUnconfigured =
    !property.property_access?.method || property.property_access.method === 'physical_none';

  const refs = useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({});
  const scrollTo = (id: SectionId) =>
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const stays = buildStays(liveDays, property.calendar_blocks, today);

  // Metric drill-downs — every number explains itself on tap.
  type MetricId = 'revenue' | 'occupancy' | 'adr' | 'ai';
  const [openMetric, setOpenMetric] = useState<MetricId | null>(null);
  const horizon = liveDays?.slice(0, 30) ?? null;
  const reservedNights = horizon ? horizon.filter((d) => d.reserved).length : null;
  const openNights = horizon
    ? horizon.filter((d) => d.available && d.priceClp != null).length
    : null;
  const pricedNights = horizon ? horizon.filter((d) => d.priceClp != null) : [];
  const priceMin = pricedNights.length ? Math.min(...pricedNights.map((d) => d.priceClp!)) : null;
  const priceMax = pricedNights.length ? Math.max(...pricedNights.map((d) => d.priceClp!)) : null;
  const cleanings30 = property.cleanings.filter(
    (c) =>
      c.status !== 'skipped' && c.cleaning_date >= today && c.cleaning_date < addDays(today, 30),
  ).length;
  const cleaningCost30 = turnoverPrice != null ? cleanings30 * turnoverPrice : null;

  const metrics: {
    id: MetricId;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    sub: string;
    detail: string[];
  }[] = [
    {
      id: 'revenue',
      icon: Wallet,
      label: t('m_revenue'),
      value: s.revenue30 != null ? clp(s.revenue30) : '—',
      sub: t('m_revenue_sub'),
      detail: [
        reservedNights != null ? t('d_revenue_nights', { n: reservedNights }) : t('d_no_calendar'),
        cleaningCost30 != null
          ? t('d_revenue_cleaning', {
              n: cleanings30,
              each: clp(turnoverPrice!),
              total: clp(cleaningCost30),
            })
          : t('d_revenue_cleaning_unknown', { n: cleanings30 }),
        t('d_revenue_disclaimer'),
      ],
    },
    {
      id: 'occupancy',
      icon: TrendingUp,
      label: t('m_occupancy'),
      value: `${s.occupancy}%`,
      sub: t('m_occupancy_sub'),
      detail:
        reservedNights != null
          ? [
              t('d_occupancy_split', { reserved: reservedNights, open: openNights ?? 0 }),
              t('d_occupancy_note'),
            ]
          : [t('d_no_calendar')],
    },
    {
      id: 'adr',
      icon: CalendarDays,
      label: t('m_adr'),
      value: s.adr != null ? clp(s.adr) : '—',
      sub: t('m_adr_sub'),
      detail:
        priceMin != null && priceMax != null
          ? [t('d_adr_range', { min: clp(priceMin), max: clp(priceMax) }), t('d_adr_note')]
          : [t('d_no_calendar')],
    },
    {
      id: 'ai',
      icon: Bot,
      label: t('m_ai'),
      value: String(s.aiReplies7d),
      sub: t('m_ai_sub'),
      detail: [
        t('d_ai_threads', { n: property.guest_threads.length }),
        s.needsReply > 0 ? t('d_ai_pending', { n: s.needsReply }) : t('d_ai_clear'),
      ],
    },
  ];
  const expanded = metrics.find((m) => m.id === openMetric) ?? null;

  const attention: { id: SectionId; label: string }[] = [
    s.needsReply > 0 && { id: 'mensajes' as const, label: t('att_reply', { n: s.needsReply }) },
    s.suggestedCleanings > 0 && {
      id: 'aseos' as const,
      label: t('att_cleanings', { n: s.suggestedCleanings }),
    },
    accessUnconfigured && { id: 'acceso' as const, label: t('att_access') },
  ].filter(Boolean) as { id: SectionId; label: string }[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/properties"
        className="text-muted-foreground hover:text-foreground mb-4 flex w-fit items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {t('back')}
      </Link>

      <SlimHero property={property} aiOff={property.ai_enabled === false} />

      {/* Metrics that matter to the owner — tap any to see how it's computed. */}
      <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-expanded={openMetric === m.id}
            onClick={() => setOpenMetric((cur) => (cur === m.id ? null : m.id))}
            className="text-left"
          >
            <Card
              className={cn(
                'ease-lux h-full transition-all',
                openMetric === m.id
                  ? 'border-primary/40 shadow-soft'
                  : 'hover:border-primary/30 hover:shadow-soft',
              )}
            >
              <CardContent className="grid gap-0.5 p-3.5">
                <span className="text-muted-foreground flex items-center justify-between gap-1.5 text-xs">
                  <span className="flex items-center gap-1.5">
                    <m.icon className="h-3.5 w-3.5" /> {m.label}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 transition-transform',
                      openMetric === m.id && 'rotate-180',
                    )}
                  />
                </span>
                <span className="font-display text-xl font-semibold tabular-nums">{m.value}</span>
                <span className="text-muted-foreground text-xs">{m.sub}</span>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
      {expanded && (
        <Card className="border-primary/30 mb-4">
          <CardContent className="grid gap-1.5 p-4">
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
          </CardContent>
        </Card>
      )}
      {!expanded && <div className="mb-2" />}

      {/* What needs you — actionable, or a quiet all-clear. */}
      {attention.length > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {attention.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => scrollTo(a.id)}
              className="bg-warning/15 text-warning hover:bg-warning/25 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <TriangleAlert className="h-3.5 w-3.5" /> {a.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-success mb-6 flex items-center gap-1.5 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4" /> {t('att_clear')}
        </p>
      )}

      <div className="grid gap-4">
        <Section
          sectionRef={(el) => {
            refs.current.estadias = el;
          }}
          icon={CalendarDays}
          title={t('sec_stays')}
        >
          <StaysTimeline stays={stays} cleanings={property.cleanings} />
        </Section>

        <Section
          sectionRef={(el) => {
            refs.current.mensajes = el;
          }}
          icon={MessagesSquare}
          title={t('tab_messages')}
          badge={s.needsReply}
        >
          <div className="grid gap-5">
            <MessagingPanel
              propertyId={property.id}
              threads={property.guest_threads}
              showSim={showSim}
            />
            <AiSettings
              propertyId={property.id}
              aiEnabled={property.ai_enabled !== false}
              guestInfo={property.guest_info}
            />
          </div>
        </Section>

        <Section
          sectionRef={(el) => {
            refs.current.aseos = el;
          }}
          icon={Sparkles}
          title={t('tab_cleaning')}
          badge={s.suggestedCleanings}
        >
          <CleaningPanel
            propertyId={property.id}
            cleanings={property.cleanings}
            turnoverPrice={turnoverPrice}
            managedBy={property.cleaning_managed_by}
            contactName={property.cleaning_contact_name}
            contactEmail={property.cleaning_contact_email}
            contactWhatsapp={property.cleaning_contact_whatsapp}
            autoConfirm={property.cleaning_auto_confirm}
          />
        </Section>

        <Section
          sectionRef={(el) => {
            refs.current.acceso = el;
          }}
          icon={KeyRound}
          title={t('tab_access')}
          warn={accessUnconfigured}
        >
          <AccessPanel propertyId={property.id} access={property.property_access} />
        </Section>
      </div>
    </div>
  );
}

/** Always-open dashboard block — no accordion to fight, just a clear header. */
function Section({
  sectionRef,
  icon: Icon,
  title,
  badge,
  warn,
  children,
}: {
  sectionRef: (el: HTMLDivElement | null) => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: number;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card ref={sectionRef} className="scroll-mt-24">
      <CardContent className="grid gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <span className="font-display flex-1 font-semibold">{title}</span>
          {badge != null && badge > 0 && (
            <span className="bg-warning/15 text-warning rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
              {badge}
            </span>
          )}
          {warn && <span className={cn('bg-warning h-2 w-2 rounded-full')} aria-hidden />}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
