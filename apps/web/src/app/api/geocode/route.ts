import { NextRequest, NextResponse } from 'next/server';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'ServiciosLuxel/1.0 (contacto@serviciosluxel.cl)';
// Bounding box for Región Metropolitana
const RM_VIEWBOX = '-71.5,-34.2,-69.8,-32.9';

export interface GeocodeSuggestion {
  placeId: number;
  displayName: string;
  shortName: string;
  commune: string;
  lat: number;
  lng: number;
}

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    road?: string;
    house_number?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
  };
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 3) return NextResponse.json([]);

  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('countrycodes', 'cl');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('viewbox', RM_VIEWBOX);
  url.searchParams.set('bounded', '1');

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' },
  });
  if (!res.ok) return NextResponse.json([]);

  const data = (await res.json()) as NominatimResult[];

  const suggestions: GeocodeSuggestion[] = data.map((r) => {
    const addr = r.address;
    const parts = [addr.road, addr.house_number].filter(Boolean);
    const shortName = parts.length > 0 ? parts.join(' ') : r.display_name.split(',')[0]!;
    const commune = addr.city ?? addr.town ?? addr.village ?? addr.suburb ?? '';
    return {
      placeId: r.place_id,
      displayName: r.display_name,
      shortName,
      commune,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    };
  });

  return NextResponse.json(suggestions);
}
