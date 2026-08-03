/**
 * The provider cutover, proven end to end: a mirror keyed on Hospitable ids is
 * re-keyed onto Beds24 ids by the real sync, reading the real Beds24 account.
 *
 * This is the test that would have caught a destructive switch. It asserts the
 * property SURVIVES rather than being deleted and recreated, because the whole
 * subtree — access codes, cleaning history, guest check-in records — hangs off
 * that row by id.
 *
 *   set -a; source apps/web/.env.local; set +a; pnpm --filter @luxel/web test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const BEDS24 = process.env.BEDS24_REFRESH_TOKEN;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY && BEDS24);

const CLERK_ID = `test-relink-${nodeCrypto.randomUUID()}`;
/** A plausible Hospitable property uuid — deliberately shares nothing with a
 *  Beds24 integer id, which is the whole point. */
const OLD_ID = nodeCrypto.randomUUID();

let admin: ReturnType<typeof createClient>;
let customerId = '';
let propertyId = '';
let realCode = '';
let realListingId = '';

beforeAll(async () => {
  if (!LIVE) return;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  // Pull a REAL reservation from the live account so the bridge is genuine.
  const { Beds24Provider } = await import('../src/lib/channels/beds24');
  const p = new Beds24Provider(BEDS24!);
  const listings = await p.listListings();
  realListingId = listings![0].ref.id;
  const res = await p.listReservations(listings![0].ref, '2026-01-01', '2027-06-01');
  realCode = res!.find((r) => r.confirmationCode)!.confirmationCode!;

  const { data: c } = await admin
    .from('customers')
    .insert({ clerk_user_id: CLERK_ID, email: `relink-${CLERK_ID}@test.cl` })
    .select('id')
    .single();
  customerId = c!.id as string;

  // A mirror as it exists TODAY: keyed on the old provider's id.
  const { data: prop } = await admin
    .from('properties')
    .insert({
      owner_id: customerId,
      nickname: 'Depto Pre-Cutover',
      external_listing_id: OLD_ID,
      platform: 'airbnb',
    })
    .select('id')
    .single();
  propertyId = prop!.id as string;

  await admin
    .from('listing_assignments')
    .insert({ external_listing_id: OLD_ID, customer_id: customerId, assigned_by: 'test' });

  // A guest holding a link, with the confirmation code that bridges providers.
  await admin.from('checkins').insert({
    property_id: propertyId,
    token: 'relink-tok-keepme',
    status: 'pending',
    reservation_uid: `hosp:${nodeCrypto.randomUUID()}`,
    confirmation_code: realCode,
    arrival_date: '2026-12-22',
    departure_date: '2026-12-26',
    notified_at: new Date('2026-08-01').toISOString(),
  });
});

afterAll(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('listing_assignments').delete().eq('customer_id', customerId);
  await admin.from('properties').delete().eq('owner_id', customerId);
  await admin.from('customers').delete().eq('id', customerId);
});

describe.skipIf(!LIVE)('beds24 cutover', () => {
  it('re-keys the mirror instead of deleting it', async () => {
    const { syncBeds24Account } = await import('../src/lib/channels/beds24-sync');
    const r = await syncBeds24Account(customerId, BEDS24!);

    expect(r.ok).toBe(true);
    expect(r.relinked).toBe(1);
    expect(r.unmatched).toEqual([]);

    // THE assertion: same row id. A delete-and-recreate would change it, and
    // every child row would have cascaded away first.
    const { data: prop } = await admin
      .from('properties')
      .select('id, external_listing_id')
      .eq('owner_id', customerId)
      .maybeSingle();
    expect(prop).not.toBeNull();
    expect(prop!.id).toBe(propertyId);
    expect(prop!.external_listing_id).toBe(realListingId);

    // The tenant boundary moved with it, or the customer loses their own listing.
    const { data: asg } = await admin
      .from('listing_assignments')
      .select('external_listing_id')
      .eq('customer_id', customerId);
    expect(asg!.map((a) => a.external_listing_id)).toEqual([realListingId]);
  });

  it("keeps the guest's link working, and does not re-message them", async () => {
    const { data: ci } = await admin
      .from('checkins')
      .select('token, reservation_uid, notified_at, confirmation_code')
      .eq('property_id', propertyId)
      .eq('token', 'relink-tok-keepme')
      .maybeSingle();

    expect(ci).not.toBeNull();
    // Same token: a guest holding the link is unaffected by the migration.
    expect(ci!.token).toBe('relink-tok-keepme');
    // Moved into the new namespace so the new provider's revoke/prune sees it.
    expect(String(ci!.reservation_uid)).toMatch(/^b24:/);
    // Watermark preserved: the reminder pass must not treat this as un-messaged.
    expect(ci!.notified_at).not.toBeNull();
    expect(ci!.confirmation_code).toBe(realCode);
  });

  it('is idempotent — a second sync changes nothing', async () => {
    const { syncBeds24Account } = await import('../src/lib/channels/beds24-sync');
    const again = await syncBeds24Account(customerId, BEDS24!);
    expect(again.ok).toBe(true);
    expect(again.relinked).toBe(0);

    const { count } = await admin
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', customerId);
    expect(count).toBe(1);
  });
});
