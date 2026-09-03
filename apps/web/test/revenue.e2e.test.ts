import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-host-${nodeCrypto.randomUUID()}`;
delete process.env.HOSPITABLE_API_TOKEN;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let runTool: (
  name: string,
  input: Record<string, unknown>,
  ctx: { customerId?: string | null },
) => Promise<{ content: string }>;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  runTool = (await import('../src/lib/ai/tools')).runTool;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'host-status@test.cl',
      full_name: 'Host Status',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

describe.skipIf(!LIVE)('global agent host status (end to end)', () => {
  it('reports the real account state per property', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Estado Real' });
    await admin.from('calendar_blocks').insert({
      property_id: prop.id!,
      starts_on: '2027-02-01',
      ends_on: '2027-02-04',
      source: 'import',
      external_uid: 'feed:evt-status',
      summary: 'Reserved',
    });

    const r = await runTool('get_host_status', {}, { customerId });
    expect(r.content).toContain('1 conectadas');
    expect(r.content).toContain('Depto Estado Real');
    expect(r.content).toContain('ocupación no disponible');
    expect(r.content).toContain('1 estadía próxima');
    expect(r.content).toContain('ingresos 30 días no disponibles');
    expect(r.content).not.toContain('próximo aseo');
    expect(r.content).not.toContain('conversaciones');
  });

  it('guides signed-out users and empty accounts instead of failing', async () => {
    const signedOut = await runTool('get_host_status', {}, { customerId: null });
    expect(signedOut.content).toContain('no ha iniciado sesión');

    const empty = await runTool('get_host_status', {}, { customerId });
    expect(empty.content).toContain('no tiene propiedades conectadas');
  });
});

describe.skipIf(!LIVE)('realized revenue rollup (end to end)', () => {
  const seedStay = async (
    propertyId: string,
    key: string,
    arrival: string,
    departure: string,
    nights: number,
    hostRevenueClp: number | null,
    cleaningFeeClp: number | null = 0,
  ) =>
    admin.from('reservation_revenue').insert({
      property_id: propertyId,
      booking_key: key,
      reservation_uid: `hosp:${key}`,
      confirmation_code: key,
      arrival_date: arrival,
      departure_date: departure,
      nights,
      currency: hostRevenueClp === null ? 'USD' : 'CLP',
      host_revenue_clp: hostRevenueClp,
      cleaning_fee_clp: cleaningFeeClp,
      guest_total_clp: hostRevenueClp === null ? null : hostRevenueClp + 40000,
    });

  it('sums only the stays whose checkout falls inside the Santiago month', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Ingresos' });
    const id = prop.id!;
    await seedStay(id, 'MARCH-EDGE-IN', '2027-02-26', '2027-03-01', 3, 210000);
    await seedStay(id, 'MARCH-MID', '2027-03-10', '2027-03-14', 4, 640000);
    await seedStay(id, 'MARCH-EDGE-OUT', '2027-03-29', '2027-04-01', 3, 300000);
    await seedStay(id, 'FEB-EDGE', '2027-02-24', '2027-02-28', 4, 400000);

    const { realizedRevenueForProperty, realizedRevenueForCustomer, santiagoMonth, monthBounds } =
      await import('../src/lib/revenue');
    const after = new Date('2027-05-02T03:00:00Z');

    expect(monthBounds('2027-02')).toEqual({ from: '2027-02-01', to: '2027-03-01' });
    expect(monthBounds('2027-13')).toBeNull();
    expect(santiagoMonth(new Date('2027-03-01T02:00:00Z'))).toBe('2027-02');

    const march = await realizedRevenueForProperty(id, '2027-03', after);
    expect(march).toMatchObject({
      propertyId: id,
      month: '2027-03',
      stays: 2,
      nights: 7,
      hostRevenueClp: 850000,
      unpricedStays: 0,
      propertiesCounted: 1,
      propertiesNeverSynced: 0,
    });
    expect(Date.parse(march.syncedAt!)).toBeGreaterThan(0);

    const february = await realizedRevenueForProperty(id, '2027-02', after);
    expect(february.stays).toBe(1);
    expect(february.hostRevenueClp).toBe(400000);

    const april = await realizedRevenueForProperty(id, '2027-04', after);
    expect(april.stays).toBe(1);
    expect(april.hostRevenueClp).toBe(300000);

    const portfolio = await realizedRevenueForCustomer(customerId, '2027-03', after);
    expect(portfolio.hostRevenueClp).toBe(850000);
    expect(portfolio.propertiesCounted).toBe(1);
    expect(portfolio.propertiesNeverSynced).toBe(0);
    expect(portfolio.syncedAt).toBe(march.syncedAt);
    expect(portfolio.properties).toHaveLength(1);
    expect(portfolio.properties[0]).toMatchObject({ propertyId: id, hostRevenueClp: 850000 });
  });

  it('leaves the cleaning fee out of the commission base', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Aseo' });
    const id = prop.id!;
    await seedStay(id, 'CLEAN-A', '2027-06-02', '2027-06-05', 3, 300000, 45000);
    await seedStay(id, 'CLEAN-B', '2027-06-10', '2027-06-12', 2, 200000, 0);
    await seedStay(id, 'CLEAN-UNKNOWN', '2027-06-20', '2027-06-22', 2, 100000, null);

    const { realizedRevenueForProperty } = await import('../src/lib/revenue');
    const { planMonthlyCost } = await import('@luxel/shared/plan-pricing');
    const june = await realizedRevenueForProperty(id, '2027-06', new Date('2027-07-02T03:00:00Z'));

    expect(june).toMatchObject({
      stays: 3,
      hostRevenueClp: 600000,
      cleaningFeeClp: 45000,
      commissionBaseClp: 555000,
      unknownCleaningStays: 1,
    });
    expect(planMonthlyCost(june.commissionBaseClp)).toBe(66600);
    expect(planMonthlyCost(june.hostRevenueClp)).toBe(72000);
  });

  it('counts a stay it cannot price in CLP without inventing a number', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Sin Precio' });
    const id = prop.id!;
    await seedStay(id, 'NO-CLP', '2027-06-10', '2027-06-13', 3, null);
    await seedStay(id, 'WITH-CLP', '2027-06-20', '2027-06-22', 2, 180000);

    const { realizedRevenueForProperty } = await import('../src/lib/revenue');
    const june = await realizedRevenueForProperty(id, '2027-06', new Date('2027-07-05T12:00:00Z'));
    expect(june).toMatchObject({
      stays: 2,
      nights: 5,
      hostRevenueClp: 180000,
      unpricedStays: 1,
    });
  });

  it('refuses to look settled for a month the mirror never populated', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Sin Sincronizar' });
    const id = prop.id!;
    const asOf = new Date('2027-11-05T12:00:00Z');

    const { realizedRevenueForProperty, realizedRevenueForCustomer } =
      await import('../src/lib/revenue');
    const october = await realizedRevenueForProperty(id, '2027-10', asOf);
    expect(october).toMatchObject({
      stays: 0,
      hostRevenueClp: 0,
      syncedAt: null,
      propertiesCounted: 1,
      propertiesNeverSynced: 1,
    });

    const portfolio = await realizedRevenueForCustomer(customerId, '2027-10', asOf);
    expect(portfolio.propertiesNeverSynced).toBe(1);
    expect(portfolio.syncedAt).toBeNull();

    await seedStay(id, 'OCT-STAY', '2027-10-10', '2027-10-13', 3, 240000);
    const settled = await realizedRevenueForProperty(id, '2027-10', asOf);
    expect(settled.hostRevenueClp).toBe(240000);
    expect(settled.propertiesNeverSynced).toBe(0);
    expect(settled.syncedAt).toBeTruthy();
  });

  it('never bills a month that has not happened yet', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Futuro' });
    const id = prop.id!;
    await seedStay(id, 'FUTURE', '2027-08-10', '2027-08-14', 4, 500000);

    const { realizedRevenueForProperty } = await import('../src/lib/revenue');
    const asOf = new Date('2027-08-12T12:00:00Z');
    const running = await realizedRevenueForProperty(id, '2027-08', asOf);
    expect(running.stays).toBe(0);
    expect(running.hostRevenueClp).toBe(0);

    const settled = await realizedRevenueForProperty(
      id,
      '2027-08',
      new Date('2027-09-01T12:00:00Z'),
    );
    expect(settled.stays).toBe(1);
    expect(settled.hostRevenueClp).toBe(500000);
  });
});
