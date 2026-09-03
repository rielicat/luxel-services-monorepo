import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-manual-${nodeCrypto.randomUUID()}`;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

let admin: ReturnType<typeof createClient>;
let unassignListing: (listingId: string, customerId: string) => Promise<boolean>;
let customerId: string;

async function seedPropertyWithManualStay(listingId: string): Promise<string> {
  const { data: property } = await admin
    .from('properties')
    .insert({
      owner_id: customerId,
      nickname: 'Depto Directo',
      platform: 'airbnb',
      external_listing_id: listingId,
    })
    .select('id')
    .single();
  const propertyId = property!.id as string;
  await admin.from('listing_assignments').insert({
    external_listing_id: listingId,
    customer_id: customerId,
    assigned_at: new Date().toISOString(),
    assigned_by: 'test',
  });
  await admin.from('calendar_blocks').insert({
    property_id: propertyId,
    starts_on: '2027-03-01',
    ends_on: '2027-03-05',
    source: 'import',
    origin: 'manual',
    summary: 'Estadía directa',
    external_uid: `manual:${nodeCrypto.randomUUID()}`,
  });
  return propertyId;
}

beforeAll(async () => {
  if (!LIVE) return;
  unassignListing = (await import('../src/lib/channels/scope')).unassignListing;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'manual@test.cl',
      full_name: 'Manual Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterAll(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
  await admin.from('listing_assignments').delete().eq('customer_id', customerId);
  await admin.from('customers').delete().eq('id', customerId);
});

describe.skipIf(!LIVE)('manual stays survive property deletion paths', () => {
  it('refuses to delete a property whose nights an operator booked by hand', async () => {
    const listing = `manual-guard-${nodeCrypto.randomUUID()}`;
    const propertyId = await seedPropertyWithManualStay(listing);

    const released = await unassignListing(listing, customerId);
    expect(released).toBe(true);

    const { data: survivor } = await admin
      .from('properties')
      .select('id')
      .eq('id', propertyId)
      .maybeSingle();
    expect(survivor?.id).toBe(propertyId);

    const { data: block } = await admin
      .from('calendar_blocks')
      .select('id')
      .eq('property_id', propertyId)
      .eq('origin', 'manual')
      .maybeSingle();
    expect(block).not.toBeNull();
  });

  it('still deletes a property that holds nothing an operator created', async () => {
    const listing = `manual-guard-${nodeCrypto.randomUUID()}`;
    const { data: property } = await admin
      .from('properties')
      .insert({
        owner_id: customerId,
        nickname: 'Depto Sin Estadías',
        platform: 'airbnb',
        external_listing_id: listing,
      })
      .select('id')
      .single();
    await admin.from('listing_assignments').insert({
      external_listing_id: listing,
      customer_id: customerId,
      assigned_at: new Date().toISOString(),
      assigned_by: 'test',
    });

    expect(await unassignListing(listing, customerId)).toBe(true);
    const { data: gone } = await admin
      .from('properties')
      .select('id')
      .eq('id', property!.id as string)
      .maybeSingle();
    expect(gone).toBeNull();
  });
});
