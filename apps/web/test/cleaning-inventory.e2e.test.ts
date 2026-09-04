import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { InventoryItem } from '@luxel/shared/cleaning-inventory';
import type * as ActionsModule from '../src/app/[locale]/cleaning/confirm/[token]/actions';
import type * as InventoryModule from '@luxel/core/cleaning/inventory';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-inventory-${nodeCrypto.randomUUID()}`;
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.LUXEL_WORKER_URL;
delete process.env.WHATSAPP_WORKER_SEND_URL;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

const plusDays = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
    new Date(Date.now() + n * 86_400_000),
  );

const DRAFT_ITEMS: InventoryItem[] = [
  { room: 'Dormitorio', name: 'Almohadas', expected: 4, observed: 4, condition: 'ok', note: null },
  { room: 'Cocina', name: 'Copas', expected: 6, observed: 5, condition: 'missing', note: null },
];

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let actions: typeof ActionsModule;
let inventory: typeof InventoryModule;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  actions = await import('../src/app/[locale]/cleaning/confirm/[token]/actions');
  inventory = await import('@luxel/core/cleaning/inventory');
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'inventory@test.cl',
      full_name: 'Inventory Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

async function seedCleaning(nickname: string, offset = 3) {
  const property = await seedImportedProperty({ nickname });
  const { data } = await admin
    .from('cleanings')
    .insert({
      property_id: property.id!,
      cleaning_date: plusDays(offset),
      status: 'scheduled',
      crew_confirmed_at: new Date().toISOString(),
    })
    .select('id, confirm_token')
    .single();
  return {
    propertyId: property.id!,
    cleaningId: data!.id as string,
    token: data!.confirm_token as string,
  };
}

async function seedReadyDraft(propertyId: string, cleaningId: string, items = DRAFT_ITEMS) {
  await admin.from('cleaning_inventory_draft').insert({
    cleaning_id: cleaningId,
    property_id: propertyId,
    status: 'ready',
    items,
    differences: [{ room: 'Cocina', name: 'Copas', kind: 'missing', detail: 'Falta una copa' }],
    model: 'test-model',
  });
}

describe.skipIf(!LIVE)('cleaning walkthrough inventory (end to end)', () => {
  it('never treats the AI draft as the confirmed record', async () => {
    const { propertyId, cleaningId, token } = await seedCleaning('Depto Providencia');
    await seedReadyDraft(propertyId, cleaningId);

    const state = await inventory.readCrewState(token);
    expect(state?.draft?.status).toBe('ready');
    expect(state?.draft?.items).toHaveLength(2);
    expect(state?.confirmed).toBeNull();

    const { data: stored } = await admin
      .from('cleaning_inventory')
      .select('id')
      .eq('cleaning_id', cleaningId);
    expect(stored ?? []).toHaveLength(0);

    const { data: cleaning } = await admin
      .from('cleanings')
      .select('status')
      .eq('id', cleaningId)
      .single();
    expect(cleaning!.status).toBe('scheduled');

    const previous = await inventory.previousConfirmedInventory(
      propertyId,
      nodeCrypto.randomUUID(),
    );
    expect(previous).toHaveLength(0);
  });

  it('stores an untouched confirmation as the AI list and any correction as the crew list', async () => {
    const asIs = await seedCleaning('Depto Las Condes', 3);
    await seedReadyDraft(asIs.propertyId, asIs.cleaningId);
    const kept = await actions.confirmCleaningInventory(asIs.token, DRAFT_ITEMS, '', 'Ana');
    expect(kept).toEqual({ ok: true, source: 'ai' });

    const corrected = await seedCleaning('Depto Ñuñoa', 4);
    await seedReadyDraft(corrected.propertyId, corrected.cleaningId);
    const edited = [DRAFT_ITEMS[0]!, { ...DRAFT_ITEMS[1]!, observed: 6, condition: 'ok' as const }];
    const changed = await actions.confirmCleaningInventory(corrected.token, edited, '', 'Ana');
    expect(changed).toEqual({ ok: true, source: 'crew' });

    const { data: rows } = await admin
      .from('cleaning_inventory')
      .select('cleaning_id, source, items, confirmed_by_name')
      .in('cleaning_id', [asIs.cleaningId, corrected.cleaningId]);
    const bySource = new Map(
      (rows ?? []).map((row) => [row.cleaning_id as string, row as Record<string, unknown>]),
    );
    expect(bySource.get(asIs.cleaningId)!.source).toBe('ai');
    expect(bySource.get(corrected.cleaningId)!.source).toBe('crew');
    expect((bySource.get(corrected.cleaningId)!.items as InventoryItem[])[1]!.observed).toBe(6);
    expect(bySource.get(corrected.cleaningId)!.confirmed_by_name).toBe('Ana');

    const { data: cleanings } = await admin
      .from('cleanings')
      .select('id, status')
      .in('id', [asIs.cleaningId, corrected.cleaningId]);
    expect((cleanings ?? []).every((row) => row.status === 'done')).toBe(true);

    const state = await inventory.readCrewState(corrected.token);
    expect(state?.confirmed?.source).toBe('crew');
    expect(state?.draft?.status).toBe('ready');
  });

  it('records a hand-written inventory as the crew list when there is no draft', async () => {
    const { token, cleaningId } = await seedCleaning('Depto sin Lux', 5);
    const typed: InventoryItem[] = [
      { room: 'Living', name: 'Cojines', expected: null, observed: 3, condition: 'ok', note: null },
    ];
    expect(await actions.confirmCleaningInventory(token, typed, 'sin novedad', 'Rosa')).toEqual({
      ok: true,
      source: 'crew',
    });
    expect(await actions.confirmCleaningInventory(token, [], '', '')).toEqual({
      ok: false,
      error: 'empty',
    });

    const { data } = await admin
      .from('cleaning_inventory')
      .select('source, note')
      .eq('cleaning_id', cleaningId)
      .single();
    expect(data!.source).toBe('crew');
    expect(data!.note).toBe('sin novedad');
  });

  it('keeps one cleaning token away from another property cleaning', async () => {
    const mine = await seedCleaning('Depto propio', 3);
    const other = await seedCleaning('Depto ajeno', 4);
    await seedReadyDraft(other.propertyId, other.cleaningId);

    expect(await inventory.readCrewState(nodeCrypto.randomUUID())).toBeNull();
    expect(await inventory.readCrewState('not-a-uuid')).toBeNull();
    expect((await inventory.readCrewState(mine.token))!.cleaning.id).toBe(mine.cleaningId);

    const foreignKey = `walkthrough/${other.cleaningId}/${nodeCrypto.randomBytes(16).toString('hex')}.mp4`;
    expect(inventory.walkthroughKeyBelongsTo(foreignKey, mine.cleaningId)).toBe(false);
    expect(inventory.walkthroughKeyBelongsTo(foreignKey, other.cleaningId)).toBe(true);
    expect(
      inventory.walkthroughKeyBelongsTo(
        `walkthrough/${mine.cleaningId}/../${other.cleaningId}/x.mp4`,
        mine.cleaningId,
      ),
    ).toBe(false);

    expect(await actions.finishWalkthroughUpload(mine.token, foreignKey, 1024, 30, 'Ana')).toEqual({
      ok: false,
    });
    const { data: leaked } = await admin
      .from('cleaning_walkthrough')
      .select('id')
      .eq('cleaning_id', other.cleaningId);
    expect(leaked ?? []).toHaveLength(0);

    await actions.saveCleaningChecklist(mine.token, ['trash', 'kitchen']);
    const { data: checklists } = await admin
      .from('cleaning_checklist')
      .select('cleaning_id, done_steps');
    const touched = (checklists ?? []).filter((row) =>
      [mine.cleaningId, other.cleaningId].includes(row.cleaning_id as string),
    );
    expect(touched).toHaveLength(1);
    expect(touched[0]!.cleaning_id).toBe(mine.cleaningId);

    await actions.confirmCleaningInventory(mine.token, DRAFT_ITEMS, '', 'Ana');
    const { data: confirmed } = await admin
      .from('cleaning_inventory')
      .select('cleaning_id')
      .in('cleaning_id', [mine.cleaningId, other.cleaningId]);
    expect(confirmed).toHaveLength(1);
    expect(confirmed![0]!.cleaning_id).toBe(mine.cleaningId);

    const otherState = await inventory.readCrewState(other.token);
    expect(otherState?.confirmed).toBeNull();
    expect(otherState?.cleaning.status).toBe('scheduled');
  });

  it('refuses crew work on a cleaning that was cancelled or never confirmed', async () => {
    const property = await seedImportedProperty({ nickname: 'Depto cancelado' });
    const { data: rows } = await admin
      .from('cleanings')
      .insert([
        { property_id: property.id!, cleaning_date: plusDays(6), status: 'skipped' },
        { property_id: property.id!, cleaning_date: plusDays(7), status: 'scheduled' },
      ])
      .select('id, status, confirm_token');
    const skipped = (rows ?? []).find((row) => row.status === 'skipped')!;
    const unanswered = (rows ?? []).find((row) => row.status === 'scheduled')!;

    for (const token of [skipped.confirm_token as string, unanswered.confirm_token as string]) {
      expect(await actions.confirmCleaningInventory(token, DRAFT_ITEMS, '', 'Ana')).toEqual({
        ok: false,
        error: 'unknown',
      });
      expect(await actions.saveCleaningChecklist(token, ['trash'])).toEqual({ ok: false });
      expect(await actions.startWalkthroughUpload(token, 'video/mp4', 1024)).toEqual({
        ok: false,
        error: 'unknown',
      });
    }

    const { data: written } = await admin
      .from('cleaning_inventory')
      .select('id')
      .in('cleaning_id', [skipped.id as string, unanswered.id as string]);
    expect(written ?? []).toHaveLength(0);
  });

  it('closes the crew flow days after the cleaning and freezes it once confirmed', async () => {
    const stale = await seedCleaning('Depto vencido', -7);
    expect(await actions.loadCrewState(stale.token)).toBeNull();
    expect(await actions.saveCleaningChecklist(stale.token, ['trash'])).toEqual({ ok: false });
    expect(await actions.startWalkthroughUpload(stale.token, 'video/mp4', 1024)).toEqual({
      ok: false,
      error: 'unknown',
    });
    expect(await actions.confirmCleaningInventory(stale.token, DRAFT_ITEMS, '', 'Ana')).toEqual({
      ok: false,
      error: 'unknown',
    });

    const settled = await seedCleaning('Depto cerrado', 2);
    expect(await actions.confirmCleaningInventory(settled.token, DRAFT_ITEMS, '', 'Ana')).toEqual({
      ok: true,
      source: 'crew',
    });
    expect(
      await actions.confirmCleaningInventory(settled.token, [DRAFT_ITEMS[0]!], '', 'Otro'),
    ).toEqual({ ok: true });
    expect(await actions.saveCleaningChecklist(settled.token, ['trash'])).toEqual({ ok: false });
    expect(await actions.startWalkthroughUpload(settled.token, 'video/mp4', 1024)).toEqual({
      ok: false,
      error: 'unknown',
    });

    const { data } = await admin
      .from('cleaning_inventory')
      .select('items, confirmed_by_name')
      .eq('cleaning_id', settled.cleaningId)
      .single();
    expect(data!.items as InventoryItem[]).toHaveLength(2);
    expect(data!.confirmed_by_name).toBe('Ana');
    expect((await actions.loadCrewState(settled.token))?.confirmed?.items).toHaveLength(2);
  });

  it('carries the last confirmed inventory forward as the baseline for the next cleaning', async () => {
    const first = await seedCleaning('Depto con historia', 2);
    await actions.confirmCleaningInventory(first.token, DRAFT_ITEMS, '', 'Ana');

    const { data: next } = await admin
      .from('cleanings')
      .insert({
        property_id: first.propertyId,
        cleaning_date: plusDays(9),
        status: 'scheduled',
        crew_confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    const baseline = await inventory.previousConfirmedInventory(
      first.propertyId,
      next!.id as string,
    );
    expect(baseline).toHaveLength(2);
    expect(baseline[1]!.name).toBe('Copas');
    expect(await inventory.previousConfirmedInventory(first.propertyId, first.cleaningId)).toEqual(
      [],
    );
  });

  it('says the automatic list is unavailable when no model key is configured', async () => {
    const { token, cleaningId, propertyId } = await seedCleaning('Depto sin llave', 8);
    const { geminiConfigured } = await import('@luxel/core/ai/gemini');
    const { cleaningMediaConfigured } = await import('@luxel/core/cleaning/media');
    expect(geminiConfigured()).toBe(false);
    expect(cleaningMediaConfigured()).toBe(false);

    expect(await actions.startWalkthroughUpload(token, 'video/mp4', 1024)).toEqual({
      ok: false,
      error: 'unavailable',
    });

    const cleaning = (await inventory.readCrewState(token))!.cleaning;
    await inventory.resetDraft(cleaning, null, 'unavailable');
    const state = await inventory.readCrewState(token);
    expect(state?.draft?.status).toBe('unavailable');
    expect(state?.draft?.items).toEqual([]);
    expect(state?.confirmed).toBeNull();

    expect(
      await actions.confirmCleaningInventory(
        token,
        [{ room: 'Baño', name: 'Toallas', observed: 2, condition: 'ok' }],
        '',
        'Rosa',
      ),
    ).toEqual({ ok: true, source: 'crew' });

    const { data } = await admin
      .from('cleaning_inventory')
      .select('source, property_id')
      .eq('cleaning_id', cleaningId)
      .single();
    expect(data!.source).toBe('crew');
    expect(data!.property_id).toBe(propertyId);
  });
});
