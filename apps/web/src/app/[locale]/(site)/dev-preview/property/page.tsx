import { notFound } from 'next/navigation';
import type { PropertyRow } from '../../properties/properties-client';
import { PropertyDetailClient, type LiveDay } from '../../properties/[id]/detail-client';

/**
 * DEV-ONLY visual harness. The real property page needs a signed-in host, which
 * makes iterating on layout awkward, so this mounts the same client component
 * with fixture data. Never reachable in production.
 */
export const dynamic = 'force-dynamic';

const TODAY = '2026-07-30';
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => iso(new Date(new Date(`${TODAY}T00:00:00Z`).getTime() + n * DAY));

// 90 days of a plausible calendar: two stays, weekend price bumps.
const liveDays: LiveDay[] = Array.from({ length: 90 }, (_, i) => {
  const date = plus(i);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = dow === 5 || dow === 6;
  const reserved = (i >= 2 && i < 9) || (i >= 20 && i < 26) || (i >= 44 && i < 52);
  return {
    date,
    available: !reserved,
    reserved,
    priceClp: weekend ? 189000 : 166450,
    minStay: 2,
  };
});

const recommended: Record<string, number> = {};
for (const d of liveDays) {
  const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
  if (dow === 5 || dow === 6) recommended[d.date] = 214000;
  else if (dow === 1 || dow === 2) recommended[d.date] = 152000;
}

const property = {
  id: '00000000-0000-0000-0000-000000000001',
  nickname: 'JOSÉ MANUEL INFANTE 1045 - DPTO 401',
  address: 'José Manuel Infante 1045',
  comuna: 'Providencia',
  guest_info: null,
  external_listing_id: 'a6eb2c65',
  platform: 'airbnb',
  base_nightly_clp: 166450,
  ai_enabled: true,
  price_optimization_enabled: true,
  pricelabs_status: 'connected',
  property_addons: [{ addon: 'dynamic_pricing', status: 'active' }],
  bedrooms: 3,
  bathrooms: 2,
  picture_url: null,
  max_guests: 6,
  beds: 3,
  property_type: 'apartment',
  room_type: 'Entire Home',
  checkin_time: '15:00',
  checkout_time: '11:00',
  listed: true,
  amenities: ['ac', 'kitchen', 'wireless_internet'],
  house_rules: { pets_allowed: true, smoking_allowed: false, events_allowed: false },
  cleaning_managed_by: 'luxel',
  cleaning_auto_confirm: true,
  cleaning_contacts: [],
  property_access: null,
  property_calendars: [],
  calendar_blocks: [
    { id: 'b1', starts_on: plus(2), ends_on: plus(9), source: 'import', summary: 'Airbnb ABC' },
    { id: 'b2', starts_on: plus(20), ends_on: plus(26), source: 'import', summary: 'Airbnb DEF' },
    { id: 'b3', starts_on: plus(44), ends_on: plus(52), source: 'import', summary: 'Airbnb GHI' },
  ],
  cleanings: [
    {
      id: 'c1',
      cleaning_date: plus(9),
      status: 'scheduled',
      price_clp: 38000,
      source: 'checkout',
      crew_confirmed_at: new Date().toISOString(),
    },
    {
      id: 'c2',
      cleaning_date: plus(26),
      status: 'scheduled',
      price_clp: 38000,
      source: 'checkout',
      crew_confirmed_at: null,
    },
    {
      id: 'c3',
      cleaning_date: plus(52),
      status: 'suggested',
      price_clp: 38000,
      source: 'checkout',
      crew_confirmed_at: null,
    },
  ],
  guest_threads: [
    {
      id: 't1',
      status: 'needs_host',
      guest_name: 'Matheus',
      updated_at: new Date().toISOString(),
      guest_messages: [
        {
          id: 'm1',
          direction: 'in',
          source: 'guest',
          body: '¿Hay estacionamiento disponible?',
          created_at: new Date().toISOString(),
        },
      ],
    },
    {
      id: 't2',
      status: 'closed',
      guest_name: 'Ana',
      updated_at: new Date().toISOString(),
      guest_messages: [
        {
          id: 'm2',
          direction: 'in',
          source: 'guest',
          body: '¿A qué hora es el check-in?',
          created_at: new Date().toISOString(),
        },
        {
          id: 'm3',
          direction: 'out',
          source: 'ai',
          body: 'El check-in es desde las 15:00. ¡Te esperamos!',
          created_at: new Date().toISOString(),
        },
      ],
    },
  ],
} as unknown as PropertyRow;

export default function PreviewPropertyPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <PropertyDetailClient
      property={property}
      liveDays={liveDays}
      today={TODAY}
      turnoverPrice={38000}
      showSim={false}
      recommended={recommended}
    />
  );
}
