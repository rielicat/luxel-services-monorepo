import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

const CENTRAL_TOKEN = `tok_assign_${nodeCrypto.randomBytes(12).toString('hex')}`;
const LISTING = 'c3333333-0000-0000-0000-00000000000c';

process.env.HOSPITABLE_API_TOKEN = CENTRAL_TOKEN;
process.env.TEST_CLERK_ID = `test-assign-${nodeCrypto.randomUUID()}`;
process.env.TEST_ADMIN_ROLE = 'member';

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
  clerkClient: async () => ({
    users: { getUser: async () => ({ publicMetadata: { role: process.env.TEST_ADMIN_ROLE } }) },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

const LISTING_AUTO = 'd4444444-0000-0000-0000-00000000000d';
const LISTING_UNKNOWN = 'e5555555-0000-0000-0000-00000000000e';

const withListings = (id: string, email: string | null) => ({
  ...remoteProperty,
  id,
  listings: [
    {
      platform: 'airbnb',
      platform_id: `pl_${id}`,
      platform_user_id: `431${id.slice(0, 3)}`,
      platform_name: 'Host',
      platform_email: email,
    },
    { platform: 'manual', platform_id: 'm1', platform_user_id: 'manual_1', platform_email: null },
  ],
});

const remoteProperty = {
  id: LISTING,
  name: 'Casa Operador',
  public_name: 'Casa Operador',
  picture: null,
  listed: true,
  checkin: '15:00',
  checkout: '11:00',
  amenities: [],
  address: {
    street: 'Calle Central 9',
    city: 'Providencia',
    coordinates: { latitude: '-33.44', longitude: '-70.63' },
  },
  capacity: { max: 2, bedrooms: 1, beds: 1, bathrooms: 1 },
  property_type: 'apartment',
  room_type: 'Entire Home',
  house_rules: {},
};

let admin: ReturnType<typeof createClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let actions: any;
let owner = '';
let other = '';

beforeAll(async () => {
  if (!LIVE) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://public.api.hospitable.com/')) {
      if (url.includes('/properties')) {
        return Response.json({
          data: [
            remoteProperty,
            withListings(LISTING_AUTO, 'owner@test.cl'),
            withListings(LISTING_UNKNOWN, 'nobody@nowhere.cl'),
          ],
          links: { next: null },
        });
      }
      return Response.json({ data: [], links: { next: null } });
    }
    return realFetch(input as RequestInfo, init);
  });

  actions = await import('../src/app/[locale]/(site)/properties/assignment-actions');
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data: a } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'owner@test.cl',
      full_name: 'Owner Host',
    })
    .select('id')
    .single();
  owner = a!.id as string;
  const { data: b } = await admin
    .from('customers')
    .insert({
      clerk_user_id: `test-assign-other-${nodeCrypto.randomUUID()}`,
      email: 'other@test.cl',
      full_name: 'Other Host',
    })
    .select('id')
    .single();
  other = b!.id as string;
});

afterAll(async () => {
  if (!LIVE) return;
  await admin
    .from('listing_assignments')
    .delete()
    .in('external_listing_id', [LISTING, LISTING_AUTO, LISTING_UNKNOWN]);
  for (const id of [owner, other].filter(Boolean)) {
    await admin.from('properties').delete().eq('owner_id', id);
    await admin.from('customers').delete().eq('id', id);
  }
  process.env.TEST_ADMIN_ROLE = 'member';
});

describe.skipIf(!LIVE)('operator listing assignment', () => {
  it('auto-assigns by channel email, and never guesses', async () => {
    const { autoAssignListings } = await import('../src/lib/channels/auto-assign');
    const r = await autoAssignListings();
    expect(r.ok).toBe(true);
    expect(r.assigned).toBe(1);

    const { data } = await admin
      .from('listing_assignments')
      .select('external_listing_id, customer_id, assigned_by')
      .in('external_listing_id', [LISTING, LISTING_AUTO, LISTING_UNKNOWN]);
    expect(data).toHaveLength(1);
    expect(data![0].external_listing_id).toBe(LISTING_AUTO);
    expect(data![0].customer_id).toBe(owner);
    expect(data![0].assigned_by).toBe('auto:channel_email');

    expect(r.ambiguous).toBeGreaterThan(0);

    expect((await autoAssignListings()).assigned).toBe(0);
    await admin.from('listing_assignments').delete().eq('external_listing_id', LISTING_AUTO);
  });

  it('refuses every action for a non-admin', async () => {
    process.env.TEST_ADMIN_ROLE = 'member';
    expect((await actions.listUnclaimedListings()).ok).toBe(false);
    expect((await actions.listAssignments()).ok).toBe(false);
    expect((await actions.listAssignableCustomers()).ok).toBe(false);
    expect(
      (
        await actions.assignListingToCustomer({
          externalListingId: LISTING,
          customerId: owner,
          expectedOwnerId: null,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await actions.unassignListingFromCustomer({
          externalListingId: LISTING,
          expectedCustomerId: owner,
        })
      ).ok,
    ).toBe(false);

    const { data } = await admin
      .from('listing_assignments')
      .select('external_listing_id')
      .eq('external_listing_id', LISTING);
    expect(data ?? []).toHaveLength(0);
  });

  it('shows an unassigned listing, then assigns and imports it', async () => {
    process.env.TEST_ADMIN_ROLE = 'admin';
    const free = await actions.listUnclaimedListings();
    expect(free.ok).toBe(true);
    expect(free.listings.map((l: { externalListingId: string }) => l.externalListingId)).toContain(
      LISTING,
    );

    const r = await actions.assignListingToCustomer({
      externalListingId: LISTING,
      customerId: owner,
      expectedOwnerId: null,
    });
    expect(r.ok).toBe(true);
    expect(r.importOk).toBe(true);
    const { data: props } = await admin
      .from('properties')
      .select('external_listing_id')
      .eq('owner_id', owner);
    expect(props!.map((p) => p.external_listing_id)).toEqual([LISTING]);

    const after = await actions.listUnclaimedListings();
    expect(
      after.listings.map((l: { externalListingId: string }) => l.externalListingId),
    ).not.toContain(LISTING);

    const rows = await actions.listAssignments();
    const row = rows.rows.find(
      (x: { externalListingId: string }) => x.externalListingId === LISTING,
    );
    expect(row.customerId).toBe(owner);
    expect(row.nickname).toBe('Casa Operador');
  });

  it('a transfer moves the mirrored data to the new owner', async () => {
    process.env.TEST_ADMIN_ROLE = 'admin';
    expect(
      (
        await actions.assignListingToCustomer({
          externalListingId: LISTING,
          customerId: other,
          expectedOwnerId: other,
        })
      ).error,
    ).toBe('stale');
    expect(
      (
        await actions.assignListingToCustomer({
          externalListingId: LISTING,
          customerId: other,
          expectedOwnerId: owner,
        })
      ).ok,
    ).toBe(true);

    const { data: gone } = await admin
      .from('properties')
      .select('id')
      .eq('owner_id', owner)
      .eq('external_listing_id', LISTING);
    expect(gone ?? []).toHaveLength(0);
    const { data: moved } = await admin
      .from('properties')
      .select('id')
      .eq('owner_id', other)
      .eq('external_listing_id', LISTING);
    expect(moved).toHaveLength(1);
  });

  it('an offboard deletes the assignment and the mirror', async () => {
    process.env.TEST_ADMIN_ROLE = 'admin';
    expect(
      (
        await actions.unassignListingFromCustomer({
          externalListingId: LISTING,
          expectedCustomerId: owner,
        })
      ).error,
    ).toBe('stale');
    expect(
      (
        await actions.unassignListingFromCustomer({
          externalListingId: LISTING,
          expectedCustomerId: other,
        })
      ).ok,
    ).toBe(true);

    const { data: assignments } = await admin
      .from('listing_assignments')
      .select('external_listing_id')
      .eq('external_listing_id', LISTING);
    expect(assignments ?? []).toHaveLength(0);
    const { data: props } = await admin
      .from('properties')
      .select('id')
      .eq('external_listing_id', LISTING);
    expect(props ?? []).toHaveLength(0);
  });
});
