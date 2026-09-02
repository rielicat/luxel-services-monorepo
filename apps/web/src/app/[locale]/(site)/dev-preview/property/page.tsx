import { notFound } from 'next/navigation';
import type { PropertyRow } from '../../properties/properties-client';
import type { AccessRow } from '../../properties/access-panel';
import { PropertyDetailClient, type LiveDay } from '../../properties/[id]/detail-client';

export const dynamic = 'force-dynamic';

const TODAY = '2026-07-30';
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => iso(new Date(new Date(`${TODAY}T00:00:00Z`).getTime() + n * DAY));

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

const property: PropertyRow = {
  id: '00000000-0000-0000-0000-000000000001',
  nickname: 'JOSÉ MANUEL INFANTE 1045 - DPTO 401',
  address: 'José Manuel Infante 1045',
  comuna: 'Providencia',
  guest_info: null,
  external_listing_id: 'a6eb2c65',
  platform: 'airbnb',
  ai_enabled: true,
  price_optimization_enabled: true,
  pricelabs_status: 'connected',
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
  property_access: null,
  calendar_blocks: [
    { id: 'b1', starts_on: plus(2), ends_on: plus(9), source: 'import', summary: 'Airbnb ABC' },
    { id: 'b2', starts_on: plus(20), ends_on: plus(26), source: 'import', summary: 'Airbnb DEF' },
    { id: 'b3', starts_on: plus(44), ends_on: plus(52), source: 'import', summary: 'Airbnb GHI' },
  ],
};

const ACCESS: Record<'keyless' | 'missing' | 'none', AccessRow> = {
  keyless: {
    method: 'keyless',
    require_id: false,
    keyless_code: '4821',
    keyless_instructions: 'Piso 4, depto B — el teclado está a la derecha',
    concierge_name: null,
    concierge_hours: null,
    unit: '401',
    id_basis: null,
    id_disclosed: false,
  },
  missing: {
    method: 'keyless',
    require_id: false,
    keyless_code: null,
    keyless_instructions: null,
    concierge_name: null,
    concierge_hours: null,
    unit: null,
    id_basis: null,
    id_disclosed: false,
  },
  none: null,
};

export default async function PreviewPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { access } = await searchParams;
  const key = access && access in ACCESS ? (access as keyof typeof ACCESS) : 'keyless';
  return (
    <PropertyDetailClient
      property={{ ...property, property_access: ACCESS[key] }}
      liveDays={liveDays}
      today={TODAY}
      recommended={recommended}
    />
  );
}
