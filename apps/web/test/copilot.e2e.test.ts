/**
 * Proof of the AI messaging co-pilot wiring: the host's property knowledge is
 * saved, and drafting degrades gracefully (handoff) when no AI key is configured.
 * OPENAI_API_KEY is force-cleared so the test is deterministic and never calls out.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-copilot-${nodeCrypto.randomUUID()}`;
delete process.env.OPENAI_API_KEY; // deterministic no-AI path

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let admin: ReturnType<typeof createClient>;
let createProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let updateGuestInfo: (i: unknown) => Promise<{ ok: boolean }>;
let draftReply: (
  i: unknown,
) => Promise<{ ok: boolean; draft?: string; handoff?: boolean; reason?: string }>;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  createProperty = (await import('../src/app/[locale]/(site)/properties/actions')).createProperty;
  const cp = await import('../src/app/[locale]/(site)/properties/copilot-actions');
  updateGuestInfo = cp.updateGuestInfo;
  draftReply = cp.draftReply;
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
  it('saves property knowledge and hands off gracefully without an AI key', async () => {
    const prop = await createProperty({ nickname: 'Depto Copiloto' });
    const propertyId = prop.id!;

    const save = await updateGuestInfo({
      propertyId,
      guestInfo: 'WiFi: LuxelGuest / clave 1234. Check-in 15:00.',
    });
    expect(save.ok).toBe(true);
    const { data } = await admin
      .from('properties')
      .select('guest_info')
      .eq('id', propertyId)
      .maybeSingle();
    expect(data!.guest_info).toContain('WiFi');

    const d = await draftReply({ propertyId, guestMessage: '¿Cuál es la clave del wifi?' });
    expect(d.ok).toBe(true);
    expect(d.reason).toBe('no_ai');
    expect(d.handoff).toBe(true);
  });

  it('rejects a draft request for a property the caller does not own', async () => {
    const d = await draftReply({ propertyId: nodeCrypto.randomUUID(), guestMessage: 'hola' });
    expect(d.ok).toBe(false);
  });
});
