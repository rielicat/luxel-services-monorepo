import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type {
  CheckinDraft,
  CheckinDraftInput,
  CheckinDraftWrite,
} from '@luxel/core/checkin/draft-shape';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-draft-${nodeCrypto.randomUUID()}`;
process.env.LUXEL_PII_KEY = nodeCrypto.randomBytes(32).toString('hex');
delete process.env.RESEND_API_KEY;
process.env.LUXEL_DEV_MOCK = '1';
process.env.WHATSAPP_WORKER_SEND_URL = 'http://worker.test/send';
process.env.INTERNAL_SEND_TOKEN = 'test-internal-token';

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
  clerkClient: async () => ({
    users: { getUser: async () => ({ publicMetadata: { role: 'admin' } }) },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

type DraftAction = (input: unknown) => Promise<CheckinDraftWrite>;
type SubmitAction = (input: unknown) => Promise<{ ok: boolean; error?: string }>;

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let checkinToken: () => string;
let saveCheckinDraft: DraftAction;
let submitCheckin: SubmitAction;
let readCheckinDraft: (c: unknown, id: string) => Promise<CheckinDraft | null>;
let writeCheckinDraft: (c: unknown, id: string, i: CheckinDraftInput) => Promise<CheckinDraftWrite>;
let purgeExpiredGuestDocuments: (c: unknown, today: string) => Promise<void>;
let decryptPII: (s: string) => string;
let santiagoToday: () => string;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === 'http://worker.test/send') return Response.json({ wamid: 'wamid.test' });
    return realFetch(input, init);
  });

  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  checkinToken = (await import('@luxel/core/checkin/tokens')).checkinToken;
  const actions = await import('../src/app/[locale]/checkin/[id]/actions');
  saveCheckinDraft = actions.saveCheckinDraft as DraftAction;
  submitCheckin = actions.submitCheckin as SubmitAction;
  const draft = await import('@luxel/core/checkin/draft');
  readCheckinDraft = draft.readCheckinDraft as typeof readCheckinDraft;
  writeCheckinDraft = draft.writeCheckinDraft as typeof writeCheckinDraft;
  purgeExpiredGuestDocuments = (await import('@luxel/core/channels/hospitable-sync'))
    .purgeExpiredGuestDocuments as typeof purgeExpiredGuestDocuments;
  decryptPII = (await import('@luxel/core/crypto/pii')).decryptPII;
  santiagoToday = (await import('@luxel/core/checkin/window')).santiagoToday;

  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'draft-host@test.cl',
      full_name: 'Anfitrión Borrador',
      phone: '+56 9 7000 2000',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

const mint = async (
  nickname: string,
  departure = plusDays(5),
  expectedGuests: number | null = null,
): Promise<string> => {
  const prop = await seedImportedProperty({ nickname });
  const token = checkinToken();
  await admin.from('checkins').insert({
    property_id: prop.id!,
    token,
    status: 'pending',
    arrival_date: plusDays(2),
    departure_date: departure,
    expected_guests: expectedGuests,
  });
  return token;
};

const checkinIdFor = async (token: string): Promise<string> => {
  const { data } = await admin.from('checkins').select('id').eq('token', token).maybeSingle();
  return data!.id as string;
};

const payloadFor = async (checkinId: string): Promise<Record<string, unknown> | null> => {
  const { data } = await admin
    .from('checkin_draft')
    .select('payload')
    .eq('checkin_id', checkinId)
    .maybeSingle();
  return (data?.payload as Record<string, unknown> | null) ?? null;
};

const guestsOf = async (checkinId: string): Promise<Array<Record<string, string>>> => {
  const stored = await payloadFor(checkinId);
  return (stored?.guests ?? []) as Array<Record<string, string>>;
};

const partial = (token: string, over: Record<string, unknown> = {}) => ({
  id: token,
  rev: 0,
  partySize: 2,
  guests: [
    { uid: 'g1', fullName: 'María Pérez', docType: 'rut', docNumber: '12.345.678-9' },
    { uid: 'g2', fullName: '', docType: 'rut', docNumber: '' },
  ],
  arrivalTime: '18:00',
  departureTime: '11:00',
  parking: 'yes',
  vehiclePlate: 'ABCD12',
  ...over,
});

const lone = (name: string, docNumber: string) => ({
  fullName: name,
  docType: 'rut' as const,
  docNumber,
});

describe.skipIf(!LIVE)('check-in draft (end to end)', () => {
  it('round-trips the progress and hands the document back whole, stored encrypted', async () => {
    const token = await mint('Depto Borrador');
    expect(await saveCheckinDraft(partial(token))).toEqual({ ok: true, rev: 1 });

    const checkinId = await checkinIdFor(token);
    const stored = await payloadFor(checkinId);
    expect(JSON.stringify(stored)).not.toContain('12.345.678-9');
    const guest0 = (await guestsOf(checkinId))[0]!;
    expect(decryptPII(guest0.docEnc!)).toBe('12.345.678-9');
    expect(guest0.docLast4).toBe('78-9');

    const back = await readCheckinDraft(admin, checkinId);
    expect(back).toEqual({
      rev: 1,
      partySize: 2,
      guests: [
        { uid: 'g1', fullName: 'María Pérez', docType: 'rut', docNumber: '12.345.678-9' },
        { uid: 'g2', fullName: '', docType: 'rut', docNumber: '' },
      ],
      arrivalTime: '18:00',
      departureTime: '11:00',
      parking: 'yes',
      vehiclePlate: 'ABCD12',
    });
  });

  it('keeps the stored number whenever the browser sends a mask back, never nulls it', async () => {
    const token = await mint('Depto Reanudado');
    await saveCheckinDraft(partial(token));
    const checkinId = await checkinIdFor(token);

    expect(
      await saveCheckinDraft(
        partial(token, {
          rev: 1,
          guests: [
            { uid: 'g1', fullName: 'María Pérez', docType: 'rut', docNumber: '···78-9' },
            { uid: 'g2', fullName: 'Pedro Pérez', docType: 'rut', docNumber: '9.876.543-2' },
          ],
        }),
      ),
    ).toEqual({ ok: true, rev: 2 });

    const kept = await guestsOf(checkinId);
    expect(decryptPII(kept[0]!.docEnc!)).toBe('12.345.678-9');
    expect(decryptPII(kept[1]!.docEnc!)).toBe('9.876.543-2');

    await saveCheckinDraft(
      partial(token, {
        rev: 2,
        guests: [
          { uid: 'g1', fullName: 'María Pérez', docType: 'rut', docNumber: '···0000' },
          { uid: 'g2', fullName: 'Pedro Pérez', docType: 'rut', docNumber: '' },
        ],
      }),
    );
    const after = await readCheckinDraft(admin, checkinId);
    expect(after!.guests.map((g) => g.docNumber)).toEqual(['12.345.678-9', '']);
  });

  it('follows the guest row by its uid when a row is removed', async () => {
    const token = await mint('Depto Sin Uno');
    const checkinId = await checkinIdFor(token);
    await saveCheckinDraft(
      partial(token, {
        guests: [
          { uid: 'g1', fullName: 'María Pérez', docType: 'rut', docNumber: '12.345.678-9' },
          { uid: 'g2', fullName: 'Pedro Pérez', docType: 'rut', docNumber: '9.876.543-2' },
        ],
      }),
    );

    await saveCheckinDraft(
      partial(token, {
        rev: 1,
        partySize: 1,
        guests: [{ uid: 'g2', fullName: 'Pedro Pérez', docType: 'rut', docNumber: '···43-2' }],
      }),
    );

    const left = await guestsOf(checkinId);
    expect(left).toHaveLength(1);
    expect(decryptPII(left[0]!.docEnc!)).toBe('9.876.543-2');
  });

  it('refuses a write that states an older revision, and keeps the newer one', async () => {
    const token = await mint('Depto Dos Pestañas');
    const checkinId = await checkinIdFor(token);
    expect(await saveCheckinDraft(partial(token, { rev: 0 }))).toEqual({ ok: true, rev: 1 });
    expect(
      await saveCheckinDraft(
        partial(token, {
          rev: 1,
          guests: [
            { uid: 'g1', fullName: 'María Pérez', docType: 'rut', docNumber: '···78-9' },
            { uid: 'g2', fullName: 'Pedro Pérez', docType: 'rut', docNumber: '9.876.543-2' },
          ],
        }),
      ),
    ).toEqual({ ok: true, rev: 2 });

    expect(
      await saveCheckinDraft(
        partial(token, {
          rev: 1,
          partySize: 1,
          guests: [{ uid: 'g1', fullName: 'María', docType: 'rut', docNumber: '···78-9' }],
          vehiclePlate: 'ZZZZ99',
        }),
      ),
    ).toEqual({ ok: false, reason: 'stale', rev: 2 });

    const back = await readCheckinDraft(admin, checkinId);
    expect(back!.rev).toBe(2);
    expect(back!.partySize).toBe(2);
    expect(back!.vehiclePlate).toBe('ABCD12');
    expect(back!.guests.map((g) => g.fullName)).toEqual(['María Pérez', 'Pedro Pérez']);
    const kept = await guestsOf(checkinId);
    expect(decryptPII(kept[1]!.docEnc!)).toBe('9.876.543-2');
  });

  it('deletes the draft when the check-in is submitted', async () => {
    const token = await mint('Depto Enviado');
    await saveCheckinDraft(
      partial(token, {
        partySize: 1,
        guests: [{ uid: 'g1', fullName: 'María Pérez', docType: 'rut', docNumber: '12.345.678-9' }],
      }),
    );
    const checkinId = await checkinIdFor(token);
    expect(await payloadFor(checkinId)).not.toBeNull();

    const res = await submitCheckin({
      id: token,
      guests: [lone('María Pérez', '12.345.678-9')],
      arrivalTime: '18:00',
    });
    expect(res).toEqual({ ok: true });
    expect(await payloadFor(checkinId)).toBeNull();
    expect(await readCheckinDraft(admin, checkinId)).toBeNull();

    expect(await saveCheckinDraft(partial(token))).toEqual({ ok: false, reason: 'refused' });
    expect(await payloadFor(checkinId)).toBeNull();
  });

  it('never lets one token reach another stay’s draft', async () => {
    const mine = await mint('Depto Mío');
    const theirs = await mint('Depto Ajeno');
    await saveCheckinDraft(partial(mine));
    await saveCheckinDraft(
      partial(theirs, {
        partySize: 1,
        guests: [
          { uid: 'g1', fullName: 'Otro Huésped', docType: 'passport', docNumber: 'X9999999' },
        ],
        vehiclePlate: 'ZZZZ99',
      }),
    );

    const mineId = await checkinIdFor(mine);
    const theirsId = await checkinIdFor(theirs);
    const a = await readCheckinDraft(admin, mineId);
    const b = await readCheckinDraft(admin, theirsId);
    expect(a!.guests.map((g) => g.fullName)).toEqual(['María Pérez', '']);
    expect(b!.guests.map((g) => g.fullName)).toEqual(['Otro Huésped']);
    expect(a!.vehiclePlate).toBe('ABCD12');
    expect(b!.vehiclePlate).toBe('ZZZZ99');

    const { data: rows } = await admin
      .from('checkin_draft')
      .select('checkin_id')
      .in('checkin_id', [mineId, theirsId]);
    expect((rows ?? []).map((r) => r.checkin_id).sort()).toEqual([mineId, theirsId].sort());

    expect(await saveCheckinDraft(partial('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'))).toEqual({
      ok: false,
      reason: 'refused',
    });
  });

  it('clears the drafts of departed stays on the same pass that nulls the documents', async () => {
    const gone = await mint('Depto Ido');
    const here = await mint('Depto Vigente');
    await saveCheckinDraft(partial(gone));
    await saveCheckinDraft(partial(here));
    const goneId = await checkinIdFor(gone);
    const hereId = await checkinIdFor(here);

    await admin
      .from('checkins')
      .update({ arrival_date: plusDays(-120), departure_date: plusDays(-100) })
      .eq('id', goneId);

    await purgeExpiredGuestDocuments(admin, santiagoToday());

    expect(await payloadFor(goneId)).toBeNull();
    expect(await payloadFor(hereId)).not.toBeNull();
  });

  it('gives the document back complete, and never stores it in the clear', async () => {
    const token = await mint('Depto Enmascarado');
    const checkinId = await checkinIdFor(token);
    expect(
      await writeCheckinDraft(admin, checkinId, {
        rev: 0,
        partySize: 1,
        guests: [{ uid: 'g1', fullName: 'María Pérez', docType: 'rut', docNumber: '12.345.678-9' }],
        arrivalTime: '18:00',
        departureTime: '11:00',
        parking: 'no',
        vehiclePlate: '',
      }),
    ).toEqual({ ok: true, rev: 1 });

    const resumed = await readCheckinDraft(admin, checkinId);
    expect(resumed!.guests[0]!.docNumber).toBe('12.345.678-9');

    const stored = await payloadFor(checkinId);
    expect(JSON.stringify(stored)).not.toContain('12.345.678-9');

    for (const docNumber of ['···78-9', '•••78-9', '…78-9']) {
      expect(
        await submitCheckin({
          id: token,
          guests: [lone('María Pérez', docNumber)],
          arrivalTime: '18:00',
        }),
      ).toEqual({ ok: false, error: 'validation' });
    }

    const { data: after } = await admin
      .from('checkins')
      .select('status')
      .eq('id', checkinId)
      .maybeSingle();
    expect(after!.status).toBe('pending');
    expect(await payloadFor(checkinId)).not.toBeNull();

    expect(
      await submitCheckin({
        id: token,
        guests: [lone('María Pérez', resumed!.guests[0]!.docNumber)],
        arrivalTime: '18:00',
      }),
    ).toEqual({ ok: true });
  });

  it('refuses a party that does not match the reservation, and takes the one that does', async () => {
    const token = await mint('Depto De Tres', plusDays(5), 3);
    const three = [
      lone('Uno Pérez', '11.111.111-1'),
      lone('Dos Pérez', '22.222.222-2'),
      lone('Tres Pérez', '33.333.333-3'),
    ];

    expect(
      await submitCheckin({ id: token, guests: three.slice(0, 2), arrivalTime: '18:00' }),
    ).toEqual({ ok: false, error: 'party_size', expected: 3 });
    expect(
      await submitCheckin({
        id: token,
        guests: [...three, lone('Cuatro Pérez', '44.444.444-4')],
        arrivalTime: '18:00',
      }),
    ).toEqual({ ok: false, error: 'party_size', expected: 3 });

    const { data: still } = await admin
      .from('checkins')
      .select('status')
      .eq('token', token)
      .maybeSingle();
    expect(still!.status).toBe('pending');

    expect(await submitCheckin({ id: token, guests: three, arrivalTime: '18:00' })).toEqual({
      ok: true,
    });
  });

  it('holds a direct booking to the party the guest chose, which the draft remembers', async () => {
    const token = await mint('Depto Directo');
    await saveCheckinDraft(
      partial(token, {
        partySize: 2,
        guests: [
          { uid: 'g1', fullName: 'Uno Directo', docType: 'rut', docNumber: '11.111.111-1' },
          { uid: 'g2', fullName: 'Dos Directo', docType: 'rut', docNumber: '22.222.222-2' },
        ],
      }),
    );

    expect(
      await submitCheckin({
        id: token,
        guests: [lone('Uno Directo', '11.111.111-1')],
        arrivalTime: '18:00',
      }),
    ).toEqual({ ok: false, error: 'party_size', expected: 2 });

    expect(
      await submitCheckin({
        id: token,
        guests: [lone('Uno Directo', '11.111.111-1'), lone('Dos Directo', '22.222.222-2')],
        arrivalTime: '18:00',
      }),
    ).toEqual({ ok: true });
  });
});
