/**
 * End-to-end proof of the guest check-in + access slice: drives the REAL host and
 * guest server actions against local Supabase, and confirms the compliance-critical
 * behavior — ID encrypted at rest (never plaintext), per-property require_id gating,
 * and the require_id guard that only lets ID be mandatory with a basis + disclosure.
 *
 * Skips cleanly without local Supabase so CI stays green. Run with:
 *   set -a; source apps/web/.env.local; set +a; pnpm --filter @luxel/web test
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-checkin-${nodeCrypto.randomUUID()}`;
process.env.LUXEL_PII_KEY = nodeCrypto.randomBytes(32).toString('hex');
// Exercise the notification leg via the email dev-mock (no real Resend send).
delete process.env.RESEND_API_KEY;
process.env.LUXEL_DEV_MOCK = '1';
// The conserje leg goes through the worker bridge; capture what the worker is
// asked to send instead of standing a worker up.
process.env.WHATSAPP_WORKER_SEND_URL = 'http://worker.test/send';
process.env.INTERNAL_SEND_TOKEN = 'test-internal-token';
const workerSends: Array<{ to?: string; template?: { kind: string; params: string[] } }> = [];
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
  // createCheckinLink is an ADMIN debug tool now (guests get links
  // automatically on reservation import) — the test host plays admin.
  clerkClient: async () => ({
    users: { getUser: async () => ({ publicMetadata: { role: 'admin' } }) },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let updateAccess: (i: unknown) => Promise<{ ok: boolean; error?: string }>;
let createCheckinLink: (id: string) => Promise<{ ok: boolean; token?: string }>;
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
  const host = await import('../src/app/[locale]/(site)/properties/actions');
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  updateAccess = host.updateAccess;
  createCheckinLink = host.createCheckinLink;
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
  // Keep the customer (created once); remove its properties (cascades to access/checkins/identity).
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

    // A fresh property defaults to the blocker method until configured.
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

    const link = await createCheckinLink(propertyId);
    expect(link.ok).toBe(true);
    const token = link.token!;
    // A real link carries the stay; the debug link does not. Put the arrival
    // inside the 3-day window so the code is revealed on submit.
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
      nationality: 'Chilena',
      companions: [{ fullName: 'Pedro Pérez', docType: 'rut', docNumber: '9.876.543-2' }],
      parking: true,
      vehiclePlate: 'abcd12',
      consent: true,
    });
    expect(res.ok).toBe(true);
    // Inside the window, the keyless access is revealed on submit.
    expect(res.access).toMatchObject({ method: 'keyless', keylessCode: '4821' });

    // The conserje gets the building's own message: dates, unit, parking, and
    // every guest with their document — decrypted for this one purpose.
    expect(workerSends).toHaveLength(1);
    expect(workerSends[0]).toMatchObject({
      to: '56987654321',
      template: { kind: 'concierge_arrival' },
    });
    expect(workerSends[0]!.template!.params).toEqual([
      stayRangeEs(arrival, departure),
      'Depto. 401',
      'Providencia',
      'sí · patente ABCD12',
      '2',
      'María Pérez · 12.345.678-9 | Pedro Pérez · 9.876.543-2',
    ]);

    const { data: checkin } = await admin
      .from('checkins')
      .select('id, status, guest_name, party_size, parking, vehicle_plate, notify_result')
      .eq('token', token)
      .maybeSingle();
    expect(checkin!.guest_name).toBe('María Pérez');
    expect(checkin!.parking).toBe(true);
    expect(checkin!.vehicle_plate).toBe('ABCD12');
    // dev-mock email "delivers", so the check-in reaches notified with a record
    // of the keyless-code-to-guest + confirmation-to-host notifications, plus
    // the conserje's WhatsApp — recipients only, never the content.
    expect(checkin!.status).toBe('notified');
    const result = checkin!.notify_result as Array<{ role: string; channel: string; ok: boolean }>;
    expect(result.some((r) => r.role === 'guest' && r.ok)).toBe(true);
    expect(result.some((r) => r.role === 'host' && r.ok)).toBe(true);
    expect(result.some((r) => r.role === 'concierge' && r.channel === 'whatsapp' && r.ok)).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toContain('12.345.678');

    const { data: id } = await admin
      .from('checkin_identity')
      .select('*')
      .eq('checkin_id', checkin!.id)
      .maybeSingle();
    expect(id).toBeTruthy();
    expect(id!.doc_number_enc).not.toContain('12.345.678-9'); // never stored in plaintext
    expect(decryptPII(id!.doc_number_enc as string)).toBe('12.345.678-9'); // but recoverable
    expect(id!.doc_last4).toBe('78-9');
    expect(new Date(id!.purge_after as string).getTime()).toBeGreaterThan(Date.now()); // retention set

    // EVERY incoming guest registered; companion doc also encrypted at rest.
    expect(checkin!.party_size).toBe(2);
    const { data: guests } = await admin
      .from('checkin_guests')
      .select('is_lead, full_name, doc_last4, doc_number_enc')
      .eq('checkin_id', checkin!.id)
      .order('is_lead', { ascending: false });
    expect(guests).toHaveLength(2);
    expect(guests![0]).toMatchObject({ is_lead: true, full_name: 'María Pérez' });
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
    const link = await createCheckinLink(propertyId);
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
    // No conserje on this property: nothing went to the worker.
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
    const link = await createCheckinLink(propertyId);
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

    const link = await createCheckinLink(propertyId);
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
    // requireId asked, but disclosure not confirmed → guard keeps it off.
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
