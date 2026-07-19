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

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let admin: ReturnType<typeof createClient>;
let createProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let updateAccess: (i: unknown) => Promise<{ ok: boolean; error?: string }>;
let createCheckinLink: (id: string) => Promise<{ ok: boolean; token?: string }>;
let submitCheckin: (i: unknown) => Promise<{ ok: boolean; error?: string }>;
let decryptPII: (s: string) => string;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  const host = await import('../src/app/[locale]/(site)/properties/actions');
  createProperty = host.createProperty;
  updateAccess = host.updateAccess;
  createCheckinLink = host.createCheckinLink;
  submitCheckin = (await import('../src/app/[locale]/checkin/[token]/actions')).submitCheckin;
  decryptPII = (await import('../src/lib/crypto/pii')).decryptPII;
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
});

describe.skipIf(!LIVE)('guest check-in + access (end to end)', () => {
  it('runs the full host→guest flow and stores the ID encrypted', async () => {
    const prop = await createProperty({
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
    });
    expect(up.ok).toBe(true);

    const link = await createCheckinLink(propertyId);
    expect(link.ok).toBe(true);
    const token = link.token!;

    const res = await submitCheckin({
      token,
      guestName: 'María Pérez',
      guestEmail: 'maria@guest.cl',
      partySize: 2,
      arrivalAt: new Date('2026-08-01T18:00:00Z').toISOString(),
      docType: 'rut',
      docNumber: '12.345.678-9',
      nationality: 'Chilena',
      consent: true,
    });
    expect(res.ok).toBe(true);

    const { data: checkin } = await admin
      .from('checkins')
      .select('id, status, guest_name, party_size, notify_result')
      .eq('token', token)
      .maybeSingle();
    expect(checkin!.guest_name).toBe('María Pérez');
    // dev-mock email "delivers", so the check-in reaches notified with a record
    // of the keyless-code-to-guest + confirmation-to-host notifications.
    expect(checkin!.status).toBe('notified');
    const result = checkin!.notify_result as Array<{ role: string; ok: boolean }>;
    expect(result.some((r) => r.role === 'guest' && r.ok)).toBe(true);
    expect(result.some((r) => r.role === 'host' && r.ok)).toBe(true);

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
  });

  it('rejects a submission missing ID when the property requires it', async () => {
    const prop = await createProperty({ nickname: 'Depto Las Condes' });
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
    const prop = await createProperty({ nickname: 'Depto Ñuñoa' });
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
