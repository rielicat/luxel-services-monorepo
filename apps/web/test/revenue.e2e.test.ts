/**
 * End-to-end proof of the global agent's host tool: get_host_status reports the
 * signed-in host's REAL account state (properties, pending conversations,
 * upcoming cleanings) and degrades honestly — no session → guidance, no channel
 * token → "ocupación no disponible" — never invented numbers.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-host-${nodeCrypto.randomUUID()}`;
delete process.env.HOSPITABLE_API_TOKEN; // occupancy must degrade honestly, not fall to env

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
    await admin.from('cleanings').insert({
      property_id: prop.id!,
      cleaning_date: '2027-02-01',
      status: 'scheduled',
      source: 'manual',
    });

    const r = await runTool('get_host_status', {}, { customerId });
    expect(r.content).toContain('Depto Estado Real');
    expect(r.content).toContain('próximo aseo 2027-02-01');
    expect(r.content).toContain('0 conversaciones por responder');
    // No channel token in this fixture → occupancy must degrade, not invent.
    expect(r.content).toContain('ocupación no disponible');
  });

  it('guides signed-out users and empty accounts instead of failing', async () => {
    const signedOut = await runTool('get_host_status', {}, { customerId: null });
    expect(signedOut.content).toContain('no ha iniciado sesión');

    const empty = await runTool('get_host_status', {}, { customerId });
    expect(empty.content).toContain('no tiene propiedades conectadas');
  });
});
