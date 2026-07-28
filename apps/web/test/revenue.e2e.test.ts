/**
 * End-to-end proof of the property report + the agent router (report / block /
 * pricing intents). Pricing is REAL-data-only: with no channel connection the
 * router must answer honestly that the Airbnb calendar can't be read — it never
 * invents numbers.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-rev-${nodeCrypto.randomUUID()}`;
delete process.env.HOSPITABLE_API_TOKEN; // pricing must degrade honestly, not fall to env

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let generateReport: (id: string, from: string, to: string) => Promise<string>;
let runAgentCommand: (id: string, cmd: string) => Promise<{ intent: string; text: string }>;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
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

async function seedProperty(): Promise<string> {
  const prop = await seedImportedProperty({ nickname: 'Depto Revenue' });
  return prop.id!;
}

describe.skipIf(!LIVE)('property report + agent (end to end)', () => {
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

    // No channel connection in this fixture → the pricing intent must answer
    // honestly that the Airbnb calendar can't be read — never invented numbers.
    const price = await runAgentCommand(propertyId, '¿optimizaste los precios?');
    expect(price.intent).toBe('pricing');
    expect(price.text).toContain('No pude leer el calendario');
  });
});
