'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  Home,
  KeyRound,
  ConciergeBell,
  TriangleAlert,
  MessagesSquare,
  CalendarDays,
  ArrowRight,
  Plug,
  RefreshCw,
  Settings2,
  BotOff,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/card';
import { PlanBar, type Plan } from './plan-bar';
import { HospitableCard, ConnectionNote } from './hospitable-card';
import type { HostConnection } from '@/lib/host/queries';
import type { AccessRow } from './access-panel';
import type { Cleaning } from './cleaning-panel';
import type { Thread } from './messaging-panel';

export type Feed = {
  id: string;
  label: string | null;
  ical_url: string;
  last_synced_at: string | null;
};
export type Block = {
  id: string;
  starts_on: string;
  ends_on: string;
  source: 'import' | 'manual';
  summary: string | null;
};

export type PropertyRow = {
  id: string;
  nickname: string;
  address: string | null;
  comuna: string | null;
  guest_info: string | null;
  external_listing_id: string | null;
  platform: string | null;
  base_nightly_clp: number | null;
  ai_enabled: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  picture_url: string | null;
  max_guests: number | null;
  beds: number | null;
  property_type: string | null;
  room_type: string | null;
  checkin_time: string | null;
  checkout_time: string | null;
  listed: boolean;
  amenities: string[] | null;
  house_rules: {
    pets_allowed?: boolean | null;
    smoking_allowed?: boolean | null;
    events_allowed?: boolean | null;
  } | null;
  cleaning_managed_by: 'luxel' | 'own';
  cleaning_contact_name: string | null;
  cleaning_contact_email: string | null;
  cleaning_contact_whatsapp: string | null;
  cleaning_auto_confirm: boolean;
  property_access: AccessRow;
  property_calendars: Feed[];
  calendar_blocks: Block[];
  cleanings: Cleaning[];
  guest_threads: Thread[];
};

export function PropertiesClient({
  initial,
  plan,
  connection,
  syncFailed,
}: {
  initial: PropertyRow[];
  plan: Plan;
  connection: HostConnection | null;
  syncFailed?: boolean;
}) {
  const t = useTranslations('properties');
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
          <Home className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
      </div>

      <div className="grid gap-4">
        {syncFailed && (
          <div className="border-warning/30 bg-warning/10 text-warning flex items-start gap-2.5 rounded-xl border p-3.5 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {t('sync_failed')}
          </div>
        )}
        <PlanBar plan={plan} />
        {connection ? (
          <ConnectionNote connection={connection} />
        ) : (
          <HospitableCard connection={connection} />
        )}

        {initial.length === 0 ? (
          connection ? (
            <EmptyConnected />
          ) : (
            <Onboarding connected={false} />
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {initial.map((p) => (
              <ListingCard key={p.id} property={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Connected account, zero listings: the mirror is live — anything published on
 *  Airbnb shows up here on its own. */
function EmptyConnected() {
  const t = useTranslations('properties');
  return (
    <Card className="border-dashed">
      <CardContent className="grid justify-items-center gap-2 p-10 text-center">
        <span className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-full">
          <Home className="h-5 w-5" />
        </span>
        <p className="font-display font-semibold">{t('empty_connected_title')}</p>
        <p className="text-muted-foreground max-w-sm text-sm">{t('empty_connected_body')}</p>
      </CardContent>
    </Card>
  );
}

/** Listings are import-only: the empty state IS the onboarding — three steps
 *  from zero to an imported, configured property. */
function Onboarding({ connected }: { connected: boolean }) {
  const t = useTranslations('onboarding');
  const steps = [
    { icon: Plug, title: t('s1_title'), body: t('s1_body'), done: connected },
    { icon: RefreshCw, title: t('s2_title'), body: t('s2_body'), done: false },
    { icon: Settings2, title: t('s3_title'), body: t('s3_body'), done: false },
  ];
  return (
    <Card className="border-dashed">
      <CardContent className="grid gap-5 p-8">
        <div className="text-center">
          <p className="font-display text-lg font-semibold">{t('title')}</p>
          <p className="text-muted-foreground mx-auto max-w-md text-sm">{t('subtitle')}</p>
        </div>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map(({ icon: Icon, title, body, done }, i) => (
            <li key={title} className="grid gap-1.5 text-center">
              <span
                className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${
                  done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary'
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold">
                {i + 1}. {title}
              </p>
              <p className="text-muted-foreground text-xs">{body}</p>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground text-center text-xs">
          {t('help_pre')}{' '}
          <a
            className="text-primary underline underline-offset-2"
            href={`https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('help_link')}
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

function accessChip(method: string | undefined, t: (key: string) => string) {
  if (method === 'keyless')
    return { icon: KeyRound, cls: 'bg-success/10 text-success', label: t('chip_keyless') };
  if (method === 'physical_concierge')
    return { icon: ConciergeBell, cls: 'bg-primary/10 text-primary', label: t('chip_concierge') };
  return { icon: TriangleAlert, cls: 'bg-warning/15 text-warning', label: t('chip_no_access') };
}

/** An imported Airbnb listing, photo first — the card mirrors the anuncio, the
 *  badges carry Luxel's operational state on top. */
function ListingCard({ property }: { property: PropertyRow }) {
  const t = useTranslations('properties');
  const today = new Date().toISOString().slice(0, 10);
  const nextCheckout = property.calendar_blocks
    .filter((b) => b.source === 'import' && b.ends_on >= today)
    .map((b) => b.ends_on)
    .sort()[0];
  const needsReply = property.guest_threads.filter((th) => th.status === 'needs_host').length;
  const chip = accessChip(property.property_access?.method, t);
  const ChipIcon = chip.icon;

  const capacity = [
    property.bedrooms != null && t('cap_bedrooms', { n: property.bedrooms }),
    property.bathrooms != null && t('cap_bathrooms', { n: property.bathrooms }),
    property.max_guests != null && t('cap_guests', { n: property.max_guests }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card className="group overflow-hidden transition-shadow hover:shadow-md">
      <Link href={`/properties/${property.id}`} className="block">
        <div className="bg-accent relative aspect-[16/9] w-full">
          {property.picture_url ? (
            <Image
              src={property.picture_url}
              alt={property.nickname}
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className="ease-lux object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="text-primary/40 flex h-full items-center justify-center">
              <Home className="h-10 w-10" />
            </div>
          )}
          <div className="absolute left-3 top-3 flex gap-1.5">
            {property.external_listing_id && (
              <span className="bg-background/90 text-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur">
                Airbnb
              </span>
            )}
            {!property.listed && (
              <span className="bg-background/90 text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur">
                {t('unlisted')}
              </span>
            )}
          </div>
        </div>
      </Link>
      <CardContent className="grid gap-3 p-4">
        <div>
          <p className="font-display font-semibold leading-tight">{property.nickname}</p>
          <p className="text-muted-foreground truncate text-sm">
            {[property.address, property.comuna].filter(Boolean).join(', ') || t('no_address')}
          </p>
          {capacity && <p className="text-muted-foreground mt-0.5 text-xs">{capacity}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${chip.cls}`}
          >
            <ChipIcon className="h-3 w-3" /> {chip.label}
          </span>
          {property.ai_enabled === false && (
            <span className="bg-warning/15 text-warning flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
              <BotOff className="h-3 w-3" /> {t('ai_off')}
            </span>
          )}
          {needsReply > 0 && (
            <span className="bg-warning/15 text-warning flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
              <MessagesSquare className="h-3 w-3" /> {t('needs_reply', { n: needsReply })}
            </span>
          )}
        </div>

        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {nextCheckout ? t('next_checkout', { date: nextCheckout }) : t('no_upcoming')}
          </span>
          <Link
            href={`/properties/${property.id}`}
            className="text-primary flex items-center gap-1 text-sm font-medium opacity-80 transition-opacity group-hover:opacity-100"
          >
            {t('manage')} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
