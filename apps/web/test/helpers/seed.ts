import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export interface SeedPropertyInput {
  nickname: string;
  address?: string;
  comuna?: string;
  sizeM2?: number;
  lat?: number;
  lng?: number;
}

export async function seedImportedProperty(
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

  const { data, error } = await admin
    .from('properties')
    .insert({
      owner_id: customer.id,
      nickname: input.nickname,
      address: input.address ?? null,
      comuna: input.comuna ?? null,
      size_m2: input.sizeM2 ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      platform: 'airbnb',
      external_listing_id: `test:${nodeCrypto.randomUUID()}`,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false };
  await admin.from('property_access').insert({ property_id: data.id, method: 'physical_none' });
  return { ok: true, id: data.id as string };
}
