import 'server-only';

const BASE = 'https://api.pricelabs.co/v1';

export const pricelabsConfigured = () => Boolean(process.env.PRICELABS_API_KEY);

export type PricelabsRef = { id: string; pms: string };

interface PricelabsListing {
  listing_id: string;
  pms_name: string;
  listing_name?: string | null;
  channel_listing_details?: { channel_name?: string | null; channel_listing_id?: string | null }[];
}

interface PricelabsPriceDay {
  date: string;
  price: number | null;
  user_price: number | null;
  min_stay: number | null;
  booking_status: string | null;
  ADR: number | null;
}

async function call<T>(
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<T | null> {
  const key = process.env.PRICELABS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'X-API-Key': key,
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function listPricelabsListings(): Promise<PricelabsListing[] | null> {
  const json = await call<{ listings?: PricelabsListing[] } | PricelabsListing[]>(
    '/listings_minimal',
  );
  if (!json) return null;
  const rows = Array.isArray(json) ? json : json.listings;
  return Array.isArray(rows) ? rows : null;
}

export async function getPricelabsPrices(
  ref: PricelabsRef,
  dateFrom: string,
  dateTo: string,
): Promise<PricelabsPriceDay[] | null> {
  const json = await call<{ data?: PricelabsPriceDay[] }[] | { data?: PricelabsPriceDay[] }>(
    '/listing_prices',
    {
      method: 'POST',
      body: {
        listings: [{ id: ref.id, pms: ref.pms, dateFrom, dateTo, reason: 'luxel_dashboard' }],
      },
    },
  );
  if (!json) return null;
  const first = Array.isArray(json) ? json[0] : json;
  const rows = first?.data;
  return Array.isArray(rows) ? rows : null;
}
