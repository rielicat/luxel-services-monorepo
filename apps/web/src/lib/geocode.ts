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

async function nominatimSearch(params: Record<string, string>): Promise<GeocodeResult | null> {
  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('countrycodes', 'cl');
  url.searchParams.set('limit', '1');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' },
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

/**
 * Geocode a specific street address within a Santiago commune.
 * Uses Nominatim's structured parameters (street + city + state) for precise
 * house-level results. Falls back to free-form if structured returns nothing.
 */
export async function geocodeAddress(
  street: string,
  commune?: string,
): Promise<GeocodeResult | null> {
  if (!street || street.trim().length < 4) return null;

  if (commune) {
    const structured = await nominatimSearch({
      street,
      city: commune,
      state: 'Región Metropolitana',
    });
    if (structured) return structured;
  }

  // Fallback: free-form query
  const q = commune ? `${street}, ${commune}, Región Metropolitana` : `${street}, Chile`;
  return nominatimSearch({ q });
}
