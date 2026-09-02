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
  it('runs the full host→guest flow and stores the ID encrypted', async () => {
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
      .update({ arrival_date: arrival, departure_date: departure })
      .eq('token', token);
    await admin.from('property_contacts').insert({
      property_id: propertyId,
      role: 'concierge',
      name: 'Conserjería',
      whatsapp: '+56 9 8765 4321',
    });

    const res = await submitCheckin({
      token,
      guestName: 'María Pérez',
      guestEmail: 'maria@guest.cl',
      arrivalAt: new Date('2026-08-01T18:00:00Z').toISOString(),
      docType: 'rut',
      docNumber: '12.345.678-9',
      companions: [{ fullName: 'Pedro Pérez', docType: 'rut', docNumber: '9.876.543-2' }],
      parking: true,
      vehiclePlate: 'abcd12',
      consent: true,
    });
    expect(res.ok).toBe(true);
    expect(res.access).toMatchObject({ method: 'keyless', keylessCode: '4821' });

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
      .select('id, status, guest_name, party_size, parking, vehicle_plate, notify_result')
      .eq('token', token)
      .maybeSingle();
    expect(checkin!.guest_name).toBe('María Pérez');
    expect(checkin!.parking).toBe(true);
    expect(checkin!.vehicle_plate).toBe('ABCD12');
    expect(checkin!.status).toBe('notified');
    const result = checkin!.notify_result as Array<{ role: string; channel: string; ok: boolean }>;
    expect(result.some((r) => r.role === 'guest' && r.ok)).toBe(true);
    expect(result.some((r) => r.role === 'host' && r.ok)).toBe(true);
    expect(result.some((r) => r.role === 'concierge' && r.channel === 'whatsapp' && r.ok)).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toContain('12.345.678');

    expect(checkin!.party_size).toBe(2);
    const { data: guests } = await admin
      .from('checkin_guests')
      .select('is_lead, full_name, doc_last4, doc_number_enc')
      .eq('checkin_id', checkin!.id)
      .order('is_lead', { ascending: false });
    expect(guests).toHaveLength(2);
    expect(guests![0]).toMatchObject({
      is_lead: true,
      full_name: 'María Pérez',
      doc_last4: '78-9',
    });
    expect(guests![0].doc_number_enc).not.toContain('12.345.678-9');
    expect(decryptPII(guests![0].doc_number_enc as string)).toBe('12.345.678-9');
    expect(guests![1]).toMatchObject({
      is_lead: false,
      full_name: 'Pedro Pérez',
      doc_last4: '43-2',
    });
    expect(guests![1].doc_number_enc).not.toContain('9.876.543-2');
    expect(decryptPII(guests![1].doc_number_enc as string)).toBe('9.876.543-2');
  });

  it('keeps the access hidden until 3 days before arrival — the day Hospitable sends the details', async () => {
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
      guestName: 'Llega En Diez Días',
      guestEmail: 'diez@guest.cl',
      consent: true,
    });
    expect(res.ok).toBe(true);
    expect(res.access).toBeUndefined();
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
      guestName: 'Líder Con Doc',
      guestEmail: 'lider@guest.cl',
      docType: 'rut',
      docNumber: '11.111.111-1',
      companions: [{ fullName: 'Acompañante Sin Doc' }],
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
      guestName: 'Sin Documento',
      guestEmail: 'x@guest.cl',
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

describe('shapeAccess', () => {
  it('never reveals a keyless code on a concierge property, or vice versa', async () => {
    const { shapeAccess } = await import('../src/lib/checkin/access');
    const concierge = shapeAccess({
      method: 'physical_concierge',
      keyless_code: '9999',
      keyless_instructions: 'no debe salir',
      concierge_name: 'Conserjería',
      concierge_hours: '24/7',
    }) as Record<string, unknown>;
    expect(concierge.keylessCode).toBeNull();
    expect(concierge.keylessInstructions).toBeNull();
    expect(concierge.conciergeName).toBe('Conserjería');

    const keyless = shapeAccess({
      method: 'keyless',
      keyless_code: '4821',
      concierge_name: 'Conserjería',
      concierge_hours: '24/7',
    }) as Record<string, unknown>;
    expect(keyless.conciergeName).toBeNull();
    expect(keyless.conciergeHours).toBeNull();
    expect(keyless.keylessCode).toBe('4821');
  });
});
