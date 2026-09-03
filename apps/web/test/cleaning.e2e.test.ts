import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type * as CrewModule from '@luxel/core/crew';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-clean-${nodeCrypto.randomUUID()}`;
process.env.WHATSAPP_WORKER_SEND_URL = 'http://worker.test/send';
process.env.INTERNAL_SEND_TOKEN = 'test-internal-token';
const plusDays = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
    new Date(Date.now() + n * 86_400_000),
  );
const CHECKOUT = plusDays(5);
const FAR_CHECKOUT = plusDays(120);
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const dateText = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
  return `${weekday} ${String(d).padStart(2, '0')} de ${MONTHS[m! - 1]}, 11:00`;
};

const EMAILS = vi.hoisted(() => [] as Array<{ to: string | string[]; subject: string }>);
const WA_SENDS: Array<{
  to?: string;
  text?: string;
  template?: { kind: string; params: string[]; buttons?: string[] };
}> = [];

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));
vi.mock('@luxel/core/email/send', () => ({
  emailConfigured: () => true,
  sendEmail: async (opts: { to: string | string[]; subject: string }) => {
    EMAILS.push(opts);
    return { id: `em_${EMAILS.length}` };
  },
}));

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let suggestCleaningsFromCheckouts: (id: string) => Promise<{ suggested: number; skipped: number }>;
let autoConfirmSuggested: (id: string, today: string) => Promise<number>;
let santiagoToday: () => string;
let crew: typeof CrewModule;
let customerId: string;
const crewIds: string[] = [];

beforeAll(async () => {
  if (!LIVE) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === process.env.WHATSAPP_WORKER_SEND_URL) {
      WA_SENDS.push(JSON.parse((init?.body as string) ?? '{}'));
      return Response.json({ wamid: 'wamid.test' });
    }
    return realFetch(input, init);
  });
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  suggestCleaningsFromCheckouts = (await import('@luxel/core/cleaning/schedule'))
    .suggestCleaningsFromCheckouts;
  autoConfirmSuggested = (await import('@luxel/core/cleaning/notify')).autoConfirmSuggested;
  santiagoToday = (await import('@luxel/core/checkin/window')).santiagoToday;
  crew = await import('@luxel/core/crew');
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'clean@test.cl',
      full_name: 'Clean Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
  WA_SENDS.length = 0;
  EMAILS.length = 0;
});

afterAll(async () => {
  if (!LIVE || !crewIds.length) return;
  await admin.from('crew_member').delete().in('id', crewIds);
});

describe.skipIf(!LIVE)('Luxel-run cleaning coordination (end to end)', () => {
  it('schedules a cleaning per check-out, asks the mirrored crew and tells the operator, once', async () => {
    const prop = await seedImportedProperty({
      nickname: 'Depto Las Condes',
      address: 'Av. Apoquindo 1234',
      comuna: 'Las Condes',
    });
    const propertyId = prop.id!;
    await admin.from('properties').update({ checkout_time: '11:00' }).eq('id', propertyId);
    await admin.from('property_access').update({ unit: '1203' }).eq('property_id', propertyId);
    await admin.from('property_contacts').insert([
      {
        property_id: propertyId,
        role: 'cleaning',
        external_id: 'tm-phone',
        name: 'Rosa',
        whatsapp: '+56 9 5555 1234',
        email: 'rosa@aseo.cl',
      },
      {
        property_id: propertyId,
        role: 'cleaning',
        external_id: 'tm-email',
        name: 'Pedro',
        whatsapp: null,
        email: 'pedro@aseo.cl',
      },
      {
        property_id: propertyId,
        role: 'concierge',
        external_id: 'tm-concierge',
        name: 'Juan',
        whatsapp: '+56 9 7777 0000',
        email: null,
      },
    ]);
    await admin.from('calendar_blocks').insert({
      property_id: propertyId,
      starts_on: '2027-02-07',
      ends_on: CHECKOUT,
      source: 'import',
      external_uid: 'feed:evt-x',
      summary: 'Reserved',
    });

    expect((await suggestCleaningsFromCheckouts(propertyId)).suggested).toBe(1);
    const { data: suggested } = await admin
      .from('cleanings')
      .select('cleaning_date, status, source')
      .eq('property_id', propertyId);
    expect(suggested).toEqual([
      { cleaning_date: CHECKOUT, status: 'suggested', source: 'checkout' },
    ]);

    expect(await autoConfirmSuggested(propertyId, santiagoToday())).toBe(1);
    const { data: scheduled } = await admin
      .from('cleanings')
      .select('status, confirm_token')
      .eq('property_id', propertyId)
      .single();
    expect(scheduled!.status).toBe('scheduled');
    const token = scheduled!.confirm_token as string;

    const templates = WA_SENDS.filter((s) => s.template);
    expect(templates).toEqual([
      {
        to: '56955551234',
        template: {
          kind: 'cleaning_confirm',
          params: [dateText(CHECKOUT), 'Depto Las Condes · Depto. 1203'],
          buttons: [`clean:${token}:yes`, `clean:${token}:no`],
        },
      },
    ]);
    const fyi = WA_SENDS.filter((s) => s.text);
    expect(fyi).toHaveLength(1);
    expect(fyi[0]!.to).toBeUndefined();
    expect(fyi[0]!.text).toContain('Aseo agendado — Depto Las Condes');
    expect(fyi[0]!.text).toContain(`/cleaning/confirm/${token}`);
    expect(EMAILS).toHaveLength(1);
    expect(EMAILS[0]!.to).toBe('pedro@aseo.cl');
    expect(EMAILS[0]!.subject).toContain('Depto Las Condes');

    WA_SENDS.length = 0;
    EMAILS.length = 0;
    expect((await suggestCleaningsFromCheckouts(propertyId)).suggested).toBe(0);
    expect(await autoConfirmSuggested(propertyId, santiagoToday())).toBe(0);
    const { data: after } = await admin
      .from('cleanings')
      .select('status')
      .eq('property_id', propertyId);
    expect(after).toEqual([{ status: 'scheduled' }]);
    expect(WA_SENDS).toHaveLength(0);
    expect(EMAILS).toHaveLength(0);
  });

  it('texts the operator-assigned crew and leaves the mirrored teammate alone', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Cuadrilla' });
    const propertyId = prop.id!;
    await admin.from('properties').update({ checkout_time: '11:00' }).eq('id', propertyId);
    await admin.from('property_contacts').insert({
      property_id: propertyId,
      role: 'cleaning',
      external_id: 'tm-espejo',
      name: 'Espejo',
      whatsapp: '+56 9 1111 1111',
      email: 'espejo@aseo.cl',
    });
    const member = await crew.createCrewMember({
      kind: 'internal',
      name: 'Cuadrilla Luxel',
      whatsapp: '+56 9 2222 3333',
    });
    expect(member).toBeTruthy();
    crewIds.push(member!.id);
    expect(await crew.assignCrew({ memberId: member!.id, propertyId, role: 'cleaning' })).toBe(
      true,
    );
    await admin.from('calendar_blocks').insert({
      property_id: propertyId,
      starts_on: '2027-02-07',
      ends_on: CHECKOUT,
      source: 'import',
      external_uid: 'feed:crew',
      summary: 'Reserved',
    });

    expect((await suggestCleaningsFromCheckouts(propertyId)).suggested).toBe(1);
    expect(await autoConfirmSuggested(propertyId, santiagoToday())).toBe(1);

    const templates = WA_SENDS.filter((s) => s.template);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.to).toBe('56922223333');
    expect(templates[0]!.template!.kind).toBe('cleaning_confirm');
    expect(EMAILS).toHaveLength(0);
    expect(WA_SENDS.filter((s) => s.text)).toHaveLength(1);
  });

  it('leaves a far check-out suggested until it is close, and cancels it when the stay is gone', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Horizonte' });
    const propertyId = prop.id!;
    await admin.from('property_contacts').insert({
      property_id: propertyId,
      role: 'cleaning',
      external_id: 'tm-far',
      name: 'Rosa',
      whatsapp: '+56 9 5555 1234',
    });
    await admin.from('calendar_blocks').insert([
      {
        property_id: propertyId,
        starts_on: plusDays(118),
        ends_on: FAR_CHECKOUT,
        source: 'import',
        external_uid: 'feed:far',
        summary: 'Reserved',
      },
      {
        property_id: propertyId,
        starts_on: plusDays(3),
        ends_on: CHECKOUT,
        source: 'import',
        external_uid: 'feed:soon',
        summary: 'Reserved',
      },
    ]);

    expect((await suggestCleaningsFromCheckouts(propertyId)).suggested).toBe(2);
    expect(await autoConfirmSuggested(propertyId, santiagoToday())).toBe(1);
    const rows = async () =>
      (
        await admin
          .from('cleanings')
          .select('cleaning_date, status')
          .eq('property_id', propertyId)
          .order('cleaning_date')
      ).data!;
    expect(await rows()).toEqual([
      { cleaning_date: CHECKOUT, status: 'scheduled' },
      { cleaning_date: FAR_CHECKOUT, status: 'suggested' },
    ]);
    expect(WA_SENDS.filter((s) => s.template)).toHaveLength(1);

    WA_SENDS.length = 0;
    await admin.from('calendar_blocks').delete().eq('external_uid', 'feed:soon');
    expect((await suggestCleaningsFromCheckouts(propertyId)).skipped).toBe(1);
    expect(await rows()).toEqual([
      { cleaning_date: CHECKOUT, status: 'skipped' },
      { cleaning_date: FAR_CHECKOUT, status: 'suggested' },
    ]);
    const fyi = WA_SENDS.filter((s) => s.text);
    expect(fyi).toHaveLength(1);
    expect(fyi[0]!.text).toContain('Aseo cancelado — Depto Horizonte');
    expect(await autoConfirmSuggested(propertyId, santiagoToday())).toBe(0);
  });

  it('lets the crew confirm attendance via the tokenized link — once', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Ñuñoa' });
    const { data: cleaning } = await admin
      .from('cleanings')
      .insert({ property_id: prop.id!, cleaning_date: CHECKOUT, status: 'scheduled' })
      .select('id, confirm_token')
      .single();
    const token = cleaning!.confirm_token as string;

    const { confirmCleaningAttendance } =
      await import('../src/app/[locale]/cleaning/confirm/[token]/actions');

    expect((await confirmCleaningAttendance(nodeCrypto.randomUUID())).ok).toBe(false);
    expect((await confirmCleaningAttendance('not-a-uuid')).ok).toBe(false);
    expect((await confirmCleaningAttendance(token)).ok).toBe(true);
    expect((await confirmCleaningAttendance(token)).ok).toBe(false);

    const { data: after } = await admin
      .from('cleanings')
      .select('crew_confirmed_at')
      .eq('id', cleaning!.id as string)
      .single();
    expect(after!.crew_confirmed_at).toBeTruthy();
  });
});
