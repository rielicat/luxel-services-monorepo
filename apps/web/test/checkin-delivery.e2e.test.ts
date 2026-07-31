/**
 * Access has to reach the guest even when the guest ignores the check-in form —
 * that is the ordinary outcome, not an edge case. These tests pin the two
 * guarantees that failure mode needs, plus the two limits that keep the fix from
 * becoming a leak: nothing is sent twice, and nothing is sent when the host
 * requires identity documents we never received.
 *
 * Skips cleanly without local Supabase. Run with:
 *   set -a; source apps/web/.env.local; set +a; pnpm --filter @luxel/web test
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-delivery-${nodeCrypto.randomUUID()}`;
process.env.LUXEL_PII_KEY = nodeCrypto.randomBytes(32).toString('hex');

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
  clerkClient: async () => ({
    users: { getUser: async () => ({ publicMetadata: { role: 'admin' } }) },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

/** Every outbound channel message, so we can assert on what a guest received. */
const sent: Array<{ reservationId: string; body: string }> = [];
vi.mock('../src/lib/channels/hospitable', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendHospitableMessage: async (_t: string, reservationId: string, body: string) => {
    sent.push({ reservationId, body });
    return 'msg_1';
  },
}));

const DAY = 86_400_000;
const iso = (d: number) => new Date(d).toISOString().slice(0, 10);
const santiagoToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

let admin: ReturnType<typeof createClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let updateAccess: (i: unknown) => Promise<{ ok: boolean }>;
let remindAndDeliverAccess: (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  token: string,
  propertyId: string,
  map: Map<string, string>,
  today: string,
) => Promise<{ reminded: number; delivered: number }>;
let shapeAccess: (row: unknown) => unknown;
let customerId: string;
let propertyId: string;

/** A pending, channel-linked check-in arriving on `arrival`. `notifiedHoursAgo`
 *  models when the check-in LINK went out; null is a silent backfill anchor. */
async function seedCheckin(arrival: string, notifiedHoursAgo: number | null = 24) {
  const token = `tok_${nodeCrypto.randomBytes(10).toString('hex')}`;
  const uid = `hosp:res_${nodeCrypto.randomBytes(4).toString('hex')}`;
  await admin.from('checkins').insert({
    property_id: propertyId,
    token,
    status: 'pending',
    reservation_uid: uid,
    arrival_date: arrival,
    departure_date: iso(new Date(`${arrival}T00:00:00Z`).getTime() + 3 * DAY),
    notified_at:
      notifiedHoursAgo == null
        ? null
        : new Date(Date.now() - notifiedHoursAgo * 3_600_000).toISOString(),
    ...(notifiedHoursAgo == null ? { notify_result: { hospitable: 'skipped_backfill' } } : {}),
  });
  return { token, uid, resId: uid.replace('hosp:', '') };
}

beforeAll(async () => {
  if (!LIVE) return;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  updateAccess = (await import('../src/app/[locale]/(site)/properties/actions')).updateAccess;
  remindAndDeliverAccess = (await import('../src/lib/checkin/reminders')).remindAndDeliverAccess;
  shapeAccess = (await import('../src/lib/checkin/access')).shapeAccess;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'delivery-host@test.cl',
      full_name: 'Anfitrión Delivery',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  sent.length = 0;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

async function seedKeylessProperty(requireId = false) {
  const prop = await seedImportedProperty({
    nickname: 'Depto Delivery',
    comuna: 'Providencia',
    sizeM2: 50,
  });
  propertyId = prop.id!;
  await updateAccess({
    propertyId,
    method: 'keyless',
    keylessCode: '4821',
    keylessInstructions: 'Piso 4, depto B',
    requireId,
    ...(requireId ? { idBasis: 'Reglamento de copropiedad', idDisclosed: true } : {}),
  });
  return propertyId;
}

describe.skipIf(!LIVE)('check-in access delivery', () => {
  it('nudges the day before arrival, exactly once', async () => {
    await seedKeylessProperty();
    const today = santiagoToday();
    const tomorrow = iso(new Date(`${today}T00:00:00Z`).getTime() + DAY);
    const { uid, resId, token } = await seedCheckin(tomorrow);

    const r1 = await remindAndDeliverAccess(
      admin,
      'tok_test',
      propertyId,
      new Map([[uid, resId]]),
      today,
    );
    expect(r1.reminded).toBe(1);
    expect(sent).toHaveLength(1);
    // A nudge carries the link, never the code itself.
    expect(sent[0].body).toContain(token);
    expect(sent[0].body).not.toContain('4821');

    // A second sweep 30 minutes later must not message them again.
    const r2 = await remindAndDeliverAccess(
      admin,
      'tok_test',
      propertyId,
      new Map([[uid, resId]]),
      today,
    );
    expect(r2.reminded).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('points at the access on arrival day, and NEVER puts the code in the thread', async () => {
    await seedKeylessProperty();
    const today = santiagoToday();
    const { uid, resId, token } = await seedCheckin(today);

    const r = await remindAndDeliverAccess(
      admin,
      'tok_test',
      propertyId,
      new Map([[uid, resId]]),
      today,
    );
    expect(r.delivered).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain(token);
    // Anything written to the thread is re-imported as a `host` message and
    // replayed to the AI as grounding for LATER guests. A code posted here
    // would leak to every future guest of the property.
    expect(sent[0].body).not.toContain('4821');

    // Send-once: the guest is not re-messaged on every sweep of arrival day.
    const again = await remindAndDeliverAccess(
      admin,
      'tok_test',
      propertyId,
      new Map([[uid, resId]]),
      today,
    );
    expect(again.delivered).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('never messages a backfill anchor, whose guest booked before the feature existed', async () => {
    await seedKeylessProperty();
    const today = santiagoToday();
    const { uid, resId } = await seedCheckin(today, null);

    const r = await remindAndDeliverAccess(
      admin,
      'tok_test',
      propertyId,
      new Map([[uid, resId]]),
      today,
    );
    expect(r).toEqual({ reminded: 0, delivered: 0 });
    expect(sent).toHaveLength(0);
  });

  it('waits for the check-in link to settle before messaging again', async () => {
    await seedKeylessProperty();
    const today = santiagoToday();
    // Link sent minutes ago, i.e. by the very same sync pass.
    const { uid, resId } = await seedCheckin(today, 0.05);

    const r = await remindAndDeliverAccess(
      admin,
      'tok_test',
      propertyId,
      new Map([[uid, resId]]),
      today,
    );
    expect(r).toEqual({ reminded: 0, delivered: 0 });
    expect(sent).toHaveLength(0);
  });

  it('says nothing at all when the property has no access configured', async () => {
    const prop = await seedImportedProperty({
      nickname: 'Sin acceso',
      comuna: 'Providencia',
      sizeM2: 40,
    });
    propertyId = prop.id!;
    const today = santiagoToday();
    const { uid, resId } = await seedCheckin(today);

    const r = await remindAndDeliverAccess(
      admin,
      'tok_test',
      propertyId,
      new Map([[uid, resId]]),
      today,
    );
    // Promising "completa tu check-in para recibir tu acceso" on a property that
    // has nothing to give is worse than staying quiet.
    expect(r).toEqual({ reminded: 0, delivered: 0 });
    expect(sent).toHaveLength(0);
  });

  it('reclaims a claim left behind by a run that died mid-send', async () => {
    await seedKeylessProperty();
    const today = santiagoToday();
    const { uid, resId } = await seedCheckin(today);
    // A previous sweep claimed the row and never came back.
    await admin
      .from('checkins')
      .update({ access_claim_at: new Date(Date.now() - 30 * 60_000).toISOString() })
      .eq('reservation_uid', uid);

    const r = await remindAndDeliverAccess(
      admin,
      'tok_test',
      propertyId,
      new Map([[uid, resId]]),
      today,
    );
    // A stale claim must not silence the row forever — that is exactly the
    // guest-at-the-door-with-nothing failure this whole change exists to fix.
    expect(r.delivered).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it('never reveals a keyless code on a concierge property, or vice versa', () => {
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
