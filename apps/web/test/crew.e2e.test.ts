import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type * as CrewModule from '@luxel/core/crew';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-crew-${nodeCrypto.randomUUID()}`;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let crew: typeof CrewModule;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  crew = await import('@luxel/core/crew');
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'crew@test.cl',
      full_name: 'Crew Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

describe.skipIf(!LIVE)('the crew is the Hospitable teammate mirror', () => {
  it('returns every teammate the mirror holds for that role', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Equipo' });
    const propertyId = prop.id!;
    await admin.from('property_contacts').insert([
      {
        property_id: propertyId,
        role: 'cleaning',
        external_id: 'tm-aseo-1',
        name: 'Aseo Uno',
        whatsapp: '+56 9 1111 1111',
        email: 'uno@aseo.test',
      },
      {
        property_id: propertyId,
        role: 'cleaning',
        external_id: 'tm-aseo-2',
        name: 'Aseo Dos',
        whatsapp: null,
        email: 'dos@aseo.test',
      },
    ]);

    const people = await crew.recipients(propertyId, 'cleaning');
    expect(people.map((person) => person.name)).toEqual(['Aseo Dos', 'Aseo Uno']);
    expect(people.map((person) => person.phone)).toEqual([null, '56911111111']);
    expect(people.map((person) => person.email)).toEqual(['dos@aseo.test', 'uno@aseo.test']);
  });

  it('keeps the two roles apart', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Roles' });
    const propertyId = prop.id!;
    await admin.from('property_contacts').insert([
      {
        property_id: propertyId,
        role: 'cleaning',
        external_id: 'tm-solo-aseo',
        name: 'Solo Aseo',
        whatsapp: '+56 9 1111 1111',
      },
      {
        property_id: propertyId,
        role: 'concierge',
        external_id: 'tm-solo-conserje',
        name: 'Solo Conserje',
        whatsapp: '+56 9 2222 2222',
      },
    ]);

    expect((await crew.recipients(propertyId, 'cleaning')).map((p) => p.name)).toEqual([
      'Solo Aseo',
    ]);
    expect((await crew.recipients(propertyId, 'concierge')).map((p) => p.name)).toEqual([
      'Solo Conserje',
    ]);
  });

  it('never returns the same phone twice, whatever the formatting', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Sin Duplicados' });
    const propertyId = prop.id!;
    await admin.from('property_contacts').insert([
      {
        property_id: propertyId,
        role: 'concierge',
        external_id: 'tm-dup-a',
        name: 'Conserje A',
        whatsapp: '+56 9 7777 7777',
      },
      {
        property_id: propertyId,
        role: 'concierge',
        external_id: 'tm-dup-b',
        name: 'Conserje B',
        whatsapp: '56977777777',
      },
    ]);

    const people = await crew.recipients(propertyId, 'concierge');
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ phone: '56977777777' });
  });

  it('skips a teammate that carries neither WhatsApp nor email', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Sin Contacto' });
    const propertyId = prop.id!;
    await admin.from('property_contacts').insert([
      {
        property_id: propertyId,
        role: 'cleaning',
        external_id: 'tm-mudo',
        name: 'Sin Contacto',
        whatsapp: null,
        email: null,
      },
      {
        property_id: propertyId,
        role: 'cleaning',
        external_id: 'tm-hablante',
        name: 'Con Contacto',
        whatsapp: '+56 9 3333 3333',
      },
    ]);

    expect((await crew.recipients(propertyId, 'cleaning')).map((p) => p.name)).toEqual([
      'Con Contacto',
    ]);
  });

  it('returns nobody when the mirror holds nobody for that role', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Vacío' });
    expect(await crew.recipients(prop.id!, 'cleaning')).toEqual([]);
    expect(await crew.recipients(prop.id!, 'concierge')).toEqual([]);
  });

  it('keeps the crew out of reach of a signed-in host', async () => {
    if (!ANON_KEY) return;
    const prop = await seedImportedProperty({ nickname: 'Depto Sin Fisgones' });
    await admin.from('property_contacts').insert({
      property_id: prop.id!,
      role: 'cleaning',
      external_id: 'tm-reservado',
      name: 'Reservada',
      whatsapp: '+56 9 1010 1010',
    });

    const guest = createClient(SUPABASE_URL!, ANON_KEY, { auth: { persistSession: false } });
    const { data: contacts } = await guest.from('property_contacts').select('id');
    expect(contacts ?? []).toEqual([]);
  });
});
