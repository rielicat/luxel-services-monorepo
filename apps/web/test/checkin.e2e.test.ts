import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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
let updateAccess: (i: unknown) => Promise<{ ok: boolean; error?: string }>;
let mintCheckinLink: (propertyId: string) => Promise<{ ok: boolean; token?: string }>;
let submitCheckin: (i: unknown) => Promise<{ ok: boolean; error?: string }>;
let decryptPII: (s: string) => string;
let stayRangeEs: (a: string, b: string) => string;
let customerId: string;

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
  updateAccess = (await import('../src/app/[locale]/(site)/properties/actions')).updateAccess;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  const { debugCheckinLink } = await import('../src/app/[locale]/(site)/admin/debug/actions');
  mintCheckinLink = async (propertyId) => {
    const r = await debugCheckinLink({ propertyId });
    return { ok: r.ok, token: r.url?.split('/checkin/')[1] };
  };
  submitCheckin = (await import('../src/app/[locale]/checkin/[token]/actions')).submitCheckin;
  decryptPII = (await import('../src/lib/crypto/pii')).decryptPII;
  stayRangeEs = (await import('../src/lib/checkin/copy')).stayRangeEs;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'host@test.cl',
      full_name: 'Anfitrión Test',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
  workerSends.length = 0;
});

describe.skipIf(!LIVE)('guest check-in + access (end to end)', () => {
  it('runs the full host→guest flow and stores the party with encrypted IDs', async () => {
    const prop = await seedImportedProperty({
      nickname: 'Depto Providencia',
      comuna: 'Providencia',
      sizeM2: 55,
    });
    expect(prop.ok).toBe(true);
    const propertyId = prop.id!;

    const { data: access0 } = await admin
      .from('property_access')
      .select('method')
      .eq('property_id', propertyId)
      .maybeSingle();
    expect(access0!.method).toBe('physical_none');

    const up = await updateAccess({
      propertyId,
      method: 'keyless',
      keylessCode: '4821',
      keylessInstructions: 'Piso 4, depto B',
      unit: '401',
    });
    expect(up.ok).toBe(true);

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
      token,
      guests: [
        { fullName: 'María Pérez', docType: 'rut', docNumber: '12.345.678-9', nationality: 'CL' },
        { fullName: 'Pedro Pérez', docType: 'rut', docNumber: '9.876.543-2', nationality: 'AR' },
      ],
      email: 'maria@guest.cl',
      arrivalTime: '18:00',
      departureTime: '11:00',
      parking: true,
      vehiclePlate: 'abcd12',
      consent: true,
    });
    expect(res.ok).toBe(true);
    expect(JSON.stringify(res)).not.toContain('4821');

    expect(workerSends).toHaveLength(1);
    expect(workerSends[0]).toMatchObject({
      to: '56987654321',
      template: { kind: 'concierge_arrival' },
    });
    expect(workerSends[0]!.template!.params).toEqual([
      stayRangeEs(arrival, departure),
      'Depto. 401 · Providencia',
      'sí · patente ABCD12',
      '2 · María Pérez · 12.345.678-9 | Pedro Pérez · 9.876.543-2',
    ]);

    const { data: checkin } = await admin
      .from('checkins')
      .select(
        'id, status, guest_name, guest_email, party_size, arrival_time, departure_time, parking, vehicle_plate, notify_result',
      )
      .eq('token', token)
      .maybeSingle();
    expect(checkin!.guest_name).toBe('María Pérez');
    expect(checkin!.guest_email).toBe('maria@guest.cl');
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
    expect(JSON.stringify(result)).not.toContain('12.345.678');

    const { data: guests } = await admin
      .from('checkin_guests')
      .select('is_lead, full_name, nationality, doc_type, doc_last4, doc_number_enc')
      .eq('checkin_id', checkin!.id)
      .order('is_lead', { ascending: false });
    expect(guests).toHaveLength(2);
    expect(guests![0]).toMatchObject({
      is_lead: true,
      full_name: 'María Pérez',
      nationality: 'CL',
      doc_type: 'rut',
      doc_last4: '78-9',
    });
    expect(guests![0].doc_number_enc).not.toContain('12.345.678-9');
    expect(decryptPII(guests![0].doc_number_enc as string)).toBe('12.345.678-9');
    expect(guests![1]).toMatchObject({
      is_lead: false,
      full_name: 'Pedro Pérez',
      nationality: 'AR',
      doc_type: 'rut',
      doc_last4: '43-2',
    });
    expect(guests![1].doc_number_enc).not.toContain('9.876.543-2');
    expect(decryptPII(guests![1].doc_number_enc as string)).toBe('9.876.543-2');
  });

  it('rejects a party without an arrival slot, an empty party, or an unknown nationality', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Estricto' });
    const link = await mintCheckinLink(prop.id!);
    const base = { token: link.token, email: 'x@guest.cl', consent: true };
    const noSlot = await submitCheckin({ ...base, guests: [{ fullName: 'Sin Hora' }] });
    expect(noSlot).toMatchObject({ ok: false, error: 'validation' });
    const empty = await submitCheckin({ ...base, guests: [], arrivalTime: '15:00' });
    expect(empty).toMatchObject({ ok: false, error: 'validation' });
    const badNat = await submitCheckin({
      ...base,
      guests: [{ fullName: 'De Marte', nationality: 'XX' }],
      arrivalTime: '15:00',
    });
    expect(badNat).toMatchObject({ ok: false, error: 'validation' });
    const badSlot = await submitCheckin({
      ...base,
      guests: [{ fullName: 'Hora Rara' }],
      arrivalTime: '6pm',
    });
    expect(badSlot).toMatchObject({ ok: false, error: 'validation' });
    expect(workerSends).toHaveLength(0);
  });

  it('never returns the door code to the browser; Hospitable delivers it 3 days before arrival', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Lejano' });
    const propertyId = prop.id!;
    await updateAccess({ propertyId, method: 'keyless', keylessCode: '4821' });
    const link = await mintCheckinLink(propertyId);
    await admin
      .from('checkins')
      .update({ arrival_date: plusDays(10), departure_date: plusDays(13) })
      .eq('token', link.token!);
    const res = await submitCheckin({
      token: link.token,
      guests: [{ fullName: 'Llega En Diez Días' }],
      email: 'diez@guest.cl',
      arrivalTime: '22:30+',
      consent: true,
    });
    expect(res.ok).toBe(true);
    expect(res).toEqual({ ok: true });
    expect(workerSends).toHaveLength(0);
    const { data: checkin } = await admin
      .from('checkins')
      .select('party_size, arrival_time, departure_time')
      .eq('token', link.token!)
      .maybeSingle();
    expect(checkin).toMatchObject({ party_size: 1, arrival_time: '22:30+', departure_time: null });
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
      token: link.token,
      guests: [{ fullName: 'Ana Uno' }, { fullName: 'Beto Dos' }],
      email: 'ana@guest.cl',
      arrivalTime: '18:00',
      consent: true,
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
    expect(workerSends).toHaveLength(1);
  });

  it('a revoked link is refused, so a cancelled stay cannot register', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Cancelado' });
    const link = await mintCheckinLink(prop.id!);
    await admin
      .from('checkins')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', link.token!);
    const res = await submitCheckin({
      token: link.token,
      guests: [{ fullName: 'Ya No Viene' }],
      email: 'no@guest.cl',
      arrivalTime: '15:00',
      consent: true,
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
        token: link.token,
        guests: [{ fullName: 'Sin Clave', docType: 'rut', docNumber: '11.111.111-1' }],
        email: 'sin@guest.cl',
        arrivalTime: '15:00',
        consent: true,
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

  it('when the host requires ID, every companion must carry a document too', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Todos Con ID' });
    const propertyId = prop.id!;
    await updateAccess({
      propertyId,
      method: 'keyless',
      requireId: true,
      idBasis: 'Reglamento de copropiedad exige registro',
      idDisclosed: true,
    });
    const link = await mintCheckinLink(propertyId);
    const res = await submitCheckin({
      token: link.token,
      guests: [
        { fullName: 'Líder Con Doc', docType: 'rut', docNumber: '11.111.111-1' },
        { fullName: 'Acompañante Sin Doc' },
      ],
      email: 'lider@guest.cl',
      arrivalTime: '15:00',
      consent: true,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('id_required');
  });

  it('rejects a submission missing ID when the property requires it', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Las Condes' });
    const propertyId = prop.id!;
    const up = await updateAccess({
      propertyId,
      method: 'keyless',
      requireId: true,
      idBasis: 'Reglamento de copropiedad exige registro',
      idDisclosed: true,
    });
    expect(up.ok).toBe(true);
    const { data: acc } = await admin
      .from('property_access')
      .select('require_id')
      .eq('property_id', propertyId)
      .maybeSingle();
    expect(acc!.require_id).toBe(true);

    const link = await mintCheckinLink(propertyId);
    const res = await submitCheckin({
      token: link.token,
      guests: [{ fullName: 'Sin Documento' }],
      email: 'x@guest.cl',
      arrivalTime: '15:00',
      consent: true,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('id_required');
  });

  it('will NOT set require_id unless a basis AND disclosure are affirmed (AirBnB-policy guard)', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Ñuñoa' });
    const propertyId = prop.id!;
    await updateAccess({
      propertyId,
      method: 'keyless',
      requireId: true,
      idBasis: 'porque sí',
      idDisclosed: false,
    });
    const { data: acc } = await admin
      .from('property_access')
      .select('require_id')
      .eq('property_id', propertyId)
      .maybeSingle();
    expect(acc!.require_id).toBe(false);
  });
});
