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
delete process.env.OPENAI_API_KEY; // deterministic: no real LLM call
delete process.env.LUXEL_DEV_MOCK; // reset (other test files may have set it)

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
  createProperty = (await import('./helpers/seed')).createProperty;
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

  it('drafts a grounded reply in dev-mock mode, flagging handoff on frustration', async () => {
    process.env.LUXEL_DEV_MOCK = '1';
    try {
      const prop = await createProperty({ nickname: 'Depto Mock' });
      await updateGuestInfo({ propertyId: prop.id, guestInfo: 'WiFi: LuxelGuest / clave 1234.' });

      const ok = await draftReply({
        propertyId: prop.id,
        guestMessage: '¿Cuál es la clave del wifi?',
      });
      expect(ok.ok).toBe(true);
      expect(ok.reason).toBeUndefined();
      expect(ok.draft).toBeTruthy();
      expect(ok.handoff).toBe(false);

      const angry = await draftReply({
        propertyId: prop.id,
        guestMessage: 'Esto es pésimo, quiero hablar con una persona',
      });
      expect(angry.handoff).toBe(true);
    } finally {
      delete process.env.LUXEL_DEV_MOCK;
    }
  });
});
