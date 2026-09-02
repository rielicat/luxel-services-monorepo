import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-clean-${nodeCrypto.randomUUID()}`;
process.env.WHATSAPP_WORKER_SEND_URL = 'http://worker.test/send';
process.env.INTERNAL_SEND_TOKEN = 'test-internal-token';
const CHECKOUT = '2027-02-10';

const EMAILS = vi.hoisted(() => [] as Array<{ to: string | string[]; subject: string }>);
const WA_SENDS: Array<{
  to?: string;
  template?: { kind: string; params: string[]; buttons?: string[] };
}> = [];

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/email/send', () => ({
  emailConfigured: () => true,
  sendEmail: async (opts: { to: string | string[]; subject: string }) => {
    EMAILS.push(opts);
    return { id: `em_${EMAILS.length}` };
  },
}));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let refreshCleanings: (id: string) => Promise<{ ok: boolean; suggested?: number }>;
let getTurnoverPrice: (id: string) => Promise<{ ok: boolean; priceClp?: number; error?: string }>;
let setCleaningStatus: (i: unknown) => Promise<{ ok: boolean }>;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === process.env.WHATSAPP_WORKER_SEND_URL) {
      WA_SENDS.push(JSON.parse((init?.body as string) ?? '{}'));
      return Response.json({ wamid: 'wamid.test' });
    }
    return realFetch(input, init);
  });
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  const clean = await import('../src/app/[locale]/(site)/properties/cleaning-actions');
  const schedule = await import('../src/lib/cleaning/schedule');
  refreshCleanings = async (id: string) => {
    const r = await schedule.suggestCleaningsFromCheckouts(id);
    return { ok: true, suggested: r.suggested };
  };
  getTurnoverPrice = clean.getTurnoverPrice;
  setCleaningStatus = clean.setCleaningStatus;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'clean@test.cl',
      full_name: 'Clean Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
  WA_SENDS.length = 0;
  EMAILS.length = 0;
});

describe.skipIf(!LIVE)('cleaning coordination (end to end)', () => {
  it('suggests a cleaning from a check-out, schedules it, and stays idempotent', async () => {
    const prop = await seedImportedProperty({
      nickname: 'Depto Providencia',
      address: 'Av. Providencia 1234, Santiago',
      sizeM2: 55,
      lat: -33.4372,
      lng: -70.6178,
    });
    const propertyId = prop.id!;

    await admin.from('calendar_blocks').insert({
      property_id: propertyId,
      starts_on: '2027-02-07',
      ends_on: CHECKOUT,
      source: 'import',
      external_uid: 'feed:evt-x',
      summary: 'Reserved',
    });

    const r1 = await refreshCleanings(propertyId);
    expect(r1.ok).toBe(true);
    expect(r1.suggested).toBe(1);

    const { data: c1 } = await admin
      .from('cleanings')
      .select('id, cleaning_date, status, source')
      .eq('property_id', propertyId);
    expect(c1).toHaveLength(1);
    expect(c1![0].cleaning_date).toBe(CHECKOUT);
    expect(c1![0].status).toBe('suggested');

    const st = await setCleaningStatus({ cleaningId: c1![0].id, status: 'scheduled' });
    expect(st.ok).toBe(true);

    const r2 = await refreshCleanings(propertyId);
    expect(r2.suggested).toBe(0);
    const { data: c2 } = await admin
      .from('cleanings')
      .select('status')
      .eq('property_id', propertyId);
    expect(c2).toHaveLength(1);
    expect(c2![0].status).toBe('scheduled');
  });

  it('lets the crew confirm attendance via the tokenized link — once', async () => {
    const prop = await seedImportedProperty({
      nickname: 'Depto Ñuñoa',
      sizeM2: 50,
      lat: -33.4569,
      lng: -70.5986,
    });
    const { data: cleaning } = await admin
      .from('cleanings')
      .insert({ property_id: prop.id!, cleaning_date: CHECKOUT, status: 'scheduled' })
      .select('id, confirm_token')
      .single();
    const token = cleaning!.confirm_token as string;

    const { confirmCleaningAttendance } =
      await import('../src/app/[locale]/cleaning/confirm/[token]/actions');

    expect((await confirmCleaningAttendance(nodeCrypto.randomUUID())).ok).toBe(false);
    expect((await confirmCleaningAttendance('not-a-uuid')).ok).toBe(false);
    expect((await confirmCleaningAttendance(token)).ok).toBe(true);
    expect((await confirmCleaningAttendance(token)).ok).toBe(false);

    const { data: after } = await admin
      .from('cleanings')
      .select('crew_confirmed_at')
      .eq('id', cleaning!.id as string)
      .single();
    expect(after!.crew_confirmed_at).toBeTruthy();
  });

  it('asks the own crew to confirm: WhatsApp buttons for a phone, email for an address only', async () => {
    const prop = await seedImportedProperty({
      nickname: 'Depto Las Condes',
      sizeM2: 60,
      lat: -33.4172,
      lng: -70.6036,
    });
    const propertyId = prop.id!;
    await admin
      .from('properties')
      .update({ cleaning_managed_by: 'own', checkout_time: '11:00' })
      .eq('id', propertyId);
    await admin.from('property_access').update({ unit: '1203' }).eq('property_id', propertyId);
    await admin.from('property_contacts').insert([
      {
        property_id: propertyId,
        role: 'cleaning',
        external_id: 'tm-phone',
        name: 'Rosa',
        whatsapp: '+56 9 5555 1234',
        email: 'rosa@aseo.cl',
      },
      {
        property_id: propertyId,
        role: 'cleaning',
        external_id: 'tm-email',
        name: 'Pedro',
        whatsapp: null,
        email: 'pedro@aseo.cl',
      },
    ]);
    const { data: cleaning } = await admin
      .from('cleanings')
      .insert({ property_id: propertyId, cleaning_date: '2027-02-09', status: 'suggested' })
      .select('id, confirm_token')
      .single();
    const token = cleaning!.confirm_token as string;

    expect((await setCleaningStatus({ cleaningId: cleaning!.id, status: 'scheduled' })).ok).toBe(
      true,
    );

    expect(WA_SENDS).toHaveLength(1);
    expect(WA_SENDS[0]).toEqual({
      to: '56955551234',
      template: {
        kind: 'cleaning_confirm',
        params: ['martes 09 de febrero, 11:00', 'Depto Las Condes · Depto. 1203'],
        buttons: [`clean:${token}:yes`, `clean:${token}:no`],
      },
    });
    expect(EMAILS).toHaveLength(1);
    expect(EMAILS[0]!.to).toBe('pedro@aseo.cl');
    expect(EMAILS[0]!.subject).toContain('Depto Las Condes');
  });

  it('prices a turnover for a located property without throwing', async () => {
    const prop = await seedImportedProperty({
      nickname: 'Depto Centro',
      sizeM2: 45,
      lat: -33.4489,
      lng: -70.6693,
    });
    const p = await getTurnoverPrice(prop.id!);
    expect(p.ok).toBe(true);
    expect(typeof p.priceClp === 'number' || typeof p.error === 'string').toBe(true);
  });
});
