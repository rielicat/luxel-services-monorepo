'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Home, TriangleAlert, CalendarDays, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/card';
import { ConnectionNote } from './connection-note';
import { ConnectPanel, type ConnectState } from './connect-panel';
import type { HostConnection } from '@/lib/host/queries';

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${d}T00:00:00Z`),
  );

export type Block = {
  id: string;
  starts_on: string;
  ends_on: string;
  source: 'import' | 'manual';
  origin?: 'channel' | 'manual' | null;
  summary: string | null;
  confirmation_code?: string | null;
};
export type PropertyRow = {
  id: string;
  nickname: string;
  address: string | null;
  comuna: string | null;
  guest_info: string | null;
  guest_context: Record<string, string> | null;
  external_listing_id: string | null;
  platform: string | null;
  ai_replies: boolean;
  price_optimization_enabled: boolean;
  pricelabs_status: 'off' | 'pending_connection' | 'connected';
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
  calendar_blocks: Block[];
};

export function PropertiesClient({
  initial,
  connection,
  connectState,
  signupEmail = null,
  syncFailed,
  centralManaged = false,
}: {
  initial: PropertyRow[];
  connection: HostConnection | null;
  connectState: ConnectState;
  signupEmail?: string | null;
  syncFailed?: boolean;
  centralManaged?: boolean;
}) {
  const t = useTranslations('properties');
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
          <Home className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
      </div>

      <div className="grid gap-6">
        {syncFailed && (
          <div className="border-warning/30 bg-warning/10 text-warning flex items-start gap-2.5 rounded-xl border p-3.5 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {t('sync_failed')}
          </div>
        )}
        {initial.length > 0 && (
          <ConnectionNote connection={connection} centralManaged={centralManaged} />
        )}

        {initial.length === 0 ? (
          <ConnectPanel state={connectState} signupEmail={signupEmail} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {initial.map((p) => (
              <ListingCard key={p.id} property={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ListingCard({ property }: { property: PropertyRow }) {
  const t = useTranslations('properties');
  const today = new Date().toISOString().slice(0, 10);
  const nextCheckout = property.calendar_blocks
    .filter((b) => b.source === 'import' && b.ends_on >= today)
    .map((b) => b.ends_on)
    .sort()[0];
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

        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {nextCheckout ? t('next_checkout', { date: fmtDate(nextCheckout) }) : t('no_upcoming')}
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
