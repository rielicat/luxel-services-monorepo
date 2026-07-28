/**
 * End-to-end proof of Phase-3 revenue optimization + the agent: deterministic
 * price suggestions (weekend premium, last-minute discount, occupancy), a range
 * report, and the "ask the agent" router (report / block / pricing intents).
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-rev-${nodeCrypto.randomUUID()}`;
const TODAY = new Date('2027-01-04T12:00:00Z'); // Monday; 2027-01-08 is a Friday

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let suggestPricing: (
  id: string,
  today?: Date,
) => Promise<{
  base_clp: number;
  occupancy_pct: number;
  underbooked: number;
  suggestions: { date: string; price_clp: number; reason: string }[];
}>;
let generateReport: (id: string, from: string, to: string) => Promise<string>;
let runAgentCommand: (id: string, cmd: string) => Promise<{ intent: string; text: string }>;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  suggestPricing = (await import('../src/lib/revenue/suggest')).suggestPricing;
  generateReport = (await import('../src/lib/revenue/report')).generateReport;
  runAgentCommand = (await import('../src/lib/agent/router')).runAgentCommand;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'rev@test.cl',
      full_name: 'Rev Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

async function seedProperty(base = 50000): Promise<string> {
  const prop = await seedImportedProperty({ nickname: 'Depto Revenue' });
  await admin.from('properties').update({ base_nightly_clp: base }).eq('id', prop.id!);
  return prop.id!;
}

describe.skipIf(!LIVE)('revenue optimization + agent (end to end)', () => {
  it('suggests weekend-premium / last-minute prices and computes occupancy', async () => {
    const propertyId = await seedProperty(50000);
    // 2 booked nights (10th, 11th) inside the 30-day horizon.
    await admin.from('calendar_blocks').insert({
      property_id: propertyId,
      starts_on: '2027-01-10',
      ends_on: '2027-01-12',
      source: 'import',
      external_uid: 'r-1',
    });

    const ins = await suggestPricing(propertyId, TODAY);
    expect(ins.base_clp).toBe(50000);
    expect(ins.occupancy_pct).toBe(7); // 2 of 30 nights
    const fri = ins.suggestions.find((s) => s.date === '2027-01-08');
    expect(fri).toMatchObject({ reason: 'weekend+last_minute', price_clp: 51750 }); // 50000*1.15*0.9
    expect(ins.suggestions.some((s) => s.date === '2027-01-10')).toBe(false); // booked, not suggested
  });

  it('generates a range report of nights, check-ins and cleanings', async () => {
    const propertyId = await seedProperty();
    await admin.from('checkins').insert({
      property_id: propertyId,
      token: `rev-${nodeCrypto.randomBytes(4).toString('hex')}`,
      status: 'submitted',
      arrival_at: '2027-01-15T18:00:00Z',
    });
    await admin.from('cleanings').insert({
      property_id: propertyId,
      cleaning_date: '2027-01-16',
      status: 'scheduled',
      source: 'manual',
      price_clp: 60000,
    });
    await admin.from('calendar_blocks').insert({
      property_id: propertyId,
      starts_on: '2027-01-14',
      ends_on: '2027-01-17',
      source: 'import',
      external_uid: 'r-2',
    });

    const text = await generateReport(propertyId, '2027-01-01', '2027-01-31');
    expect(text).toContain('Noches reservadas: 3');
    expect(text).toContain('Check-ins: 1');
    expect(text).toContain('Aseos: 1');
  });

  it('routes agent commands: report, block a date, and pricing', async () => {
    const propertyId = await seedProperty();

    const rep = await runAgentCommand(propertyId, 'reporte de 2027-01-01 a 2027-01-31');
    expect(rep.intent).toBe('report');
    expect(rep.text).toContain('Reporte de');

    const blk = await runAgentCommand(propertyId, 'bloquea 2027-03-15 porque lo usaré');
    expect(blk.intent).toBe('block');
    const { data: block } = await admin
      .from('calendar_blocks')
      .select('starts_on, source')
      .eq('property_id', propertyId)
      .eq('starts_on', '2027-03-15')
      .maybeSingle();
    expect(block!.source).toBe('manual');

    const price = await runAgentCommand(propertyId, '¿optimizaste los precios?');
    expect(price.intent).toBe('pricing');
    expect(price.text).toContain('Ocupación');
  });
});
