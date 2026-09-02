import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

const CENTRAL_TOKEN = `tok_central_${nodeCrypto.randomBytes(12).toString('hex')}`;
const LISTING_A = 'a1111111-0000-0000-0000-00000000000a';
const LISTING_B = 'b2222222-0000-0000-0000-00000000000b';

const RETIRED_TOKEN = `tok_retired_${nodeCrypto.randomBytes(12).toString('hex')}`;
process.env.PROVIDER_API_KEY = CENTRAL_TOKEN;
process.env.HOSPITABLE_API_TOKEN = RETIRED_TOKEN;
process.env.TEST_CLERK_ID = `test-tenant-a-${nodeCrypto.randomUUID()}`;

const remoteProperty = (id: string, name: string) => ({
  id,
  name,
  public_name: name,
  picture: null,
  listed: true,
  checkin: '15:00',
  checkout: '11:00',
  amenities: [],
  address: {
    street: 'Calle 1',
    city: 'Providencia',
    coordinates: { latitude: '-33.4', longitude: '-70.6' },
  },
  capacity: { max: 4, bedrooms: 2, beds: 2, bathrooms: 1 },
  property_type: 'apartment',
  room_type: 'Entire Home',
  house_rules: {},
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
  clerkClient: async () => ({
    users: { getUser: async () => ({ publicMetadata: { role: 'member' } }) },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

let admin: ReturnType<typeof createClient>;
let reconcile: (c: string, t: string, s?: 'own' | 'central') => Promise<{ ok: boolean }>;
let assignListing: (e: string, c: string, by: string, expected: string | null) => Promise<boolean>;
let unassignListing: (e: string, expected: string) => Promise<boolean>;
let hospitableAccess: (c: string) => Promise<{ token: string; scope: string } | null>;
let resolvePricelabsRef: (c: string, p: string) => Promise<{ id: string } | null>;
let customerA = '';
let customerB = '';

beforeAll(async () => {
  if (!LIVE) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://public.api.hospitable.com/')) {
      if (url.includes('/properties')) {
        return Response.json({
          data: [remoteProperty(LISTING_A, 'Casa A'), remoteProperty(LISTING_B, 'Casa B')],
          links: { next: null },
        });
      }
      return Response.json({ data: [], links: { next: null } });
    }
    return realFetch(input as RequestInfo, init);
  });

  reconcile = (await import('../src/lib/channels/hospitable-sync'))
    .reconcileHospitableProperties as typeof reconcile;
  const scopeMod = await import('../src/lib/channels/scope');
  assignListing = scopeMod.assignListing;
  unassignListing = scopeMod.unassignListing;
  hospitableAccess = scopeMod.hospitableAccess as typeof hospitableAccess;
  resolvePricelabsRef = (await import('../src/lib/pricelabs/link'))
    .resolvePricelabsRef as typeof resolvePricelabsRef;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data: a } = await admin
    .from('customers')
    .insert({ clerk_user_id: process.env.TEST_CLERK_ID!, email: 'a@test.cl', full_name: 'Host A' })
    .select('id')
    .single();
  customerA = a!.id as string;
  const { data: b } = await admin
    .from('customers')
    .insert({
      clerk_user_id: `test-tenant-b-${nodeCrypto.randomUUID()}`,
      email: 'b@test.cl',
      full_name: 'Host B',
    })
    .select('id')
    .single();
  customerB = b!.id as string;

  await assignListing(LISTING_A, customerA, 'test', null);
  await assignListing(LISTING_B, customerB, 'test', null);
});

afterAll(async () => {
  if (!LIVE) return;
  await admin
    .from('listing_assignments')
    .delete()
    .in('external_listing_id', [LISTING_A, LISTING_B]);
  for (const id of [customerA, customerB].filter(Boolean)) {
    await admin.from('properties').delete().eq('owner_id', id);
    await admin.from('customers').delete().eq('id', id);
  }
});

describe.skipIf(!LIVE)('central-account tenancy', () => {
  it('a central sync imports ONLY the listings assigned to that customer', async () => {
    expect((await reconcile(customerA, CENTRAL_TOKEN, 'central')).ok).toBe(true);

    const { data: aRows } = await admin
      .from('properties')
      .select('external_listing_id')
      .eq('owner_id', customerA);
    expect(aRows!.map((r) => r.external_listing_id)).toEqual([LISTING_A]);

    const { data: bRows } = await admin
      .from('properties')
      .select('external_listing_id')
      .eq('owner_id', customerB);
    expect(bRows ?? []).toHaveLength(0);
  });

  it('syncing one customer never prunes another customer’s properties', async () => {
    await reconcile(customerB, CENTRAL_TOKEN, 'central');
    await reconcile(customerA, CENTRAL_TOKEN, 'central');

    const { data: bRows } = await admin
      .from('properties')
      .select('external_listing_id')
      .eq('owner_id', customerB);
    expect(bRows!.map((r) => r.external_listing_id)).toEqual([LISTING_B]);
  });

  it('refuses to resolve a PriceLabs listing for a property the caller does not own', async () => {
    await reconcile(customerB, CENTRAL_TOKEN, 'central');
    const { data: bProp } = await admin
      .from('properties')
      .select('id')
      .eq('owner_id', customerB)
      .single();
    await admin
      .from('property_addons')
      .insert({ property_id: bProp!.id, addon: 'dynamic_pricing', status: 'active', price_clp: 1 });
    await admin
      .from('properties')
      .update({ pricelabs_listing_id: LISTING_B, pricelabs_pms: 'hospitable' })
      .eq('id', bProp!.id);

    expect(await resolvePricelabsRef(customerA, bProp!.id as string)).toBeNull();
    expect(await resolvePricelabsRef(customerB, bProp!.id as string)).toEqual({
      id: LISTING_B,
      pms: 'hospitable',
    });
  });

  it('withholds the operator credential from a customer with no assignments', async () => {
    const { data: stranger } = await admin
      .from('customers')
      .insert({
        clerk_user_id: `test-tenant-c-${nodeCrypto.randomUUID()}`,
        email: 'c@test.cl',
        full_name: 'Host C',
      })
      .select('id')
      .single();
    expect(await hospitableAccess(stranger!.id as string)).toBeNull();
    expect((await hospitableAccess(customerB))?.scope).toBe('central');
    await admin
      .from('customers')
      .delete()
      .eq('id', stranger!.id as string);
  });

  it('never imports an unassigned listing, and freezes rather than wiping', async () => {
    await admin.from('listing_assignments').delete().eq('external_listing_id', LISTING_A);
    await admin.from('properties').delete().eq('owner_id', customerA);
    await reconcile(customerA, CENTRAL_TOKEN, 'central');
    const { data: none } = await admin
      .from('properties')
      .select('external_listing_id')
      .eq('owner_id', customerA);
    expect(none ?? []).toHaveLength(0);

    await assignListing(LISTING_A, customerA, 'test', null);
    await reconcile(customerA, CENTRAL_TOKEN, 'central');
    await admin.from('listing_assignments').delete().eq('external_listing_id', LISTING_A);
    await reconcile(customerA, CENTRAL_TOKEN, 'central');
    const { data: frozen } = await admin
      .from('properties')
      .select('external_listing_id')
      .eq('owner_id', customerA);
    expect(frozen!.map((r) => r.external_listing_id)).toEqual([LISTING_A]);

    expect(await unassignListing(LISTING_A, customerA)).toBe(false);
    const { data: kept } = await admin
      .from('properties')
      .select('external_listing_id')
      .eq('owner_id', customerA);
    expect(kept!.map((r) => r.external_listing_id)).toEqual([LISTING_A]);

    await assignListing(LISTING_A, customerA, 'test', null);
    expect(await unassignListing(LISTING_A, customerA)).toBe(true);
    const { data: gone } = await admin
      .from('properties')
      .select('external_listing_id')
      .eq('owner_id', customerA);
    expect(gone ?? []).toHaveLength(0);
    await assignListing(LISTING_A, customerA, 'test', null);
  });

  it('a tokenless watermark row is not a connection of the customer’s own', async () => {
    const { fetchConnection } = await import('../src/lib/host/queries');
    await admin
      .from('channel_connections')
      .upsert(
        { customer_id: customerB, provider: 'hospitable', status: 'connected' },
        { onConflict: 'customer_id,provider' },
      );
    expect((await fetchConnection(customerB))?.has_token).toBe(false);

    const { encryptPII } = await import('../src/lib/crypto/pii');
    await admin
      .from('channel_connections')
      .update({ token_enc: encryptPII('tok_real_own_token_value_x') })
      .eq('customer_id', customerB)
      .eq('provider', 'hospitable');
    expect((await fetchConnection(customerB))?.has_token).toBe(true);

    await admin
      .from('channel_connections')
      .delete()
      .eq('customer_id', customerB)
      .eq('provider', 'hospitable');
  });

  it('treats a stored operator credential as central, not as the customer’s own', async () => {
    const { encryptPII } = await import('../src/lib/crypto/pii');
    await admin.from('channel_connections').upsert(
      {
        customer_id: customerA,
        provider: 'hospitable',
        token_enc: encryptPII(CENTRAL_TOKEN),
        status: 'connected',
      },
      { onConflict: 'customer_id,provider' },
    );
    expect((await hospitableAccess(customerA))?.scope).toBe('central');

    await admin.from('channel_connections').upsert(
      {
        customer_id: customerA,
        provider: 'hospitable',
        token_enc: encryptPII(RETIRED_TOKEN),
        status: 'connected',
      },
      { onConflict: 'customer_id,provider' },
    );
    expect((await hospitableAccess(customerA))?.scope).toBe('central');

    await admin.from('channel_connections').upsert(
      {
        customer_id: customerA,
        provider: 'hospitable',
        token_enc: encryptPII('tok_a_real_customer_token'),
        status: 'connected',
      },
      { onConflict: 'customer_id,provider' },
    );
    expect((await hospitableAccess(customerA))?.scope).toBe('own');

    await admin
      .from('channel_connections')
      .delete()
      .eq('customer_id', customerA)
      .eq('provider', 'hospitable');
  });
});
