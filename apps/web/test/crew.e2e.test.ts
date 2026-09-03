import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
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
const memberIds: string[] = [];

const newMember = async (input: {
  kind: 'internal' | 'external';
  name: string;
  whatsapp?: string | null;
  email?: string | null;
  active?: boolean;
}) => {
  const member = await crew.createCrewMember(input);
  expect(member).toBeTruthy();
  memberIds.push(member!.id);
  return member!;
};

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

afterAll(async () => {
  if (!LIVE || !memberIds.length) return;
  await admin.from('crew_member').delete().in('id', memberIds);
});

describe.skipIf(!LIVE)('operator-managed crew layer', () => {
  it('prefers the operator assignment over the mirrored teammate, for each role', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Crew Preferido' });
    const propertyId = prop.id!;
    await admin.from('property_contacts').insert([
      {
        property_id: propertyId,
        role: 'cleaning',
        external_id: 'tm-mirror-clean',
        name: 'Mirror Aseo',
        whatsapp: '+56 9 1111 1111',
        email: 'mirror.aseo@test.cl',
      },
      {
        property_id: propertyId,
        role: 'concierge',
        external_id: 'tm-mirror-conserje',
        name: 'Mirror Conserje',
        whatsapp: '+56 9 2222 2222',
      },
    ]);

    const interna = await newMember({
      kind: 'internal',
      name: 'Rosa Interna',
      whatsapp: '+56 9 3333 3333',
      email: 'rosa@luxel.test',
    });
    const externa = await newMember({
      kind: 'external',
      name: 'Conserjería Edificio',
      whatsapp: '+56 9 4444 4444',
    });
    expect(await crew.assignCrew({ memberId: interna.id, propertyId, role: 'cleaning' })).toBe(
      true,
    );
    expect(await crew.assignCrew({ memberId: externa.id, propertyId, role: 'concierge' })).toBe(
      true,
    );

    expect(await crew.recipients(propertyId, 'cleaning')).toEqual([
      {
        memberId: interna.id,
        kind: 'internal',
        name: 'Rosa Interna',
        phone: '56933333333',
        email: 'rosa@luxel.test',
        source: 'crew',
      },
    ]);
    expect(await crew.recipients(propertyId, 'concierge')).toEqual([
      {
        memberId: externa.id,
        kind: 'external',
        name: 'Conserjería Edificio',
        phone: '56944444444',
        email: null,
        source: 'crew',
      },
    ]);
  });

  it('falls back to the mirrored teammates when the property has no assignment for that role', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Solo Espejo' });
    const propertyId = prop.id!;
    await admin.from('property_contacts').insert([
      {
        property_id: propertyId,
        role: 'cleaning',
        external_id: 'tm-solo-clean',
        name: 'Mirror Aseo',
        whatsapp: '+56 9 1111 1111',
      },
      {
        property_id: propertyId,
        role: 'concierge',
        external_id: 'tm-solo-conserje',
        name: 'Mirror Conserje',
        whatsapp: null,
        email: 'conserje@edificio.test',
      },
    ]);
    const member = await newMember({
      kind: 'internal',
      name: 'Solo Aseo',
      whatsapp: '+56 9 5555 5555',
    });
    await crew.assignCrew({ memberId: member.id, propertyId, role: 'cleaning' });

    expect((await crew.recipients(propertyId, 'cleaning')).map((r) => r.source)).toEqual(['crew']);
    expect(await crew.recipients(propertyId, 'concierge')).toEqual([
      {
        memberId: null,
        kind: null,
        name: 'Mirror Conserje',
        phone: null,
        email: 'conserje@edificio.test',
        source: 'mirror',
      },
    ]);
  });

  it('never returns the same phone twice, whatever the source or the formatting', async () => {
    const assigned = await seedImportedProperty({ nickname: 'Depto Sin Duplicados' });
    const assignedId = assigned.id!;
    await admin.from('property_contacts').insert({
      property_id: assignedId,
      role: 'cleaning',
      external_id: 'tm-same-phone',
      name: 'Misma Persona',
      whatsapp: '+56 9 6666 6666',
    });
    const a = await newMember({ kind: 'internal', name: 'Uno', whatsapp: '+56 9 6666 6666' });
    const b = await newMember({ kind: 'external', name: 'Dos', whatsapp: '56966666666' });
    await crew.assignCrew({ memberId: a.id, propertyId: assignedId, role: 'cleaning' });
    await crew.assignCrew({ memberId: b.id, propertyId: assignedId, role: 'cleaning' });

    const fromCrew = await crew.recipients(assignedId, 'cleaning');
    expect(fromCrew).toHaveLength(1);
    expect(fromCrew[0]).toMatchObject({ memberId: a.id, phone: '56966666666', source: 'crew' });

    const mirrored = await seedImportedProperty({ nickname: 'Depto Espejo Doble' });
    const mirroredId = mirrored.id!;
    await admin.from('property_contacts').insert([
      {
        property_id: mirroredId,
        role: 'concierge',
        external_id: 'tm-dup-a',
        name: 'Conserje A',
        whatsapp: '+56 9 7777 7777',
      },
      {
        property_id: mirroredId,
        role: 'concierge',
        external_id: 'tm-dup-b',
        name: 'Conserje B',
        whatsapp: '56977777777',
      },
    ]);
    const fromMirror = await crew.recipients(mirroredId, 'concierge');
    expect(fromMirror).toHaveLength(1);
    expect(fromMirror[0]).toMatchObject({ phone: '56977777777', source: 'mirror' });
  });

  it('skips a deactivated member and keeps the mirror out of the way', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Desactivado' });
    const propertyId = prop.id!;
    await admin.from('property_contacts').insert({
      property_id: propertyId,
      role: 'cleaning',
      external_id: 'tm-shadowed',
      name: 'Mirror Aseo',
      whatsapp: '+56 9 1111 1111',
    });
    const activa = await newMember({
      kind: 'internal',
      name: 'Activa',
      whatsapp: '+56 9 8888 8888',
    });
    const cesada = await newMember({
      kind: 'external',
      name: 'Cesada',
      whatsapp: '+56 9 9999 9999',
    });
    await crew.assignCrew({ memberId: activa.id, propertyId, role: 'cleaning' });
    await crew.assignCrew({ memberId: cesada.id, propertyId, role: 'cleaning' });
    expect(await crew.deactivateCrewMember(cesada.id)).toBe(true);

    const people = await crew.recipients(propertyId, 'cleaning');
    expect(people.map((r) => r.memberId)).toEqual([activa.id]);
  });

  it('creates, edits, assigns, unassigns and lists the crew the operator manages', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Consola' });
    const propertyId = prop.id!;
    const member = await newMember({
      kind: 'external',
      name: '  Conserjería Torre B  ',
      whatsapp: '9 1234 5678',
      email: '  torreb@edificio.test ',
    });
    expect(member).toMatchObject({
      kind: 'external',
      name: 'Conserjería Torre B',
      whatsapp: '+56912345678',
      email: 'torreb@edificio.test',
      active: true,
    });

    expect(await crew.assignCrew({ memberId: member.id, propertyId, role: 'concierge' })).toBe(
      true,
    );
    expect(await crew.assignCrew({ memberId: member.id, propertyId, role: 'concierge' })).toBe(
      true,
    );
    const assignments = await crew.listCrewAssignments(propertyId);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ propertyId, role: 'concierge' });
    expect(assignments[0]!.member.id).toBe(member.id);

    const renamed = await crew.updateCrewMember(member.id, {
      name: 'Conserjería Torre B — turno noche',
      note: 'Turno 22:00 a 08:00',
    });
    expect(renamed).toMatchObject({
      name: 'Conserjería Torre B — turno noche',
      note: 'Turno 22:00 a 08:00',
    });
    expect(await crew.updateCrewMember(member.id, { name: '   ' })).toBeNull();

    const listed = await crew.listCrewMembers({ kind: 'external', active: true });
    expect(listed.some((m) => m.id === member.id)).toBe(true);
    expect(listed.every((m) => m.kind === 'external' && m.active)).toBe(true);

    expect(await crew.unassignCrew({ memberId: member.id, propertyId, role: 'concierge' })).toBe(
      true,
    );
    expect(await crew.listCrewAssignments(propertyId)).toEqual([]);
    expect(await crew.recipients(propertyId, 'concierge')).toEqual([]);
  });

  it('keeps the crew out of reach of a signed-in host', async () => {
    if (!ANON_KEY) return;
    const prop = await seedImportedProperty({ nickname: 'Depto Sin Fisgones' });
    const member = await newMember({
      kind: 'internal',
      name: 'Reservada',
      whatsapp: '+56 9 1010 1010',
    });
    await crew.assignCrew({ memberId: member.id, propertyId: prop.id!, role: 'cleaning' });

    const guest = createClient(SUPABASE_URL!, ANON_KEY, { auth: { persistSession: false } });
    const { data: members } = await guest.from('crew_member').select('id');
    const { data: links } = await guest.from('crew_assignment').select('id');
    expect(members ?? []).toEqual([]);
    expect(links ?? []).toEqual([]);
  });
});
