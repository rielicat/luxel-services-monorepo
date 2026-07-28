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
  RefreshCw,
  PawPrint,
  Cigarette,
  PartyPopper,
  ChevronDown,
  TriangleAlert,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { amenityLabel, propertyTypeLabel, roomTypeLabel } from '@/lib/host/listing-labels';
import type { PropertyRow } from '../properties-client';
import { AccessPanel } from '../access-panel';
import { LiveCalendar, type LiveDay } from '../live-calendar';
import { CleaningPanel } from '../cleaning-panel';
import { MessagingPanel } from '../messaging-panel';
import { AiSettings } from '../ai-settings';

export type { LiveDay } from '../live-calendar';

const DAY = 86_400_000;
const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;
const fmt = (d: string) =>
  new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${d}T00:00:00Z`),
  );
const addDays = (d: string, n: number) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);

/** Consecutive reserved nights → stays. Checkout is the morning after the last
 *  reserved night (Airbnb semantics). */
function staysFromLiveDays(days: LiveDay[]): { from: string; to: string; nights: number }[] {
  const stays: { from: string; to: string; nights: number }[] = [];
  let run: { from: string; nights: number } | null = null;
  for (const d of days) {
    if (d.reserved) {
      if (run) run.nights++;
      else run = { from: d.date, nights: 1 };
    } else if (run) {
      stays.push({ from: run.from, to: d.date, nights: run.nights });
      run = null;
    }
  }
  if (run)
    stays.push({ from: run.from, to: addDays(days[days.length - 1]!.date, 1), nights: run.nights });
  return stays;
}

/** `from` is the Santiago calendar date computed on the SERVER — the client
 *  never reads its own clock during render, so hydration is stable. */
function stats(property: PropertyRow, liveDays: LiveDay[] | null, from: string) {
  let occupancy: number;
  if (liveDays?.length) {
    const horizon = liveDays.slice(0, 30);
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

  const upcoming = property.cleanings
    .filter((c) => c.status !== 'skipped' && c.status !== 'done' && c.cleaning_date >= from)
    .map((c) => c.cleaning_date)
    .sort();

  return {
    occupancy,
    pendingCleanings: upcoming.length,
    nextCleaning: upcoming[0] ?? null,
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

/** The imported anuncio, as Airbnb defines it: photo, identity, capacity,
 *  type, check-in/out, amenities and house rules — all synced, none editable. */
function ListingHero({ property, aiOff }: { property: PropertyRow; aiOff: boolean }) {
  const t = useTranslations('detail');
  const tp = useTranslations('properties');

  const capacity = [
    property.bedrooms != null && tp('cap_bedrooms', { n: property.bedrooms }),
    property.bathrooms != null && tp('cap_bathrooms', { n: property.bathrooms }),
    property.max_guests != null && tp('cap_guests', { n: property.max_guests }),
  ]
    .filter(Boolean)
    .join(' · ');
  const kind = [propertyTypeLabel(property.property_type), roomTypeLabel(property.room_type)]
    .filter(Boolean)
    .join(' · ');
  const amenities = property.amenities ?? [];
  const shown = amenities.slice(0, 6);
  const rules = [
    { key: 'pets_allowed', icon: PawPrint, label: t('rule_pets') },
    { key: 'smoking_allowed', icon: Cigarette, label: t('rule_smoking') },
    { key: 'events_allowed', icon: PartyPopper, label: t('rule_events') },
  ] as const;

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="grid sm:grid-cols-[300px,1fr]">
        <div className="bg-accent relative aspect-[16/10] sm:aspect-auto sm:min-h-full">
          {property.picture_url ? (
            <Image
              src={property.picture_url}
              alt={property.nickname}
              fill
              sizes="(max-width: 640px) 100vw, 300px"
              className="object-cover"
            />
          ) : (
            <div className="text-primary/40 flex h-full items-center justify-center">
              <Home className="h-10 w-10" />
            </div>
          )}
        </div>
        <CardContent className="grid content-start gap-3 p-5">
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
            {aiOff && (
              <span className="bg-warning/15 text-warning flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                <BotOff className="h-3 w-3" /> {t('ai_off')}
              </span>
            )}
          </div>
          <div>
            <h1 className="font-display text-balance text-2xl font-semibold tracking-tight">
              {property.nickname}
            </h1>
            <p className="text-muted-foreground text-sm">
              {[property.address, property.comuna].filter(Boolean).join(', ') || tp('no_address')}
            </p>
          </div>
          <p className="text-muted-foreground text-sm">
            {[capacity, kind].filter(Boolean).join(' · ')}
          </p>
          {(property.checkin_time || property.checkout_time) && (
            <p className="text-muted-foreground text-sm">
              {[
                property.checkin_time && t('checkin_at', { time: property.checkin_time }),
                property.checkout_time && t('checkout_at', { time: property.checkout_time }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {shown.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {shown.map((a) => (
                <span
                  key={a}
                  className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs"
                >
                  {amenityLabel(a)}
                </span>
              ))}
              {amenities.length > shown.length && (
                <span className="text-muted-foreground rounded-full px-1 py-0.5 text-xs">
                  {t('amenities_more', { n: amenities.length - shown.length })}
                </span>
              )}
            </div>
          )}
          {property.house_rules && (
            <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
              {rules.map(({ key, icon: Icon, label }) => {
                const allowed = property.house_rules?.[key];
                if (allowed == null) return null;
                return (
                  <span
                    key={key}
                    className={`flex items-center gap-1 ${allowed ? '' : 'line-through opacity-60'}`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </span>
                );
              })}
            </div>
          )}
          <p className="text-muted-foreground/80 flex items-center gap-1.5 text-xs">
            <RefreshCw className="h-3 w-3" /> {t('synced_note')}
          </p>
        </CardContent>
      </div>
    </Card>
  );
}

type SectionId = 'calendario' | 'mensajes' | 'aseos' | 'acceso';

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
  // Keyless check-in can't run until the host configures access — surface it.
  const accessUnconfigured =
    !property.property_access?.method || property.property_access.method === 'physical_none';

  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    calendario: false,
    mensajes: s.needsReply > 0,
    aseos: s.suggestedCleanings > 0,
    acceso: accessUnconfigured,
  });
  const refs = useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({});
  const focusSection = (id: SectionId) => {
    setOpen((p) => ({ ...p, [id]: true }));
    requestAnimationFrame(() =>
      refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const stays = liveDays
    ? staysFromLiveDays(liveDays)
    : property.calendar_blocks
        .filter((b) => b.source === 'import' && b.ends_on >= today)
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
        .map((b) => ({ from: b.starts_on, to: b.ends_on, nights: 1 }));
  // Prefer the next stay that hasn't started — a run beginning on day one of the
  // window is (probably) the guest currently in the unit.
  const nextStay = stays.find((st) => st.from > today) ?? stays[0] ?? null;
  // Count over the same 30-day window the occupancy figure and the label use;
  // the next published rate may come from anywhere in the fetched horizon.
  const openNights30 = (liveDays ?? [])
    .slice(0, 30)
    .filter((d) => d.available && d.priceClp != null);
  const nextPrice = (liveDays ?? []).find((d) => d.available && d.priceClp != null) ?? null;

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

      <ListingHero property={property} aiOff={property.ai_enabled === false} />

      {/* What needs you — actionable, or a quiet all-clear. */}
      {attention.length > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {attention.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => focusSection(a.id)}
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

      {/* One summary layer — each card opens its detail section. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={CalendarDays}
          label={t('occupancy')}
          value={`${s.occupancy}%`}
          sub={
            nextStay
              ? t('sum_next_stay', { from: fmt(nextStay.from), to: fmt(nextStay.to) })
              : t('sum_no_stays')
          }
          onClick={() => focusSection('calendario')}
        />
        <SummaryCard
          icon={TrendingUp}
          label={t('sum_price')}
          value={nextPrice?.priceClp != null ? clp(nextPrice.priceClp) : '—'}
          sub={liveDays ? t('sum_open_nights', { n: openNights30.length }) : t('sum_no_calendar')}
          onClick={() => focusSection('calendario')}
        />
        <SummaryCard
          icon={MessagesSquare}
          label={t('needs_reply')}
          value={String(s.needsReply)}
          sub={t('sum_ai_7d', { n: s.aiReplies7d })}
          warn={s.needsReply > 0}
          onClick={() => focusSection('mensajes')}
        />
        <SummaryCard
          icon={Sparkles}
          label={t('sum_cleaning')}
          value={s.nextCleaning ? fmt(s.nextCleaning) : '—'}
          sub={t('sum_pending_cleanings', { n: s.pendingCleanings })}
          onClick={() => focusSection('aseos')}
        />
      </div>

      <div className="grid gap-4">
        <DetailSection
          sectionRef={(el) => {
            refs.current.calendario = el;
          }}
          icon={CalendarDays}
          title={t('tab_calendar')}
          open={open.calendario}
          onToggle={() => setOpen((p) => ({ ...p, calendario: !p.calendario }))}
        >
          <LiveCalendar days={liveDays} />
        </DetailSection>

        <DetailSection
          sectionRef={(el) => {
            refs.current.mensajes = el;
          }}
          icon={MessagesSquare}
          title={t('tab_messages')}
          badge={s.needsReply}
          open={open.mensajes}
          onToggle={() => setOpen((p) => ({ ...p, mensajes: !p.mensajes }))}
        >
          <div className="grid gap-5">
            <AiSettings
              propertyId={property.id}
              aiEnabled={property.ai_enabled !== false}
              guestInfo={property.guest_info}
            />
            <MessagingPanel
              propertyId={property.id}
              threads={property.guest_threads}
              showSim={showSim}
            />
          </div>
        </DetailSection>

        <DetailSection
          sectionRef={(el) => {
            refs.current.aseos = el;
          }}
          icon={Sparkles}
          title={t('tab_cleaning')}
          badge={s.pendingCleanings}
          open={open.aseos}
          onToggle={() => setOpen((p) => ({ ...p, aseos: !p.aseos }))}
        >
          <CleaningPanel
            propertyId={property.id}
            cleanings={property.cleanings}
            turnoverPrice={turnoverPrice}
          />
        </DetailSection>

        <DetailSection
          sectionRef={(el) => {
            refs.current.acceso = el;
          }}
          icon={KeyRound}
          title={t('tab_access')}
          warn={accessUnconfigured}
          open={open.acceso}
          onToggle={() => setOpen((p) => ({ ...p, acceso: !p.acceso }))}
        >
          <AccessPanel propertyId={property.id} access={property.property_access} />
        </DetailSection>
      </div>
    </div>
  );
}

/** Clickable summary: the number at a glance, the detail one tap away. */
function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  warn,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className="hover:border-primary/30 hover:shadow-soft ease-lux h-full transition-all">
        <CardContent className="grid gap-1 p-3.5">
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Icon className="h-3.5 w-3.5" /> {label}
          </span>
          <span
            className={cn(
              'font-display text-xl font-semibold tabular-nums',
              warn && 'text-warning',
            )}
          >
            {value}
          </span>
          <span className="text-muted-foreground truncate text-xs">{sub}</span>
        </CardContent>
      </Card>
    </button>
  );
}

/** Collapsible dashboard section: header row with icon, count badge and a
 *  warning dot when the section needs the host's input. Smoothly animated. */
function DetailSection({
  sectionRef,
  icon: Icon,
  title,
  badge,
  warn,
  open,
  onToggle,
  children,
}: {
  sectionRef: (el: HTMLDivElement | null) => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: number;
  warn?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card ref={sectionRef} className="scroll-mt-24 overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 p-4 text-left"
      >
        <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="font-display flex-1 font-semibold">{title}</span>
        {badge != null && badge > 0 && (
          <span className="bg-warning/15 text-warning rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
            {badge}
          </span>
        )}
        {warn && <span className="bg-warning h-2 w-2 rounded-full" aria-hidden />}
        <ChevronDown
          className={cn('text-muted-foreground ease-lux h-4 w-4 transition-transform', {
            'rotate-180': open,
          })}
        />
      </button>
      <div
        className={cn(
          'ease-lux grid transition-[grid-template-rows] duration-300',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
        // Clipping alone leaves hidden controls in the tab order — inert pulls
        // the collapsed content out of focus/AT until the section opens.
        // (String form: React 18 doesn't know the boolean `inert` prop yet.)
        {...(!open ? ({ inert: '' } as Record<string, string>) : {})}
      >
        <div className="overflow-hidden">
          <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>
        </div>
      </div>
    </Card>
  );
}
