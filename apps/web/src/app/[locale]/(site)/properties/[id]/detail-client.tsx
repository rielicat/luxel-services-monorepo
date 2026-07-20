'use client';

import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  LayoutDashboard,
  MessagesSquare,
  CalendarDays,
  Sparkles,
  KeyRound,
  BotOff,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import type { PropertyRow } from '../properties-client';
import { AccessPanel } from '../access-panel';
import { MonthCalendar } from '../month-calendar';
import { CleaningPanel } from '../cleaning-panel';
import { MessagingPanel } from '../messaging-panel';
import { AiSettings } from '../ai-settings';
import { ResumenPanel, type Insight } from '../resumen-panel';

const DAY = 86_400_000;

function stats(property: PropertyRow) {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = iso(today);
  const to = iso(new Date(today.getTime() + 30 * DAY));

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
  const nextCheckout = property.calendar_blocks
    .filter((b) => b.source === 'import' && b.ends_on >= from)
    .map((b) => b.ends_on)
    .sort()[0];
  const pendingCleanings = property.cleanings.filter(
    (c) => c.status !== 'skipped' && c.status !== 'done' && c.cleaning_date >= from,
  ).length;
  return {
    occupancy: Math.round((booked.size / 30) * 100),
    nextCheckout: nextCheckout ?? null,
    pendingCleanings,
    needsReply: property.guest_threads.filter((t) => t.status === 'needs_host').length,
  };
}

export function PropertyDetailClient({
  property,
  insight,
  turnoverPrice,
  showSim,
}: {
  property: PropertyRow;
  insight: Insight | null;
  turnoverPrice: number | null;
  showSim: boolean;
}) {
  const t = useTranslations('detail');
  const tp = useTranslations('properties');
  const s = stats(property);

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

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-balance text-2xl font-semibold tracking-tight">
            {property.nickname}
          </h1>
          <p className="text-muted-foreground text-sm">
            {[property.address, property.comuna].filter(Boolean).join(', ') || tp('no_address')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {property.ai_enabled === false && (
            <span className="bg-warning/15 text-warning flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
              <BotOff className="h-3.5 w-3.5" /> {t('ai_off')}
            </span>
          )}
          {property.external_listing_id && (
            <span className="bg-secondary/60 text-secondary-foreground rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">
              Airbnb
            </span>
          )}
        </div>
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

      <Tabs
        tabs={[
          {
            id: 'resumen',
            label: (
              <span className="flex items-center gap-1.5">
                <LayoutDashboard className="h-4 w-4" /> {t('tab_overview')}
              </span>
            ),
            content: (
              <ResumenPanel
                propertyId={property.id}
                blocks={property.calendar_blocks}
                insight={insight}
              />
            ),
          },
          {
            id: 'calendario',
            label: (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" /> {t('tab_calendar')}
              </span>
            ),
            content: (
              <MonthCalendar
                propertyId={property.id}
                blocks={property.calendar_blocks}
                feeds={property.property_calendars}
              />
            ),
          },
          {
            id: 'mensajes',
            label: (
              <span className="flex items-center gap-1.5">
                <MessagesSquare className="h-4 w-4" /> {t('tab_messages')}
              </span>
            ),
            badge: s.needsReply,
            content: (
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
            ),
          },
          {
            id: 'aseos',
            label: (
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" /> {t('tab_cleaning')}
              </span>
            ),
            content: (
              <CleaningPanel
                propertyId={property.id}
                cleanings={property.cleanings}
                turnoverPrice={turnoverPrice}
              />
            ),
          },
          {
            id: 'acceso',
            label: (
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-4 w-4" /> {t('tab_access')}
              </span>
            ),
            content: <AccessPanel propertyId={property.id} access={property.property_access} />,
          },
        ]}
      />
    </div>
  );
}
