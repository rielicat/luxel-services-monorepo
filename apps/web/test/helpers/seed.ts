/**
 * Test-only property seeding. The app has NO manual property creation — rows
 * are a strict mirror of the host's Hospitable account — so the e2e suites
 * seed their fixtures here instead of through a (now-removed) server action.
 * Verbatim port of the old createProperty behavior: resolves the customer from
 * TEST_CLERK_ID, best-effort geocodes, inserts property + default access row.
 */
import { createClient } from '@supabase/supabase-js';
import { geocodeAddress } from '../../src/lib/geocode';

export interface SeedPropertyInput {
  nickname: string;
  address?: string;
  comuna?: string;
  bedrooms?: number;
  bathrooms?: number;
  sizeM2?: number;
  lat?: number;
  lng?: number;
}

export async function createProperty(
  input: SeedPropertyInput,
): Promise<{ ok: boolean; id?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  const clerkId = process.env.TEST_CLERK_ID;
  if (!url || !key || !clerkId) return { ok: false };
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('clerk_user_id', clerkId)
    .maybeSingle();
  if (!customer) return { ok: false };

  let lat = input.lat ?? null;
  let lng = input.lng ?? null;
  if ((lat == null || lng == null) && input.address) {
    const g = await geocodeAddress(input.address);
    if (g) {
      lat = g.lat;
      lng = g.lng;
    }
  }

  const { data, error } = await admin
    .from('properties')
    .insert({
      owner_id: customer.id,
      nickname: input.nickname,
      address: input.address ?? null,
      comuna: input.comuna ?? null,
      bedrooms: input.bedrooms ?? null,
      bathrooms: input.bathrooms ?? null,
      size_m2: input.sizeM2 ?? null,
      lat,
      lng,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false };
  await admin.from('property_access').insert({ property_id: data.id, method: 'physical_none' });
  return { ok: true, id: data.id as string };
}
