import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { MarketReference } from '../src/lib/ai/pricing-reference';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-copilot-${nodeCrypto.randomUUID()}`;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let updatePropertyContext: (i: unknown) => Promise<{ ok: boolean }>;
let comparableMarketReference: (q: {
  comuna?: string | null;
  bedrooms?: number | null;
}) => Promise<MarketReference>;
let runTool: (
  name: string,
  input: Record<string, unknown>,
  ctx: Record<string, unknown>,
) => Promise<{ content: string; widget?: unknown }>;
let customerId: string;

const day = 86_400_000;
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);

async function seedComparable(
  comuna: string,
  bedrooms: number,
  revenueClp: number,
  nights: number,
) {
  const { data } = await admin
    .from('properties')
    .insert({
      owner_id: customerId,
      nickname: `Comparable ${nodeCrypto.randomUUID().slice(0, 8)}`,
      comuna,
      bedrooms,
      platform: 'airbnb',
      external_listing_id: `test:${nodeCrypto.randomUUID()}`,
    })
    .select('id')
    .single();
  const propertyId = data!.id as string;
  await admin.from('reservation_revenue').insert({
    property_id: propertyId,
    booking_key: nodeCrypto.randomUUID(),
    reservation_uid: nodeCrypto.randomUUID(),
    arrival_date: iso(-40),
    departure_date: iso(-30),
    nights,
    host_revenue_clp: revenueClp,
  });
  return propertyId;
}

beforeAll(async () => {
  if (!LIVE) return;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  const cp = await import('../src/app/[locale]/(site)/properties/copilot-actions');
  updatePropertyContext = cp.updatePropertyContext;
  comparableMarketReference = (await import('../src/lib/ai/pricing-reference'))
    .comparableMarketReference;
  runTool = (await import('../src/lib/ai/tools')).runTool;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'copilot@test.cl',
      full_name: 'Copilot Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

describe.skipIf(!LIVE)('AI messaging co-pilot (end to end)', () => {
  it('writes the structured answers and the composed lines together', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Contexto' });
    const propertyId = prop.id!;

    const save = await updatePropertyContext({
      propertyId,
      answers: {
        wifi: 'La senal llega debil a la pieza del fondo.',
        recommend: 'La panaderia de la esquina abre temprano.',
      },
    });
    expect(save.ok).toBe(true);

    const { data } = await admin
      .from('properties')
      .select('guest_info, guest_context')
      .eq('id', propertyId)
      .maybeSingle();
    expect(data!.guest_context).toEqual({
      wifi: 'La senal llega debil a la pieza del fondo.',
      recommend: 'La panaderia de la esquina abre temprano.',
    });
    const info = data!.guest_info as string;
    expect(info.split('\n')).toHaveLength(2);
    expect(info).toContain('La senal llega debil a la pieza del fondo.');
    expect(info).toContain('La panaderia de la esquina abre temprano.');
  });

  it('composes a line only for the fields the host filled', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Parcial' });
    const propertyId = prop.id!;

    const save = await updatePropertyContext({
      propertyId,
      answers: { wifi: 'El router esta detras del televisor.', devices: '   ', parking: '' },
    });
    expect(save.ok).toBe(true);

    const { data } = await admin
      .from('properties')
      .select('guest_info, guest_context')
      .eq('id', propertyId)
      .maybeSingle();
    expect(Object.keys(data!.guest_context as Record<string, string>)).toEqual(['wifi']);
    const info = data!.guest_info as string;
    expect(info.split('\n')).toHaveLength(1);
    expect(info).toContain('El router esta detras del televisor.');
  });

  it('drops keys that are not part of the form', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Extra' });
    const propertyId = prop.id!;

    const save = await updatePropertyContext({
      propertyId,
      answers: { wifi: 'Sin maña.', door_code: '4821' },
    });
    expect(save.ok).toBe(true);

    const { data } = await admin
      .from('properties')
      .select('guest_info, guest_context')
      .eq('id', propertyId)
      .maybeSingle();
    expect(data!.guest_context).toEqual({ wifi: 'Sin maña.' });
    expect(data!.guest_info as string).not.toContain('4821');
  });

  it('clears both columns when every answer is blank', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Vacio' });
    const propertyId = prop.id!;

    await updatePropertyContext({ propertyId, answers: { wifi: 'Algo que contar.' } });
    const cleared = await updatePropertyContext({
      propertyId,
      answers: { wifi: '  ', arrival: '', recommend: '' },
    });
    expect(cleared.ok).toBe(true);

    const { data } = await admin
      .from('properties')
      .select('guest_info, guest_context')
      .eq('id', propertyId)
      .maybeSingle();
    expect(data!.guest_info).toBeNull();
    expect(data!.guest_context).toBeNull();
  });

  it('rejects context for a property the caller does not own', async () => {
    const r = await updatePropertyContext({
      propertyId: nodeCrypto.randomUUID(),
      answers: { wifi: 'hola' },
    });
    expect(r.ok).toBe(false);
  });
});

describe.skipIf(!LIVE)('pricing reference (end to end)', () => {
  it('returns no figures while a single listing would answer', async () => {
    const comuna = `comunaunica${nodeCrypto.randomUUID().slice(0, 8).replace(/-/g, '')}`;
    await seedComparable(comuna, 1, 1_500_000, 30);

    const reference = await comparableMarketReference({ comuna, bedrooms: 1 });
    expect(reference).toEqual({ ok: false, reason: 'small_sample' });

    const tool = await runTool('get_pricing_reference', { comuna, bedrooms: 1 }, {});
    expect(tool.widget).toBeUndefined();
    expect(tool.content).not.toMatch(/\$\d/);
    expect(tool.content).toContain('propuesta de precios');
  });

  it('answers with realized figures once three listings back them', async () => {
    const comuna = `comunatrio${nodeCrypto.randomUUID().slice(0, 8).replace(/-/g, '')}`;
    for (let i = 0; i < 3; i++) await seedComparable(comuna, 1, 1_500_000, 30);

    const reference = await comparableMarketReference({ comuna, bedrooms: 1 });
    expect(reference.ok).toBe(true);
    if (!reference.ok) return;
    expect(reference.listings).toBe(3);
    expect(reference.nights).toBe(90);
    expect(reference.adrClp).toBe(50_000);

    const tool = await runTool('get_pricing_reference', { comuna, bedrooms: 1 }, {});
    expect(tool.content).toContain('$50.000');
    expect(tool.content).toContain('PriceLabs');
  });

  it('keeps a bedroom count far from the visitor out of the sample', async () => {
    const comuna = `comunacamas${nodeCrypto.randomUUID().slice(0, 8).replace(/-/g, '')}`;
    for (let i = 0; i < 3; i++) await seedComparable(comuna, 4, 3_000_000, 30);

    const reference = await comparableMarketReference({ comuna, bedrooms: 1 });
    expect(reference).toEqual({ ok: false, reason: 'small_sample' });
  });
});

describe.skipIf(!LIVE)('lead capture from the chat (end to end)', () => {
  const sessionIds: string[] = [];

  afterEach(async () => {
    if (!sessionIds.length) return;
    await admin.from('leads').delete().in('session_id', sessionIds);
    sessionIds.length = 0;
  });

  it('stores the property details on the lead and updates the same row', async () => {
    const sessionId = `test-lead-${nodeCrypto.randomUUID()}`;
    sessionIds.push(sessionId);

    const first = await runTool(
      'save_property_details',
      { address: 'Arturo Prat 525', comuna: 'Santiago Centro', size_m2: 32, bedrooms: 1 },
      { sessionId },
    );
    expect(first.content).toContain('propuesta de precios');

    const { data: created } = await admin
      .from('leads')
      .select('id, source, commune, metadata')
      .eq('session_id', sessionId);
    expect(created).toHaveLength(1);
    const lead = created![0] as unknown as {
      id: string;
      source: string;
      commune: string | null;
      metadata: { property?: Record<string, unknown> } | null;
    };
    expect(lead.source).toBe('contact');
    expect(lead.commune).toBe('Santiago Centro');
    expect(lead.metadata!.property).toMatchObject({
      address: 'Arturo Prat 525',
      comuna: 'Santiago Centro',
      size_m2: 32,
      bedrooms: 1,
    });

    await runTool(
      'save_property_details',
      { comuna: 'Santiago Centro', monthly_revenue_clp: 900_000, notes: 'full equipada' },
      { sessionId },
    );

    const { data: after } = await admin
      .from('leads')
      .select('id, metadata')
      .eq('session_id', sessionId);
    expect(after).toHaveLength(1);
    const updated = after![0] as unknown as {
      id: string;
      metadata: { property?: Record<string, unknown> } | null;
    };
    expect(updated.id).toBe(lead.id);
    expect(updated.metadata!.property).toMatchObject({
      address: 'Arturo Prat 525',
      monthly_revenue_clp: 900_000,
      notes: 'full equipada',
    });
  });
});
