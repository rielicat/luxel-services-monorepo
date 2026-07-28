/**
 * End-to-end proof of the property calendar slice: parses a real AirBnB-style iCal
 * feed into busy blocks, adds a host "I'm using it" manual block, and re-exports a
 * combined iCal feed through the public route. Uses local Supabase; skips without it.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { parseICal, buildICal } from '../src/lib/calendar/ical';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-cal-${nodeCrypto.randomUUID()}`;
const FEED_URL = 'http://ical.test/feed.ics';
const SAMPLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Airbnb//Hosting//EN',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20260810',
  'DTEND;VALUE=DATE:20260813',
  'UID:evt-1@airbnb.com',
  'SUMMARY:Reserved',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20260820',
  'DTEND;VALUE=DATE:20260822',
  'UID:evt-2@airbnb.com',
  'SUMMARY:Airbnb (Not available)',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let addCalendarFeed: (i: unknown) => Promise<{ ok: boolean }>;
let addManualBlock: (i: unknown) => Promise<{ ok: boolean; error?: string }>;
let exportUrl: (id: string) => Promise<{ ok: boolean; url?: string }>;
let feedGET: (req: Request, ctx: { params: Promise<{ token: string }> }) => Promise<Response>;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === FEED_URL)
      return new Response(SAMPLE_ICS, {
        status: 200,
        headers: { 'content-type': 'text/calendar' },
      });
    return realFetch(input, init);
  });

  const cal = await import('../src/app/[locale]/(site)/properties/calendar-actions');
  addCalendarFeed = cal.addCalendarFeed;
  addManualBlock = cal.addManualBlock;
  exportUrl = cal.exportUrl;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  feedGET = (await import('../src/app/api/calendar/[token]/route')).GET;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'cal@test.cl',
      full_name: 'Cal Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

describe('iCal read/write (unit)', () => {
  it('parses all-day VEVENTs and round-trips through buildICal', () => {
    const events = parseICal(SAMPLE_ICS);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      uid: 'evt-1@airbnb.com',
      start: '2026-08-10',
      end: '2026-08-13',
      summary: 'Reserved',
    });
    const ics = buildICal(
      'Depto',
      [{ id: 'b1', starts_on: '2026-09-01', ends_on: '2026-09-03', summary: 'Bloqueado' }],
      '20260101T000000Z',
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20260901');
    expect(ics).toContain('DTEND;VALUE=DATE:20260903');
    expect(parseICal(ics)).toHaveLength(1);
  });
});

describe.skipIf(!LIVE)('property calendar (end to end)', () => {
  it('imports a feed, adds a manual block, and exports a combined iCal', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Bellas Artes' });
    const propertyId = prop.id!;

    const feed = await addCalendarFeed({ propertyId, label: 'airbnb', url: FEED_URL });
    expect(feed.ok).toBe(true);

    const { data: imported } = await admin
      .from('calendar_blocks')
      .select('starts_on, source')
      .eq('property_id', propertyId)
      .eq('source', 'import');
    expect(imported).toHaveLength(2);

    const block = await addManualBlock({
      propertyId,
      startsOn: '2026-09-05',
      endsOn: '2026-09-08',
      summary: 'Uso personal',
    });
    expect(block.ok).toBe(true);

    const exp = await exportUrl(propertyId);
    expect(exp.ok).toBe(true);
    const token = exp.url!.split('/').pop()!;

    const res = await feedGET(new Request(`http://localhost/api/calendar/${token}`), {
      params: Promise.resolve({ token }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    const body = await res.text();
    const events = parseICal(body);
    expect(events).toHaveLength(3); // 2 imported + 1 manual
    expect(body).toContain('20260905'); // the manual block is in the feed
  });

  it('rejects a manual block with an inverted date range', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Lastarria' });
    const r = await addManualBlock({
      propertyId: prop.id,
      startsOn: '2026-09-10',
      endsOn: '2026-09-08',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('range');
  });
});
