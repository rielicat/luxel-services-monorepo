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
process.env.LUXEL_ADMIN_ORG_SLUG = 'luxel-test-ops';

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: async () => ({
    id: process.env.TEST_CLERK_ID,
    primaryEmailAddress: { emailAddress: 'operator@test.cl' },
    emailAddresses: [{ emailAddress: 'operator@test.cl' }],
  }),
  clerkClient: async () => ({
    users: {
      getUser: async () => ({ publicMetadata: { role: process.env.TEST_ADMIN_ROLE } }),
      getOrganizationMembershipList: async () => ({
        data:
          process.env.TEST_ADMIN_ROLE === 'admin'
            ? [{ organization: { id: 'org_test', slug: 'luxel-test-ops' }, role: 'admin' }]
            : [],
      }),
    },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

const LISTING_AUTO = 'd4444444-0000-0000-0000-00000000000d';
const LISTING_UNKNOWN = 'e5555555-0000-0000-0000-00000000000e';
const LISTING_CLAIM = 'f6666666-0000-0000-0000-00000000000f';
const LISTING_DUPE = '17777777-0000-0000-0000-000000000017';
const LISTING_SECOND = '28888888-0000-0000-0000-000000000028';

const EXTRA_PROPERTIES: Array<Record<string, unknown>> = [];
const CHANNELS: Array<Record<string, unknown>> = [];

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

const listingWith = (id: string, email: string | null, userId: string | null) => ({
  ...remoteProperty,
  id,
  listings: [
    {
      platform: 'airbnb',
      platform_id: `pl_${id}`,
      platform_user_id: userId,
      platform_name: 'Host',
      platform_email: email,
    },
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
const madeCustomers: string[] = [];

async function makeCustomer(email: string): Promise<string> {
  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: `test-assign-${nodeCrypto.randomUUID()}`,
      email,
      full_name: 'Extra Host',
    })
    .select('id')
    .single();
  const id = data!.id as string;
  madeCustomers.push(id);
  return id;
}

beforeAll(async () => {
  if (!LIVE) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://public.api.hospitable.com/')) {
      if (url.includes('/channels')) {
        return Response.json({ data: CHANNELS, links: { next: null } });
      }
      if (url.includes('/properties')) {
        return Response.json({
          data: [
            remoteProperty,
            withListings(LISTING_AUTO, 'owner@test.cl'),
            withListings(LISTING_UNKNOWN, 'nobody@nowhere.cl'),
            ...EXTRA_PROPERTIES,
          ],
          links: { next: null },
        });
      }
      return Response.json({ data: [], links: { next: null } });
    }
    return realFetch(input as RequestInfo, init);
  });

  actions = await import('../src/app/(panel)/listings/assignment-actions');
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
    .in('external_listing_id', [
      LISTING,
      LISTING_AUTO,
      LISTING_UNKNOWN,
      LISTING_CLAIM,
      LISTING_DUPE,
      LISTING_SECOND,
    ]);
  for (const id of [owner, other, ...madeCustomers].filter(Boolean)) {
    await admin.from('properties').delete().eq('owner_id', id);
    await admin.from('customers').delete().eq('id', id);
  }
  process.env.TEST_ADMIN_ROLE = 'member';
});

describe.skipIf(!LIVE)('operator listing assignment', () => {
  it('auto-assigns by channel email, and never guesses', async () => {
    const { autoAssignListings } = await import('@luxel/core/channels/auto-assign');
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

describe.skipIf(!LIVE)('host connection attribution', () => {
  let claimant = '';

  it('refuses a claimed email until an operator has issued that host an invitation', async () => {
    const { claimAirbnbEmail } = await import('@luxel/core/channels/connection');
    const { autoAssignListings } = await import('@luxel/core/channels/auto-assign');

    const impostor = await makeCustomer('impostor@test.cl');
    expect((await claimAirbnbEmail(impostor, 'claim-airbnb@test.cl')).ok).toBe(true);

    EXTRA_PROPERTIES.push(listingWith(LISTING_CLAIM, 'claim-airbnb@test.cl', 'u_claim'));
    expect((await autoAssignListings()).ok).toBe(true);

    const { data: stolen } = await admin
      .from('listing_assignments')
      .select('customer_id')
      .eq('external_listing_id', LISTING_CLAIM);
    expect(stolen ?? []).toHaveLength(0);

    const { verifyConnection } = await import('@luxel/core/channels/connection');
    expect((await verifyConnection(impostor)).outcome).toBe('not_found');

    await admin.from('customers').delete().eq('id', impostor);
  });

  it('attributes a listing through the Airbnb email the host claims', async () => {
    const { claimAirbnbEmail, getHostConnection, recordInvite } =
      await import('@luxel/core/channels/connection');
    const { autoAssignListings } = await import('@luxel/core/channels/auto-assign');

    claimant = await makeCustomer('claim-signup@test.cl');
    const claim = await claimAirbnbEmail(claimant, '  Claim-Airbnb@Test.CL  ');
    expect(claim.ok).toBe(true);
    expect(claim.conflict).toBe(false);
    expect(await recordInvite(claimant, 'https://my.hospitable.com/invite/abc')).toBe(true);

    expect((await autoAssignListings()).ok).toBe(true);

    const { data } = await admin
      .from('listing_assignments')
      .select('customer_id, assigned_by')
      .eq('external_listing_id', LISTING_CLAIM)
      .maybeSingle();
    expect(data!.customer_id).toBe(claimant);
    expect(data!.assigned_by).toBe('auto:claimed_email');

    const conn = await getHostConnection(claimant);
    expect(conn!.state).toBe('connected');
    expect(conn!.channelUserId).toBe('u_claim');
    expect(conn!.claimedAirbnbEmail).toBe('claim-airbnb@test.cl');
  });

  it('never assigns a listing two customers claim, and calls an operator', async () => {
    const { claimAirbnbEmail, getHostConnection } = await import('@luxel/core/channels/connection');
    const { autoAssignListings } = await import('@luxel/core/channels/auto-assign');

    const { recordInvite } = await import('@luxel/core/channels/connection');
    const first = await makeCustomer('dupe-a@test.cl');
    const second = await makeCustomer('dupe-b@test.cl');
    expect((await claimAirbnbEmail(first, 'dupe-airbnb@test.cl')).conflict).toBe(false);
    expect(await recordInvite(first, 'https://my.hospitable.com/invite/dupe-a')).toBe(true);
    const rival = await claimAirbnbEmail(second, 'DUPE-AIRBNB@test.cl');
    expect(rival.conflict).toBe(true);
    expect(rival.state).toBe('needs_operator');
    expect(await recordInvite(second, 'https://my.hospitable.com/invite/dupe-b')).toBe(true);

    EXTRA_PROPERTIES.push(listingWith(LISTING_DUPE, 'dupe-airbnb@test.cl', 'u_dupe'));
    expect((await autoAssignListings()).ok).toBe(true);

    const { data } = await admin
      .from('listing_assignments')
      .select('customer_id')
      .eq('external_listing_id', LISTING_DUPE);
    expect(data ?? []).toHaveLength(0);
    expect((await getHostConnection(second))!.state).toBe('needs_operator');

    const { verifyConnection } = await import('@luxel/core/channels/connection');
    const contested = await verifyConnection(first);
    expect(contested.outcome).toBe('not_found');
    expect(contested.state).toBe('needs_operator');
  });

  it('attributes a second listing by the Airbnb user_id, with no email match', async () => {
    const { autoAssignListings } = await import('@luxel/core/channels/auto-assign');

    EXTRA_PROPERTIES.push(listingWith(LISTING_SECOND, 'not-a-customer@nowhere.cl', 'u_claim'));
    expect((await autoAssignListings()).ok).toBe(true);

    const { data } = await admin
      .from('listing_assignments')
      .select('customer_id, assigned_by')
      .eq('external_listing_id', LISTING_SECOND)
      .maybeSingle();
    expect(data!.customer_id).toBe(claimant);
    expect(data!.assigned_by).toBe('auto:channel_user_id');
  });

  it('verify() tells a connection with no listings apart from nothing found', async () => {
    const { verifyConnection } = await import('@luxel/core/channels/connection');
    const { recordInvite } = await import('@luxel/core/channels/connection');
    const lonely = await makeCustomer('lonely@test.cl');
    expect(await recordInvite(lonely, 'https://my.hospitable.com/invite/lonely')).toBe(true);

    const nothing = await verifyConnection(lonely);
    expect(nothing.ok).toBe(true);
    expect(nothing.outcome).toBe('not_found');
    expect(nothing.state).toBe('invite_sent');
    expect(nothing.listings).toBe(0);

    CHANNELS.push({
      id: 'chan-lonely',
      user_id: 'u_lonely',
      name: 'Lonely Host',
      login: 'lonely@test.cl',
      platform: 'airbnb',
    });
    const empty = await verifyConnection(lonely);
    expect(empty.ok).toBe(true);
    expect(empty.outcome).toBe('no_listings');
    expect(empty.state).toBe('no_listings');
    expect(empty.channelUserId).toBe('u_lonely');

    const full = await verifyConnection(claimant);
    expect(full.outcome).toBe('connected');
    expect(full.state).toBe('connected');
    expect(full.listings).toBe(2);
  });
});
