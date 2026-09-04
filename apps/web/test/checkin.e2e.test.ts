import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type * as CrewModule from '@luxel/core/crew';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-checkin-${nodeCrypto.randomUUID()}`;
process.env.LUXEL_PII_KEY = nodeCrypto.randomBytes(32).toString('hex');
delete process.env.RESEND_API_KEY;
process.env.LUXEL_DEV_MOCK = '1';
process.env.WHATSAPP_WORKER_SEND_URL = 'http://worker.test/send';
process.env.INTERNAL_SEND_TOKEN = 'test-internal-token';
const workerSends: Array<{ to?: string; template?: { kind: string; params: string[] } }> = [];
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
  clerkClient: async () => ({
    users: { getUser: async () => ({ publicMetadata: { role: 'admin' } }) },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let mintCheckinLink: (propertyId: string) => Promise<{ ok: boolean; token?: string }>;
let submitCheckin: (i: unknown) => Promise<{ ok: boolean; error?: string }>;
let decryptPII: (s: string) => string;
let stayRangeEs: (a: string, b: string) => string;
let crew: typeof CrewModule;
let customerId: string;
const crewIds: string[] = [];

beforeAll(async () => {
  if (!LIVE) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === 'http://worker.test/send') {
      workerSends.push(JSON.parse((init?.body as string) ?? '{}'));
      return Response.json({ wamid: 'wamid.test' });
    }
    return realFetch(input, init);
  });
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  const { checkinToken } = await import('@luxel/core/checkin/tokens');
  mintCheckinLink = async (propertyId) => {
    const token = checkinToken();
    const { error } = await admin
      .from('checkins')
      .insert({ property_id: propertyId, token, status: 'pending' });
    return { ok: !error, token };
  };
  submitCheckin = (await import('../src/app/[locale]/checkin/[id]/actions')).submitCheckin;
  decryptPII = (await import('@luxel/core/crypto/pii')).decryptPII;
  stayRangeEs = (await import('@luxel/core/checkin/copy')).stayRangeEs;
  crew = await import('@luxel/core/crew');
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'host@test.cl',
      full_name: 'Anfitrión Test',
      phone: '+56 9 7000 1000',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

const setAccess = (input: {
  propertyId: string;
  method: string;
  keylessCode?: string;
  keylessInstructions?: string;
  unit?: string;
  requireId?: boolean;
}) =>
  admin.from('property_access').upsert(
    {
      property_id: input.propertyId,
      method: input.method,
      keyless_code: input.keylessCode ?? null,
      keyless_instructions: input.keylessInstructions ?? null,
      unit: input.unit ?? null,
      require_id: Boolean(input.requireId),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'property_id' },
  );

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
  workerSends.length = 0;
});

afterAll(async () => {
  if (!LIVE || !crewIds.length) return;
  await admin.from('crew_member').delete().in('id', crewIds);
});

describe.skipIf(!LIVE)('guest check-in + access (end to end)', () => {
  it('runs the full host→guest flow and stores the party with encrypted IDs', async () => {
    const prop = await seedImportedProperty({
      nickname: 'Depto Providencia',
      comuna: 'Providencia',
    });
    expect(prop.ok).toBe(true);
    const propertyId = prop.id!;

    const { data: access0 } = await admin
      .from('property_access')
      .select('method')
      .eq('property_id', propertyId)
      .maybeSingle();
    expect(access0!.method).toBe('physical_none');

    await setAccess({
      propertyId,
      method: 'keyless',
      keylessCode: '4821',
      keylessInstructions: 'Piso 4, depto B',
      unit: '401',
    });

    const link = await mintCheckinLink(propertyId);
    expect(link.ok).toBe(true);
    const token = link.token!;
    const arrival = plusDays(2);
    const departure = plusDays(5);
    await admin
      .from('checkins')
      .update({ arrival_date: arrival, departure_date: departure, expected_guests: 2 })
      .eq('token', token);
    await admin.from('property_contacts').insert({
      property_id: propertyId,
      role: 'concierge',
      name: 'Conserjería',
      whatsapp: '+56 9 8765 4321',
    });

    const res = await submitCheckin({
      id: token,
      guests: [
        { fullName: 'María Pérez', docType: 'rut', docNumber: '12.345.678-9' },
        { fullName: 'Pedro Pérez', docType: 'rut', docNumber: '9.876.543-2' },
      ],
      arrivalTime: '18:00',
      departureTime: '11:00',
      parking: true,
      vehiclePlate: 'abcd12',
    });
    expect(res.ok).toBe(true);
    expect(JSON.stringify(res)).not.toContain('4821');

    expect(workerSends).toHaveLength(2);
    const conserjeSend = workerSends.find((w) => w.to === '56987654321')!;
    expect(conserjeSend.to).toBe('56987654321');
    expect(conserjeSend.template!.params).toEqual([
      stayRangeEs(arrival, departure),
      'Depto. 401 · Providencia',
      'sí · patente ABCD12',
      '2 · María Pérez · 12.345.678-9 | Pedro Pérez · 9.876.543-2',
    ]);

    const { data: checkin } = await admin
      .from('checkins')
      .select(
        'id, status, guest_name, party_size, arrival_time, departure_time, parking, vehicle_plate, notify_result',
      )
      .eq('token', token)
      .maybeSingle();
    expect(checkin!.guest_name).toBe('María Pérez');
    expect(checkin!.party_size).toBe(2);
    expect(checkin!.arrival_time).toBe('18:00');
    expect(checkin!.departure_time).toBe('11:00');
    expect(checkin!.parking).toBe(true);
    expect(checkin!.vehicle_plate).toBe('ABCD12');
    expect(checkin!.status).toBe('notified');
    const result = checkin!.notify_result as Array<{ role: string; channel: string; ok: boolean }>;
    expect(result.some((r) => r.role === 'guest')).toBe(false);
    expect(JSON.stringify(result)).not.toContain('4821');
    expect(result.some((r) => r.role === 'host' && r.ok)).toBe(true);
    expect(result.some((r) => r.role === 'concierge' && r.channel === 'whatsapp' && r.ok)).toBe(
      true,
    );
    expect(result.some((r) => r.role === 'host' && r.channel === 'whatsapp' && r.ok)).toBe(true);
    const hostSend = workerSends.find((w) => w.to === '56970001000')!;
    expect(hostSend.template!.kind).toBe('concierge_arrival');
    expect(JSON.stringify(hostSend.template!.params)).not.toContain('12.345.678');
    expect(hostSend.template!.params[3]).toContain('María Pérez');
    expect(JSON.stringify(result)).not.toContain('12.345.678');

    const { data: guests } = await admin
      .from('checkin_guests')
      .select('is_lead, full_name, doc_type, doc_last4, doc_number_enc')
      .eq('checkin_id', checkin!.id)
      .order('is_lead', { ascending: false });
    expect(guests).toHaveLength(2);
    expect(guests![0]).toMatchObject({
      is_lead: true,
      full_name: 'María Pérez',
      doc_type: 'rut',
      doc_last4: '78-9',
    });
    expect(guests![0].doc_number_enc).not.toContain('12.345.678-9');
    expect(decryptPII(guests![0].doc_number_enc as string)).toBe('12.345.678-9');
    expect(guests![1]).toMatchObject({
      is_lead: false,
      full_name: 'Pedro Pérez',
      doc_type: 'rut',
      doc_last4: '43-2',
    });
    expect(guests![1].doc_number_enc).not.toContain('9.876.543-2');
    expect(decryptPII(guests![1].doc_number_enc as string)).toBe('9.876.543-2');
  });

  it('registers the party with the operator-assigned conserje, not the mirrored teammate', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Conserjería' });
    const propertyId = prop.id!;
    await admin.from('property_contacts').insert({
      property_id: propertyId,
      role: 'concierge',
      external_id: 'tm-espejo',
      name: 'Conserjería Espejo',
      whatsapp: '+56 9 1111 1111',
    });
    const member = await crew.createCrewMember({
      kind: 'external',
      name: 'Conserjería Torre A',
      whatsapp: '+56 9 3333 4444',
    });
    expect(member).toBeTruthy();
    crewIds.push(member!.id);
    expect(await crew.assignCrew({ memberId: member!.id, propertyId, role: 'concierge' })).toBe(
      true,
    );

    const link = await mintCheckinLink(propertyId);
    await admin
      .from('checkins')
      .update({ arrival_date: plusDays(2), departure_date: plusDays(4) })
      .eq('token', link.token!);
    const res = await submitCheckin({
      id: link.token,
      guests: [{ fullName: 'Ana Asignada', docType: 'rut', docNumber: '11.111.111-1' }],
      arrivalTime: '18:00',
    });
    expect(res.ok).toBe(true);

    expect(workerSends).toHaveLength(2);
    expect(workerSends[0]).toMatchObject({
      to: '56933334444',
      template: { kind: 'concierge_arrival' },
    });
    const { data: checkin } = await admin
      .from('checkins')
      .select('notify_result')
      .eq('token', link.token!)
      .maybeSingle();
    const result = checkin!.notify_result as Array<{ role: string; channel: string; to: string }>;
    expect(result.filter((r) => r.role === 'concierge')).toEqual([
      { channel: 'whatsapp', to: '+56933334444', role: 'concierge', ok: true },
    ]);
  });

  it('rejects a party without an arrival slot, an empty party, or a guest without a document', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Estricto' });
    const link = await mintCheckinLink(prop.id!);
    const base = { id: link.token };
    const doc = { docType: 'rut', docNumber: '11.111.111-1' };
    const noSlot = await submitCheckin({ ...base, guests: [{ fullName: 'Sin Hora', ...doc }] });
    expect(noSlot).toMatchObject({ ok: false, error: 'validation' });
    const empty = await submitCheckin({ ...base, guests: [], arrivalTime: '15:00' });
    expect(empty).toMatchObject({ ok: false, error: 'validation' });
    const noDoc = await submitCheckin({
      ...base,
      guests: [{ fullName: 'Sin Documento' }],
      arrivalTime: '15:00',
    });
    expect(noDoc).toMatchObject({ ok: false, error: 'validation' });
    const shortDoc = await submitCheckin({
      ...base,
      guests: [{ fullName: 'Doc Corto', docType: 'rut', docNumber: '12' }],
      arrivalTime: '15:00',
    });
    expect(shortDoc).toMatchObject({ ok: false, error: 'validation' });
    const badSlot = await submitCheckin({
      ...base,
      guests: [{ fullName: 'Hora Rara', ...doc }],
      arrivalTime: '6pm',
    });
    expect(badSlot).toMatchObject({ ok: false, error: 'validation' });
    expect(workerSends).toHaveLength(0);
  });

  it('never returns the door code to the browser; Hospitable delivers it 3 days before arrival', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Lejano' });
    const propertyId = prop.id!;
    await setAccess({ propertyId, method: 'keyless', keylessCode: '4821' });
    const link = await mintCheckinLink(propertyId);
    await admin
      .from('checkins')
      .update({ arrival_date: plusDays(10), departure_date: plusDays(13) })
      .eq('token', link.token!);
    const res = await submitCheckin({
      id: link.token,
      guests: [{ fullName: 'Llega En Diez Días', docType: 'passport', docNumber: 'X1234567' }],
      arrivalTime: '22:30+',
    });
    expect(res.ok).toBe(true);
    expect(res).toEqual({ ok: true });
    expect(workerSends.filter((w) => w.to === '56987654321')).toHaveLength(0);
    expect(JSON.stringify(workerSends)).not.toContain('4821');
    const { data: checkin } = await admin
      .from('checkins')
      .select('party_size, arrival_time, departure_time')
      .eq('token', link.token!)
      .maybeSingle();
    expect(checkin).toMatchObject({ party_size: 1, arrival_time: '22:30+', departure_time: null });
  });

  it('sends the host one message, not two, when they are also the conserjería contact', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Dueño En Recepción' });
    const propertyId = prop.id!;
    await admin.from('property_contacts').insert({
      property_id: propertyId,
      role: 'concierge',
      name: 'Recepción',
      whatsapp: '+56 9 7000 1000',
    });
    const link = await mintCheckinLink(propertyId);
    await admin
      .from('checkins')
      .update({ arrival_date: plusDays(4), departure_date: plusDays(6) })
      .eq('token', link.token!);

    const res = await submitCheckin({
      id: link.token,
      guests: [{ fullName: 'Sola Viajera', docType: 'rut', docNumber: '5.555.555-5' }],
      arrivalTime: '17:00',
    });
    expect(res.ok).toBe(true);
    expect(workerSends.filter((w) => w.to === '56970001000')).toHaveLength(1);
  });

  it('lets a direct reservation declare its own party when the booking did not', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Sin Cupo' });
    const propertyId = prop.id!;
    const link = await mintCheckinLink(propertyId);
    await admin
      .from('checkins')
      .update({ arrival_date: plusDays(3), departure_date: plusDays(6), expected_guests: null })
      .eq('token', link.token!);

    const res = await submitCheckin({
      id: link.token,
      guests: [
        { fullName: 'Uno Directo', docType: 'rut', docNumber: '11.111.111-1' },
        { fullName: 'Dos Directo', docType: 'rut', docNumber: '22.222.222-2' },
        { fullName: 'Tres Directo', docType: 'passport', docNumber: 'X9999999' },
      ],
      arrivalTime: '16:00',
    });
    expect(res.ok).toBe(true);

    const { data: checkin } = await admin
      .from('checkins')
      .select('id, party_size')
      .eq('token', link.token!)
      .maybeSingle();
    expect(checkin!.party_size).toBe(3);
    const { data: guests } = await admin
      .from('checkin_guests')
      .select('id')
      .eq('checkin_id', checkin!.id as string);
    expect(guests).toHaveLength(3);
  });

  it('claims the link once: two simultaneous submits store one party and notify once', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Doble' });
    const propertyId = prop.id!;
    await admin.from('property_contacts').insert({
      property_id: propertyId,
      role: 'concierge',
      name: 'Conserjería',
      whatsapp: '+56 9 1111 2222',
    });
    const link = await mintCheckinLink(propertyId);
    await admin
      .from('checkins')
      .update({ arrival_date: plusDays(3), departure_date: plusDays(5) })
      .eq('token', link.token!);
    const input = {
      id: link.token,
      guests: [
        { fullName: 'Ana Uno', docType: 'rut', docNumber: '11.111.111-1' },
        { fullName: 'Beto Dos', docType: 'rut', docNumber: '22.222.222-2' },
      ],
      arrivalTime: '18:00',
    };
    const results = await Promise.all([submitCheckin(input), submitCheckin(input)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: 'already_submitted' });
    const { data: checkin } = await admin
      .from('checkins')
      .select('id, party_size')
      .eq('token', link.token!)
      .maybeSingle();
    const { data: guests } = await admin
      .from('checkin_guests')
      .select('id')
      .eq('checkin_id', checkin!.id as string);
    expect(guests).toHaveLength(2);
    expect(checkin!.party_size).toBe(2);
    expect(workerSends).toHaveLength(2);
  });

  it('opens by Airbnb confirmation code as well as by token, whatever the casing', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Código' });
    const propertyId = prop.id!;
    const link = await mintCheckinLink(propertyId);
    await admin
      .from('checkins')
      .update({
        confirmation_code: 'HMTESTCODE',
        arrival_date: plusDays(4),
        departure_date: plusDays(6),
      })
      .eq('token', link.token!);

    const { findCheckin } = await import('@luxel/core/checkin/resolve');
    const byToken = await findCheckin(admin, link.token!, 'id, property_id, confirmation_code');
    const byCode = await findCheckin(admin, 'hmtestcode', 'id, property_id, confirmation_code');
    const spaced = await findCheckin(admin, ' HMTESTCODE ', 'id, property_id, confirmation_code');
    expect(byToken?.id).toBe(byCode?.id);
    expect(spaced?.id).toBe(byCode?.id);
    expect(await findCheckin(admin, 'HMNOSUCHCODE', 'id, property_id')).toBeNull();

    const res = await submitCheckin({
      id: 'hmtestcode',
      guests: [{ fullName: 'Entra Por Código', docType: 'rut', docNumber: '11.111.111-1' }],
      arrivalTime: '18:00',
    });
    expect(res.ok).toBe(true);
    const { data: row } = await admin
      .from('checkins')
      .select('status, guest_name')
      .eq('token', link.token!)
      .single();
    expect(row).toMatchObject({ status: 'notified', guest_name: 'Entra Por Código' });
  });

  it('refuses a confirmation code that two properties share', async () => {
    const a = await seedImportedProperty({ nickname: 'Depto Uno' });
    const b = await seedImportedProperty({ nickname: 'Depto Dos' });
    const linkA = await mintCheckinLink(a.id!);
    const linkB = await mintCheckinLink(b.id!);
    for (const t of [linkA.token!, linkB.token!]) {
      await admin.from('checkins').update({ confirmation_code: 'HMSHARED01' }).eq('token', t);
    }
    const { findCheckin } = await import('@luxel/core/checkin/resolve');
    expect(await findCheckin(admin, 'HMSHARED01', 'id, property_id')).toBeNull();
    expect((await findCheckin(admin, linkA.token!, 'id, property_id'))?.id).toBeTruthy();
  });

  it('a revoked link is refused, so a cancelled stay cannot register', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Cancelado' });
    const link = await mintCheckinLink(prop.id!);
    await admin
      .from('checkins')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', link.token!);
    const res = await submitCheckin({
      id: link.token,
      guests: [{ fullName: 'Ya No Viene', docType: 'rut', docNumber: '11.111.111-1' }],
      arrivalTime: '15:00',
    });
    expect(res).toMatchObject({ ok: false, error: 'expired' });
    expect(workerSends).toHaveLength(0);
  });

  it('leaves the link pending when the PII key is missing, so the guest can retry', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Sin Clave' });
    const link = await mintCheckinLink(prop.id!);
    const saved = process.env.LUXEL_PII_KEY;
    delete process.env.LUXEL_PII_KEY;
    try {
      const res = await submitCheckin({
        id: link.token,
        guests: [{ fullName: 'Sin Clave', docType: 'rut', docNumber: '11.111.111-1' }],
        arrivalTime: '15:00',
      });
      expect(res).toMatchObject({ ok: false, error: 'store_guests' });
    } finally {
      process.env.LUXEL_PII_KEY = saved;
    }
    const { data: checkin } = await admin
      .from('checkins')
      .select('status, submitted_at')
      .eq('token', link.token!)
      .maybeSingle();
    expect(checkin).toMatchObject({ status: 'pending', submitted_at: null });
    expect(workerSends).toHaveLength(0);
  });

  it('every companion must carry a document, not only the lead guest', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Todos Con ID' });
    const propertyId = prop.id!;
    await setAccess({ propertyId, method: 'keyless' });
    const link = await mintCheckinLink(propertyId);
    const res = await submitCheckin({
      id: link.token,
      guests: [
        { fullName: 'Líder Con Doc', docType: 'rut', docNumber: '11.111.111-1' },
        { fullName: 'Acompañante Sin Doc' },
      ],
      arrivalTime: '15:00',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('validation');
  });

  it('rejects a submission missing the document, whatever the property requires', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Las Condes' });
    const propertyId = prop.id!;
    await setAccess({ propertyId, method: 'keyless' });

    const link = await mintCheckinLink(propertyId);
    const res = await submitCheckin({
      id: link.token,
      guests: [{ fullName: 'Sin Documento' }],
      arrivalTime: '15:00',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('validation');
  });
});
