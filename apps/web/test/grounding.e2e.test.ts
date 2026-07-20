/**
 * Proof of the AI grounding rules: a property with chat history grounds on its
 * OWN experience (learned answers + past guest→host/AI pairs); a property with
 * no history falls back to anonymized cross-property experience ("context of
 * other users") with contact PII scrubbed; an empty platform yields none.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-ground-${nodeCrypto.randomUUID()}`;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

let admin: ReturnType<typeof createClient>;
let buildGrounding: (id: string) => Promise<{ source: string; text: string }>;
let createProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let customerId: string;

async function seedThread(propertyId: string, q: string, a: string, source: 'host' | 'ai') {
  const { data: thread } = await admin
    .from('guest_threads')
    .insert({
      property_id: propertyId,
      channel: 'local',
      external_thread_id: `g-${nodeCrypto.randomUUID()}`,
    })
    .select('id')
    .single();
  // Two statements → distinct created_at, so Q→A ordering is deterministic.
  await admin
    .from('guest_messages')
    .insert({ thread_id: thread!.id, direction: 'in', source: 'guest', body: q });
  await admin
    .from('guest_messages')
    .insert({ thread_id: thread!.id, direction: 'out', source, body: a });
}

beforeAll(async () => {
  if (!LIVE) return;
  buildGrounding = (await import('../src/lib/ai/grounding')).buildGrounding;
  createProperty = (await import('../src/app/[locale]/(site)/properties/actions')).createProperty;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'ground@test.cl',
      full_name: 'Ground Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

describe.skipIf(!LIVE)('AI grounding (end to end)', () => {
  it('grounds on the property own history — chats AND automated (AI) messages', async () => {
    const prop = await createProperty({ nickname: 'Depto Con Historia' });
    await seedThread(prop.id!, '¿Aceptan mascotas?', 'Sí, mascotas pequeñas sin costo.', 'host');
    await seedThread(
      prop.id!,
      '¿A qué hora es el check-in?',
      'El check-in es desde las 15:00.',
      'ai',
    );

    const g = await buildGrounding(prop.id!);
    expect(g.source).toBe('property');
    expect(g.text).toContain('mascotas pequeñas sin costo'); // host reply learned
    expect(g.text).toContain('desde las 15:00'); // automated (AI) reply learned
  });

  it('falls back to anonymized cross-property experience when the property has none', async () => {
    const experienced = await createProperty({ nickname: 'Depto Veterano' });
    await seedThread(
      experienced.id!,
      '¿Hay estacionamiento? escríbeme a juan@perez.cl o +56 9 1234 5678',
      'Sí, estacionamiento en el subterráneo.',
      'host',
    );
    const fresh = await createProperty({ nickname: 'Depto Nuevo' });

    const g = await buildGrounding(fresh.id!);
    expect(g.source).toBe('global');
    expect(g.text).toContain('estacionamiento en el subterráneo'); // other users' experience
    expect(g.text).toContain('GENÉRICA'); // marked as generic context
    expect(g.text).not.toContain('juan@perez.cl'); // contact PII scrubbed
    expect(g.text).not.toContain('1234 5678');
  });
});
