'use client';

import Image from 'next/image';
import { useState } from 'react';
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
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { amenityLabel, propertyTypeLabel, roomTypeLabel } from '@/lib/host/listing-labels';
import type { PropertyRow } from '../properties-client';
import { AccessPanel } from '../access-panel';
import { LiveCalendar } from '../live-calendar';
import { CleaningPanel } from '../cleaning-panel';
import { MessagingPanel } from '../messaging-panel';
import { AiSettings } from '../ai-settings';
import { ResumenPanel, type LiveDay } from '../resumen-panel';

export type { LiveDay } from '../resumen-panel';

const DAY = 86_400_000;

/** Occupancy and next checkout come from the LIVE Airbnb calendar when we have
 *  it; the locally synced blocks are only the fallback. */
function stats(property: PropertyRow, liveDays: LiveDay[] | null) {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = iso(today);
  const to = iso(new Date(today.getTime() + 30 * DAY));

  let occupancy: number;
  if (liveDays?.length) {
    // Live occupancy over the tile's 30-day horizon, even when more days came in.
    const horizon = liveDays.slice(0, 30);
    occupancy = Math.round(
      (horizon.filter((d) => d.reserved).length / Math.max(1, horizon.length)) * 100,
    );
  } else {
    const booked = new Set<string>();
    for (const b of property.calendar_blocks) {
      if (b.ends_on < from || b.starts_on > to) continue;
      let d = new Date(`${b.starts_on > from ? b.starts_on : from}T00:00:00Z`);
      const end = new Date(`${b.ends_on < to ? b.ends_on : to}T00:00:00Z`);
      while (d < end) {
        booked.add(iso(d));
        d = new Date(d.getTime() + DAY);
      }
    }
    occupancy = Math.round((booked.size / 30) * 100);
  }

  // Next checkout = the earliest synced RESERVATION end, not an availability
  // boundary — back-to-back stays have no gap for a boundary to detect.
  const nextCheckout =
    property.calendar_blocks
      .filter((b) => b.source === 'import' && b.ends_on >= from)
      .map((b) => b.ends_on)
      .sort()[0] ?? null;

  const pendingCleanings = property.cleanings.filter(
    (c) => c.status !== 'skipped' && c.status !== 'done' && c.cleaning_date >= from,
  ).length;
  return {
    occupancy,
    nextCheckout,
    pendingCleanings,
    needsReply: property.guest_threads.filter((t) => t.status === 'needs_host').length,
  };
}

/** The imported anuncio, as Airbnb defines it: photo, identity, capacity,
 *  type, check-in/out, amenities and house rules — all synced, none editable. */
function ListingHero({ property }: { property: PropertyRow }) {
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
    <Card className="mb-6 overflow-hidden">
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

export function PropertyDetailClient({
  property,
  liveDays,
  turnoverPrice,
  showSim,
}: {
  property: PropertyRow;
  liveDays: LiveDay[] | null;
  turnoverPrice: number | null;
  showSim: boolean;
}) {
  const t = useTranslations('detail');
  const s = stats(property, liveDays);
  // Keyless check-in can't run until the host configures access — surface it.
  const accessUnconfigured =
    !property.property_access?.method || property.property_access.method === 'physical_none';

  const tiles = [
    { label: t('occupancy'), value: `${s.occupancy}%` },
    { label: t('next_checkout'), value: s.nextCheckout ?? '—' },
    { label: t('pending_cleanings'), value: String(s.pendingCleanings) },
    { label: t('needs_reply'), value: String(s.needsReply), warn: s.needsReply > 0 },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/properties"
        className="text-muted-foreground hover:text-foreground mb-4 flex w-fit items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {t('back')}
      </Link>

      <ListingHero property={property} />

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {property.ai_enabled === false && (
          <span className="bg-warning/15 text-warning flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
            <BotOff className="h-3.5 w-3.5" /> {t('ai_off')}
          </span>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="p-3.5">
              <p className="text-muted-foreground text-xs">{tile.label}</p>
              <p
                className={`font-display text-lg font-semibold tabular-nums ${tile.warn ? 'text-warning' : ''}`}
              >
                {tile.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* At-a-glance layer — always visible. */}
      <div className="mb-6">
        <ResumenPanel property={property} liveDays={liveDays} />
      </div>

      {/* One integrated dashboard: detail sections expand on demand, and a
          section with something actionable starts open. */}
      <div className="grid gap-4">
        <DetailSection icon={CalendarDays} title={t('tab_calendar')}>
          <LiveCalendar days={liveDays} />
        </DetailSection>

        <DetailSection
          icon={MessagesSquare}
          title={t('tab_messages')}
          badge={s.needsReply}
          defaultOpen={s.needsReply > 0}
        >
          <div className="grid gap-4">
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
          icon={Sparkles}
          title={t('tab_cleaning')}
          badge={s.pendingCleanings}
          defaultOpen={property.cleanings.some((c) => c.status === 'suggested')}
        >
          <CleaningPanel
            propertyId={property.id}
            cleanings={property.cleanings}
            turnoverPrice={turnoverPrice}
          />
        </DetailSection>

        <DetailSection
          icon={KeyRound}
          title={t('tab_access')}
          warn={accessUnconfigured}
          defaultOpen={accessUnconfigured}
        >
          <AccessPanel propertyId={property.id} access={property.property_access} />
        </DetailSection>
      </div>
    </div>
  );
}

/** Collapsible dashboard section: header row with icon, count badge and a
 *  warning dot when the section needs the host's input. */
function DetailSection({
  icon: Icon,
  title,
  badge,
  warn,
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: number;
  warn?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
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
      {open && <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>}
    </Card>
  );
}
