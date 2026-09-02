import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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
let updateGuestInfo: (i: unknown) => Promise<{ ok: boolean }>;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  const cp = await import('../src/app/[locale]/(site)/properties/copilot-actions');
  updateGuestInfo = cp.updateGuestInfo;
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
  it('saves property knowledge on the listing', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Copiloto' });
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
  });

  it('rejects knowledge for a property the caller does not own', async () => {
    const r = await updateGuestInfo({ propertyId: nodeCrypto.randomUUID(), guestInfo: 'hola' });
    expect(r.ok).toBe(false);
  });
});
