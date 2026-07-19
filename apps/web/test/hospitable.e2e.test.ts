/**
 * End-to-end proof of the SaaS Hospitable connection: token verified against the
 * (mocked, real-shape) API, stored ENCRYPTED per customer, properties imported
 * with coordinates, reservations → calendar blocks (cancellations dropped),
 * cleanings suggested, re-sync idempotent, disconnect wipes the connection.
 * API shapes mirror live captures from public.api.hospitable.com (2026-07).
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-hosp-${nodeCrypto.randomUUID()}`;
process.env.LUXEL_PII_KEY = nodeCrypto.randomBytes(32).toString('hex');
delete process.env.HOSPITABLE_API_TOKEN; // per-customer tokens only — no env fallback

const FAKE_TOKEN = `tok_${nodeCrypto.randomBytes(24).toString('hex')}`;
const HOSP_PROPERTY_ID = 'a6eb2c65-1e45-43a8-9cde-000000000001';

const PROPERTIES_PAYLOAD = {
  data: [
    {
      id: HOSP_PROPERTY_ID,
      name: 'JOSÉ MANUEL INFANTE 1045 - DPTO 401',
      public_name: 'Depto Providencia céntrico',
      listed: true,
      address: {
        street: 'José Manuel Infante 1045',
        city: 'Providencia',
        state: 'Región Metropolitana',
        coordinates: { latitude: '-33.44095859', longitude: '-70.63219' },
      },
      capacity: { max: 6, bedrooms: 3, beds: 3, bathrooms: 2 },
    },
  ],
  links: { next: null },
};

const RESERVATIONS_PAYLOAD = {
  data: [
    {
      id: 'res-1',
      code: 'HMRSHPJXAE',
      platform: 'airbnb',
      arrival_date: '2027-03-03T00:00:00-04:00',
      departure_date: '2027-03-05T00:00:00-04:00',
      reservation_status: { current: { category: 'accepted' } },
      status: 'accepted',
    },
    {
      id: 'res-2',
      code: 'HM8TX2H8CD',
      platform: 'airbnb',
      arrival_date: '2027-03-10T00:00:00-04:00',
      departure_date: '2027-03-14T00:00:00-04:00',
      reservation_status: { current: { category: 'accepted' } },
      status: 'accepted',
    },
    {
      id: 'res-3',
      code: 'HMCANCELLED',
      platform: 'airbnb',
      arrival_date: '2027-03-20T00:00:00-04:00',
      departure_date: '2027-03-22T00:00:00-04:00',
      reservation_status: { current: { category: 'cancelled' } },
      status: 'cancelled',
    },
  ],
  links: { next: null },
};

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

let admin: ReturnType<typeof createClient>;
let connectHospitable: (
  i: unknown,
) => Promise<{ ok: boolean; error?: string; properties?: number }>;
let syncHospitable: () => Promise<{ ok: boolean; properties?: number; reservations?: number }>;
let disconnectHospitable: () => Promise<{ ok: boolean }>;
let decryptPII: (s: string) => string;
let customerId: string;
let apiCalls = 0;

beforeAll(async () => {
  if (!LIVE) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://public.api.hospitable.com/')) {
      apiCalls++;
      const auth = new Headers(init?.headers).get('authorization') ?? '';
      if (auth !== `Bearer ${FAKE_TOKEN}`) return new Response('Unauthorized', { status: 401 });
      if (url.includes('/reservations')) {
        return Response.json(RESERVATIONS_PAYLOAD);
      }
      if (url.includes('/properties')) {
        return Response.json(PROPERTIES_PAYLOAD);
      }
      return new Response('Not found', { status: 404 });
    }
    return realFetch(input, init);
  });

  const a = await import('../src/app/[locale]/(site)/properties/channel-actions');
  connectHospitable = a.connectHospitable;
  syncHospitable = a.syncHospitable;
  disconnectHospitable = a.disconnectHospitable;
  decryptPII = (await import('../src/lib/crypto/pii')).decryptPII;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'hosp@test.cl',
      full_name: 'Hosp Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
  await admin.from('channel_connections').delete().eq('customer_id', customerId);
});

describe.skipIf(!LIVE)('Hospitable SaaS connection (end to end)', () => {
  it('rejects an invalid token without storing anything', async () => {
    const r = await connectHospitable({ token: `tok_bad_${'x'.repeat(24)}` });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_token');
    const { count } = await admin
      .from('channel_connections')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId);
    expect(count).toBe(0);
  });

  it('connects, stores the token encrypted, imports the property + reservations + cleanings', async () => {
    const r = await connectHospitable({ token: FAKE_TOKEN });
    expect(r.ok).toBe(true);
    expect(r.properties).toBe(1);

    // Token at rest is ciphertext, recoverable, never plaintext.
    const { data: conn } = await admin
      .from('channel_connections')
      .select('token_enc, status, last_synced_at')
      .eq('customer_id', customerId)
      .single();
    expect(conn!.token_enc).not.toContain(FAKE_TOKEN);
    expect(decryptPII(conn!.token_enc as string)).toBe(FAKE_TOKEN);
    expect(conn!.status).toBe('connected');
    expect(conn!.last_synced_at).toBeTruthy();

    // Property imported with identity, capacity and coordinates.
    const { data: prop } = await admin
      .from('properties')
      .select('id, nickname, comuna, bedrooms, bathrooms, lat, lng, external_listing_id, platform')
      .eq('owner_id', customerId)
      .single();
    expect(prop!.external_listing_id).toBe(HOSP_PROPERTY_ID);
    expect(prop!.nickname).toBe('Depto Providencia céntrico');
    expect(prop!.comuna).toBe('Providencia');
    expect(prop!.bedrooms).toBe(3);
    expect(Number(prop!.lat)).toBeCloseTo(-33.44095859, 4);

    // Accepted reservations became blocks; the cancelled one was dropped.
    const { data: blocks } = await admin
      .from('calendar_blocks')
      .select('starts_on, ends_on, external_uid')
      .eq('property_id', prop!.id)
      .like('external_uid', 'hosp:%')
      .order('starts_on');
    expect(blocks).toHaveLength(2);
    expect(blocks![0]).toMatchObject({ starts_on: '2027-03-03', ends_on: '2027-03-05' });

    // Check-out-driven cleanings were suggested.
    const { count: cleanings } = await admin
      .from('cleanings')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', prop!.id);
    expect(cleanings).toBe(2);
  });

  it('re-sync is idempotent: one property, blocks refreshed not duplicated', async () => {
    await connectHospitable({ token: FAKE_TOKEN });
    const again = await syncHospitable();
    expect(again.ok).toBe(true);

    const { count: props } = await admin
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', customerId);
    expect(props).toBe(1);

    const { data: prop } = await admin
      .from('properties')
      .select('id')
      .eq('owner_id', customerId)
      .single();
    const { count: blocks } = await admin
      .from('calendar_blocks')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', prop!.id);
    expect(blocks).toBe(2);
  });

  it('disconnect removes the connection and sync stops working', async () => {
    await connectHospitable({ token: FAKE_TOKEN });
    expect((await disconnectHospitable()).ok).toBe(true);
    const { count } = await admin
      .from('channel_connections')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId);
    expect(count).toBe(0);
    const r = await syncHospitable();
    expect(r.ok).toBe(false); // no token (env fallback removed in this test)
    expect(apiCalls).toBeGreaterThan(0);
  });
});
