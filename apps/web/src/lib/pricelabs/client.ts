import 'server-only';

/**
 * PriceLabs Customer API against Luxel's ONE central account.
 *
 * Contract captured from developers.pricelabs.co (July 2026): base
 * `https://api.pricelabs.co/v1`, `X-API-Key` header, 60 req/min and 1000
 * req/hour. Every function returns null on any failure so callers degrade
 * instead of inventing prices.
 *
 * SECURITY: this module knows nothing about tenants. One credential sees EVERY
 * listing Luxel manages, so callers must only ever pass a listing resolved from
 * an owner-verified property (see `lib/pricelabs/link.ts`). Never hand it an
 * identifier that came from client input.
 */

const BASE = 'https://api.pricelabs.co/v1';

export const pricelabsConfigured = () => Boolean(process.env.PRICELABS_API_KEY);

/** A PriceLabs listing is addressed by (id, pms) — both come from our mapping. */
export type PricelabsRef = { id: string; pms: string };

export interface PricelabsListing {
  listing_id: string;
  pms_name: string;
  listing_name?: string | null;
  channel_listing_details?: { channel_name?: string | null; channel_listing_id?: string | null }[];
}

export interface PricelabsPriceDay {
  date: string;
  /** PriceLabs' recommendation for the night. */
  price: number | null;
  /** Last price PriceLabs saw on the PMS; -1 means unavailable. */
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

/** Every listing visible to Luxel's account — used only to build the mapping. */
export async function listPricelabsListings(): Promise<PricelabsListing[] | null> {
  const json = await call<{ listings?: PricelabsListing[] } | PricelabsListing[]>(
    '/listings_minimal',
  );
  if (!json) return null;
  const rows = Array.isArray(json) ? json : json.listings;
  return Array.isArray(rows) ? rows : null;
}

/** PriceLabs' recommended nightly prices for ONE resolved listing. */
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
  // The endpoint answers per-listing; we always ask for exactly one.
  const first = Array.isArray(json) ? json[0] : json;
  const rows = first?.data;
  return Array.isArray(rows) ? rows : null;
}

/** Base / floor / ceiling and the sync switch for ONE resolved listing. */
export async function updatePricelabsListing(
  ref: PricelabsRef,
  settings: { base?: number; min?: number; max?: number; pushEnabled?: boolean },
): Promise<boolean> {
  const json = await call<{ listings?: { errors?: unknown[] }[] }>('/listings', {
    method: 'POST',
    body: {
      listings: [
        {
          id: ref.id,
          pms: ref.pms,
          ...(settings.base != null ? { base: settings.base } : {}),
          ...(settings.min != null ? { min: settings.min } : {}),
          ...(settings.max != null ? { max: settings.max } : {}),
          ...(settings.pushEnabled != null ? { push_enabled: settings.pushEnabled } : {}),
        },
      ],
    },
  });
  // Fail CLOSED: the response shape is captured from their docs, not a contract
  // we control, so only a positively-recognised success counts. Reporting a
  // silent no-op as success would tell the host their floor/ceiling is live
  // when it never reached the engine.
  if (!json || typeof json !== 'object') return false;
  const row = json.listings?.[0];
  if (!row) return false;
  return !Array.isArray(row.errors) || row.errors.length === 0;
}
