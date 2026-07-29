/**
 * Paid add-ons: the price-optimization switch must never turn on something the
 * host has not subscribed to, subscribing snapshots the agreed price, and the
 * PriceLabs handshake starts as pending rather than pretending to be live.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ADDONS } from '../src/lib/addons/catalog';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-addon-${nodeCrypto.randomUUID()}`;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
  clerkClient: async () => ({
    users: { getUser: async () => ({ publicMetadata: { role: 'member' } }) },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let subscribeAddon: (i: unknown) => Promise<{ ok: boolean; error?: string }>;
let unsubscribeAddon: (i: unknown) => Promise<{ ok: boolean }>;
let markPricelabsConnected: (i: unknown) => Promise<{ ok: boolean }>;
let setPriceOptimization: (i: unknown) => Promise<{ ok: boolean; error?: string }>;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  const addonActions = await import('../src/app/[locale]/(site)/properties/addon-actions');
  subscribeAddon = addonActions.subscribeAddon;
  unsubscribeAddon = addonActions.unsubscribeAddon;
  markPricelabsConnected = addonActions.markPricelabsConnected;
  setPriceOptimization = (await import('../src/app/[locale]/(site)/properties/copilot-actions'))
    .setPriceOptimization;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'addon@test.cl',
      full_name: 'Addon Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

describe.skipIf(!LIVE)('paid add-ons (end to end)', () => {
  it('refuses to enable price optimization without an active subscription', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto sin add-on', sizeM2: 40 });
    const r = await setPriceOptimization({ propertyId: prop.id!, enabled: true });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('addon_required');

    const { data } = await admin
      .from('properties')
      .select('price_optimization_enabled')
      .eq('id', prop.id!)
      .single();
    expect(data!.price_optimization_enabled).toBe(false);
  });

  it('subscribing snapshots the price and starts the PriceLabs handshake as pending', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto con add-on', sizeM2: 40 });
    const r = await subscribeAddon({ propertyId: prop.id!, addon: 'dynamic_pricing' });
    expect(r.ok).toBe(true);

    const { data: addon } = await admin
      .from('property_addons')
      .select('addon, status, price_clp')
      .eq('property_id', prop.id!)
      .single();
    expect(addon!.status).toBe('active');
    expect(addon!.price_clp).toBe(ADDONS.dynamic_pricing.priceClp);

    const { data: p } = await admin
      .from('properties')
      .select('price_optimization_enabled, pricelabs_status')
      .eq('id', prop.id!)
      .single();
    expect(p!.price_optimization_enabled).toBe(true);
    // Never claims "connected": the host still has to authorise PriceLabs.
    expect(p!.pricelabs_status).toBe('pending_connection');

    // The host who performed the authorisation is the one who confirms it.
    expect((await markPricelabsConnected({ propertyId: prop.id!, connected: true })).ok).toBe(true);
    const { data: done } = await admin
      .from('properties')
      .select('pricelabs_status')
      .eq('id', prop.id!)
      .single();
    expect(done!.pricelabs_status).toBe('connected');
  });

  it('is idempotent: re-subscribing never re-prices or un-pauses', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto doble click', sizeM2: 40 });
    await subscribeAddon({ propertyId: prop.id!, addon: 'dynamic_pricing' });
    const { data: first } = await admin
      .from('property_addons')
      .select('price_clp, activated_at')
      .eq('property_id', prop.id!)
      .single();

    // Host pauses the automation, then double-submits the offer.
    await admin.from('properties').update({ price_optimization_enabled: false }).eq('id', prop.id!);
    await admin.from('property_addons').update({ price_clp: 12345 }).eq('property_id', prop.id!);
    expect((await subscribeAddon({ propertyId: prop.id!, addon: 'dynamic_pricing' })).ok).toBe(
      true,
    );

    const { data: again } = await admin
      .from('property_addons')
      .select('price_clp, activated_at')
      .eq('property_id', prop.id!)
      .single();
    // The agreed price and start date survive; the pause is respected.
    expect(again!.price_clp).toBe(12345);
    expect(again!.activated_at).toBe(first!.activated_at);
    const { data: p } = await admin
      .from('properties')
      .select('price_optimization_enabled')
      .eq('id', prop.id!)
      .single();
    expect(p!.price_optimization_enabled).toBe(false);
  });

  it('refuses to confirm a connection for a listing with no PriceLabs add-on', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto sin conexión', sizeM2: 40 });
    expect((await markPricelabsConnected({ propertyId: prop.id!, connected: true })).ok).toBe(
      false,
    );
    const { data } = await admin
      .from('properties')
      .select('pricelabs_status')
      .eq('id', prop.id!)
      .single();
    expect(data!.pricelabs_status).toBe('off');
  });

  it('cancelling the add-on turns the automation off with it', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto cancelado', sizeM2: 40 });
    await subscribeAddon({ propertyId: prop.id!, addon: 'dynamic_pricing' });
    expect((await unsubscribeAddon({ propertyId: prop.id!, addon: 'dynamic_pricing' })).ok).toBe(
      true,
    );

    const { data: addon } = await admin
      .from('property_addons')
      .select('status')
      .eq('property_id', prop.id!)
      .single();
    expect(addon!.status).toBe('cancelled');

    const { data: p } = await admin
      .from('properties')
      .select('price_optimization_enabled, pricelabs_status')
      .eq('id', prop.id!)
      .single();
    expect(p!.price_optimization_enabled).toBe(false);
    expect(p!.pricelabs_status).toBe('off');

    // …and the switch can no longer turn it back on.
    const r = await setPriceOptimization({ propertyId: prop.id!, enabled: true });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('addon_required');
  });
});
