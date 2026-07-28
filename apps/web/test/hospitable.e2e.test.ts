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
delete process.env.OPENAI_API_KEY;
process.env.LUXEL_DEV_MOCK = '1'; // dev-mock AI so auto-replies are deterministic

const FAKE_TOKEN = `tok_${nodeCrypto.randomBytes(24).toString('hex')}`;
const HOSP_PROPERTY_ID = 'a6eb2c65-1e45-43a8-9cde-000000000001';

const PROPERTIES_PAYLOAD = {
  data: [
    {
      id: HOSP_PROPERTY_ID,
      name: 'JOSÉ MANUEL INFANTE 1045 - DPTO 401',
      public_name: 'Depto Providencia céntrico',
      picture: 'https://a0.muscache.com/im/pictures/hosting/test/original/depto.png',
      listed: true,
      timezone: '-0400',
      currency: 'CLP',
      summary: '',
      description: '',
      checkin: '15:00',
      checkout: '11:00',
      amenities: ['ac', 'kitchen', 'wireless_internet', 'jacuzzi'],
      address: {
        number: null,
        street: 'José Manuel Infante 1045',
        city: 'Providencia',
        state: 'Región Metropolitana',
        postcode: '7501117',
        country: 'CL',
        country_name: 'Chile',
        coordinates: { latitude: '-33.44095859', longitude: '-70.63219' },
        display: 'José Manuel Infante 1045, Providencia, Región Metropolitana, 7501117, CL',
      },
      capacity: { max: 6, bedrooms: 3, beds: 3, bathrooms: 2 },
      property_type: 'apartment',
      room_type: 'Entire Home',
      tags: [],
      house_rules: { pets_allowed: true, smoking_allowed: true, events_allowed: false },
      calendar_restricted: false,
      parent_child: null,
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

// Failure-mode switch for the properties endpoint: 'paged_fail' serves page 1
// with a next link and 429s page 2 (partial fetch); 'empty' serves a valid
// zero-listing body. Both must leave the local mirror untouched.
let PROPERTIES_MODE: 'normal' | 'paged_fail' | 'empty' = 'normal';

// Mutable conversation state for the messages endpoint (per reservation res-1).
// eslint-disable-next-line prefer-const
let MESSAGES: Array<{
  id: string;
  body: string;
  sender_type: string;
  created_at: string;
  sender?: { first_name?: string };
}> = [];
const SENT: Array<{ reservationId: string; body: string }> = [];

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
      const msgMatch = url.match(/\/reservations\/([^/]+)\/messages/);
      if (msgMatch) {
        if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
          const body = JSON.parse((init?.body as string) ?? '{}') as { body?: string };
          SENT.push({ reservationId: msgMatch[1]!, body: body.body ?? '' });
          return Response.json({ data: { id: `sent-${SENT.length}` } });
        }
        return Response.json({
          data: msgMatch[1] === 'res-1' ? MESSAGES : [],
          links: { next: null },
        });
      }
      if (url.includes('/reservations')) {
        return Response.json(RESERVATIONS_PAYLOAD);
      }
      if (url.includes('/calendar')) {
        // Real captured shape: price.amount arrives in cents.
        return Response.json({
          data: {
            days: [
              {
                date: '2026-07-28',
                day: 'TUESDAY',
                min_stay: 1,
                status: { reason: 'RESERVED', source_type: 'RESERVATION', available: false },
                price: { amount: 16645000, currency: 'CLP', formatted: 'CLP 166,450' },
              },
              {
                date: '2026-07-29',
                day: 'WEDNESDAY',
                min_stay: 1,
                status: { reason: 'AVAILABLE', source_type: null, available: true },
                price: { amount: 16645000, currency: 'CLP', formatted: 'CLP 166,450' },
              },
            ],
          },
        });
      }
      if (url.includes('/properties')) {
        if (PROPERTIES_MODE === 'empty') return Response.json({ data: [], links: { next: null } });
        if (PROPERTIES_MODE === 'paged_fail') {
          if (url.includes('page=2')) return new Response('Too Many Requests', { status: 429 });
          return Response.json({
            ...PROPERTIES_PAYLOAD,
            links: { next: 'https://public.api.hospitable.com/v2/properties?per_page=100&page=2' },
          });
        }
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
  MESSAGES = [];
  SENT.length = 0;
  PROPERTIES_MODE = 'normal';
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

  it('mirrors the full listing record and prunes anything not in Hospitable', async () => {
    // Rows Hospitable doesn't know about: a legacy row without an external id,
    // and a listing that was removed upstream.
    await admin.from('properties').insert([
      { owner_id: customerId, nickname: 'Fila legada sin listing' },
      { owner_id: customerId, nickname: 'Ya no existe', external_listing_id: 'hosp-gone' },
    ]);

    const r = await connectHospitable({ token: FAKE_TOKEN });
    expect(r.ok).toBe(true);

    // Strict mirror: only the Hospitable listing survives…
    const { data: rows } = await admin
      .from('properties')
      .select(
        'nickname, external_listing_id, picture_url, max_guests, beds, property_type, room_type, checkin_time, checkout_time, listed, amenities, house_rules',
      )
      .eq('owner_id', customerId);
    expect(rows).toHaveLength(1);
    const prop = rows![0]!;
    expect(prop.external_listing_id).toBe(HOSP_PROPERTY_ID);

    // …and it carries the API-defined parameters, not manual attributes.
    expect(prop.picture_url).toContain('muscache.com');
    expect(prop.max_guests).toBe(6);
    expect(prop.beds).toBe(3);
    expect(prop.property_type).toBe('apartment');
    expect(prop.room_type).toBe('Entire Home');
    expect(prop.checkin_time).toBe('15:00');
    expect(prop.checkout_time).toBe('11:00');
    expect(prop.listed).toBe(true);
    expect(prop.amenities).toContain('jacuzzi');
    expect((prop.house_rules as { pets_allowed?: boolean }).pets_allowed).toBe(true);

    // The light page-load reconcile behaves the same way.
    await admin
      .from('properties')
      .insert({ owner_id: customerId, nickname: 'Otra fila legada post-connect' });
    const { reconcileHospitableProperties } = await import('../src/lib/channels/hospitable-sync');
    const rec = await reconcileHospitableProperties(customerId, FAKE_TOKEN);
    expect(rec.ok).toBe(true);
    expect(rec.properties).toBe(1);
    expect(rec.accountLabel).toBe('Depto Providencia céntrico');
    const { count } = await admin
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', customerId);
    expect(count).toBe(1);
  });

  it('reads the listing calendar with real per-night prices and availability', async () => {
    const { listHospitableCalendar } = await import('../src/lib/channels/hospitable');
    const days = await listHospitableCalendar(
      FAKE_TOKEN,
      HOSP_PROPERTY_ID,
      '2026-07-28',
      '2026-07-29',
    );
    expect(days).toHaveLength(2);
    expect(days![0]).toMatchObject({
      date: '2026-07-28',
      status: { reason: 'RESERVED', available: false },
    });
    expect(days![1]!.status!.available).toBe(true);
    expect(days![0]!.price!.amount).toBe(16645000); // cents — callers divide by 100
  });

  it('never prunes off a partial or empty fetch, and never touches another owner', async () => {
    await connectHospitable({ token: FAKE_TOKEN }); // mirror in place: 1 row

    // A different tenant's property must be invisible to this owner's reconcile.
    const { data: other } = await admin
      .from('customers')
      .insert({
        clerk_user_id: `other-${nodeCrypto.randomUUID()}`,
        email: 'otra@test.cl',
        full_name: 'Otra Dueña',
      })
      .select('id')
      .single();
    await admin
      .from('properties')
      .insert({ owner_id: other!.id, nickname: 'Propiedad de otra cuenta' });

    try {
      const { reconcileHospitableProperties } = await import('../src/lib/channels/hospitable-sync');

      // Partial fetch (page 2 rate-limited) → complete-or-nothing → NO prune.
      PROPERTIES_MODE = 'paged_fail';
      const partial = await reconcileHospitableProperties(customerId, FAKE_TOKEN);
      expect(partial.ok).toBe(false);

      // Valid-but-empty body → upserts nothing AND prunes nothing.
      PROPERTIES_MODE = 'empty';
      const empty = await reconcileHospitableProperties(customerId, FAKE_TOKEN);
      expect(empty.ok).toBe(true);
      expect(empty.properties).toBe(0);

      const { count: mine } = await admin
        .from('properties')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', customerId);
      expect(mine).toBe(1); // mirror untouched through both failure modes

      const { count: theirs } = await admin
        .from('properties')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', other!.id);
      expect(theirs).toBe(1); // owner scoping held
    } finally {
      await admin.from('customers').delete().eq('id', other!.id); // cascades their property
      PROPERTIES_MODE = 'normal';
    }
  });

  it('ingests conversations: history silently (no auto-replies), new guest messages get the AI', async () => {
    MESSAGES = [
      {
        id: 'h1',
        body: '¿Aceptan mascotas?',
        sender_type: 'guest',
        created_at: '2026-01-01T10:00:00Z',
        sender: { first_name: 'Matheus' },
      },
      {
        id: 'h2',
        body: 'Sí, mascotas pequeñas.',
        sender_type: 'host',
        created_at: '2026-01-01T11:00:00Z',
      },
      {
        id: 'h3',
        body: 'Gracias!',
        sender_type: 'guest',
        created_at: '2026-01-01T12:00:00Z',
        sender: { first_name: 'Matheus' },
      },
    ];
    await connectHospitable({ token: FAKE_TOKEN });

    const { data: thread } = await admin
      .from('guest_threads')
      .select('id, guest_name')
      .eq('channel', 'hospitable')
      .eq('external_thread_id', 'res-1')
      .single();
    expect(thread!.guest_name).toBe('Matheus');
    const { data: hist } = await admin
      .from('guest_messages')
      .select('source, external_id')
      .eq('thread_id', thread!.id);
    expect(hist).toHaveLength(3); // full history imported for grounding
    expect(hist!.some((m) => m.source === 'ai')).toBe(false); // but nothing auto-sent
    expect(SENT).toHaveLength(0);

    // A NEW guest message arrives after the watermark → the AI replies via Hospitable.
    const future = new Date(Date.now() + 60_000).toISOString();
    MESSAGES.push({
      id: 'new-1',
      body: '¿Hay wifi en el departamento?',
      sender_type: 'guest',
      created_at: future,
      sender: { first_name: 'Matheus' },
    });
    const r2 = await syncHospitable();
    expect(r2.ok).toBe(true);

    const { data: after } = await admin
      .from('guest_messages')
      .select('source, external_id, body')
      .eq('thread_id', thread!.id)
      .order('created_at');
    expect(after!.some((m) => m.external_id === 'new-1')).toBe(true);
    expect(after!.some((m) => m.source === 'ai')).toBe(true); // AI answered
    expect(SENT.length).toBeGreaterThan(0); // …and it went out through Hospitable
    expect(SENT[0]!.reservationId).toBe('res-1');

    // Idempotent: a third sync must not duplicate or re-reply.
    const count = after!.length;
    const sends = SENT.length;
    await syncHospitable();
    const { count: again } = await admin
      .from('guest_messages')
      .select('*', { count: 'exact', head: true })
      .eq('thread_id', thread!.id);
    expect(again).toBe(count);
    expect(SENT.length).toBe(sends);
  });

  it('webhook ingests a guest message and auto-replies through Hospitable', async () => {
    await connectHospitable({ token: FAKE_TOKEN }); // creates the property + hosp:res-1 block
    const { POST } = await import('../src/app/api/channels/[provider]/route');

    const res = await POST(
      new Request('http://localhost/api/channels/hospitable', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'message.created',
          data: {
            reservation_id: 'res-1',
            message: {
              id: 'wh-1',
              body: '¿A qué hora es el check-in?',
              sender_type: 'guest',
              sender: { first_name: 'Matheus' },
            },
          },
        }),
      }),
      { params: Promise.resolve({ provider: 'hospitable' }) },
    );
    const json = (await res.json()) as { ok: boolean; action?: string };
    expect(json.ok).toBe(true);
    expect(json.action).toBe('sent');
    expect(SENT.some((s) => s.reservationId === 'res-1')).toBe(true);

    // Host (non-guest) events are acknowledged but ignored.
    const res2 = await POST(
      new Request('http://localhost/api/channels/hospitable', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'message.created',
          data: {
            reservation_id: 'res-1',
            message: { id: 'wh-2', body: 'ok', sender_type: 'host' },
          },
        }),
      }),
      { params: Promise.resolve({ provider: 'hospitable' }) },
    );
    expect(((await res2.json()) as { ignored?: boolean }).ignored).toBe(true);
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
