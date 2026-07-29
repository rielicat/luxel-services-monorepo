/**
 * The operator assignment screen writes the tenant boundary, so it is gated to
 * Clerk admins and must uphold two invariants: a transfer moves the mirrored
 * data with it, and an offboard deletes it. Non-admins can do neither.
 */
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
// Flipped per test so one file can exercise both sides of the admin gate.
process.env.TEST_ADMIN_ROLE = 'member';

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
  clerkClient: async () => ({
    users: { getUser: async () => ({ publicMetadata: { role: process.env.TEST_ADMIN_ROLE } }) },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

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
        return Response.json({ data: [remoteProperty], links: { next: null } });
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
  await admin.from('listing_assignments').delete().eq('external_listing_id', LISTING);
  for (const id of [owner, other].filter(Boolean)) {
    await admin.from('properties').delete().eq('owner_id', id);
    await admin.from('customers').delete().eq('id', id);
  }
  process.env.TEST_ADMIN_ROLE = 'member';
});

describe.skipIf(!LIVE)('operator listing assignment', () => {
  it('refuses every action for a non-admin', async () => {
    process.env.TEST_ADMIN_ROLE = 'member';
    expect((await actions.listUnclaimedListings()).ok).toBe(false);
    expect((await actions.listAssignments()).ok).toBe(false);
    expect((await actions.listAssignableCustomers()).ok).toBe(false);
    expect(
      (await actions.assignListingToCustomer({ externalListingId: LISTING, customerId: owner })).ok,
    ).toBe(false);
    expect((await actions.unassignListingFromCustomer({ externalListingId: LISTING })).ok).toBe(
      false,
    );

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
    });
    expect(r.ok).toBe(true);
    // Imported immediately, so the operator sees the result without waiting.
    const { data: props } = await admin
      .from('properties')
      .select('external_listing_id')
      .eq('owner_id', owner);
    expect(props!.map((p) => p.external_listing_id)).toEqual([LISTING]);

    // …and it is no longer offered as unassigned.
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
      (await actions.assignListingToCustomer({ externalListingId: LISTING, customerId: other })).ok,
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
    expect((await actions.unassignListingFromCustomer({ externalListingId: LISTING })).ok).toBe(
      true,
    );

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
