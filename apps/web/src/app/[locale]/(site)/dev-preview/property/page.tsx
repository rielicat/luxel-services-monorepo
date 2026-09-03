import { notFound } from 'next/navigation';
import type { PropertyRow } from '../../properties/properties-client';
import {
  PropertyDetailClient,
  type LiveDay,
  type MonthWindow,
} from '../../properties/[id]/detail-client';

export const dynamic = 'force-dynamic';

const TODAY = '2026-07-30';
const MONTH: MonthWindow = { from: '2026-07-01', to: '2026-08-01', prevFrom: '2026-06-01' };
const FIRST_OFFSET = -29;
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => iso(new Date(new Date(`${TODAY}T00:00:00Z`).getTime() + n * DAY));

const liveDays: LiveDay[] = Array.from({ length: 119 }, (_, k) => {
  const i = k + FIRST_OFFSET;
  const date = plus(i);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = dow === 5 || dow === 6;
  const reserved =
    (i >= -22 && i < -16) ||
    (i >= -9 && i < -3) ||
    (i >= 2 && i < 9) ||
    (i >= 20 && i < 26) ||
    (i >= 44 && i < 52);
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
  guest_context: null,
  external_listing_id: 'a6eb2c65',
  platform: 'airbnb',
  ai_replies: true,
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
  calendar_blocks: [
    {
      id: 'b0',
      starts_on: '2026-06-05',
      ends_on: '2026-06-16',
      source: 'import',
      summary: 'Airbnb TUV',
    },
    { id: 'b1', starts_on: plus(-22), ends_on: plus(-16), source: 'import', summary: 'Airbnb PQR' },
    { id: 'b2', starts_on: plus(-9), ends_on: plus(-3), source: 'import', summary: 'Airbnb STU' },
    { id: 'b3', starts_on: plus(2), ends_on: plus(9), source: 'import', summary: 'Airbnb ABC' },
    { id: 'b4', starts_on: plus(20), ends_on: plus(26), source: 'import', summary: 'Airbnb DEF' },
    { id: 'b5', starts_on: plus(44), ends_on: plus(52), source: 'import', summary: 'Airbnb GHI' },
  ],
};

export default async function PreviewPropertyPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <PropertyDetailClient
      property={property}
      liveDays={liveDays}
      realized={{ cleaningFeeClp: 135000, commissionBaseClp: 1420000, stays: 3 }}
      stayTimes={{}}
      today={TODAY}
      month={MONTH}
      recommended={recommended}
    />
  );
}
