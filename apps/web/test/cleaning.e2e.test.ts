import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-clean-${nodeCrypto.randomUUID()}`;
const CHECKOUT = '2027-02-10';

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let refreshCleanings: (id: string) => Promise<{ ok: boolean; suggested?: number }>;
let getTurnoverPrice: (id: string) => Promise<{ ok: boolean; priceClp?: number; error?: string }>;
let setCleaningStatus: (i: unknown) => Promise<{ ok: boolean }>;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
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
