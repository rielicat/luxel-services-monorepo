/**
 * Address → lat/lng using Nominatim (OpenStreetMap, free).
 * Usage policy requires an identifying User-Agent and ≤1 req/sec — fine for our volume.
 * Cached for 24h via Next's data cache.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'ServiciosLuxel/1.0 (contacto@serviciosluxel.cl)';

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  if (!query || query.trim().length < 4) return null;

  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set('q', `${query}, Chile`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('countrycodes', 'cl');
  url.searchParams.set('limit', '1');

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'es',
    },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const first = data[0];
  if (!first) return null;

  return {
    lat: parseFloat(first.lat),
    lng: parseFloat(first.lon),
    displayName: first.display_name,
  };
}
