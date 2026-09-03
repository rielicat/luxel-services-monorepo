import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-plan-${nodeCrypto.randomUUID()}`;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
  currentUser: async () => ({
    id: process.env.TEST_CLERK_ID,
    emailAddresses: [{ emailAddress: 'plan@test.cl' }],
    phoneNumbers: [],
    firstName: 'Plan',
    lastName: 'Host',
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let admin: ReturnType<typeof createClient>;
let requestMyPlan: () => Promise<{ ok: boolean }>;
let cancelMyPlan: () => Promise<{ ok: boolean }>;
let customerId: string;

const row = async () =>
  (await admin.from('plan_subscriptions').select('*').eq('customer_id', customerId).single()).data!;

beforeAll(async () => {
  if (!LIVE) return;
  const p = await import('../src/app/[locale]/(site)/account/plan-actions');
  requestMyPlan = p.requestMyPlan;
  cancelMyPlan = p.cancelMyPlan;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'plan@test.cl',
      full_name: 'Plan Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('plan_subscriptions').delete().eq('customer_id', customerId);
});

describe.skipIf(!LIVE)('management plan request (end to end)', () => {
  it('requests the commission plan, cancels it, and re-requests it on the same row', async () => {
    expect((await requestMyPlan()).ok).toBe(true);
    let r = await row();
    expect(r.plan).toBe('commission');
    expect(r.status).toBe('requested');
    expect(r.current_period_end).toBeNull();

    expect((await cancelMyPlan()).ok).toBe(true);
    r = await row();
    expect(r.status).toBe('cancelled');

    expect((await requestMyPlan()).ok).toBe(true);
    const { data: rows } = await admin
      .from('plan_subscriptions')
      .select('plan, status')
      .eq('customer_id', customerId);
    expect(rows).toEqual([{ plan: 'commission', status: 'requested' }]);
  });

  it('keeps an operator-activated plan and never activates one itself', async () => {
    expect((await requestMyPlan()).ok).toBe(true);
    expect((await row()).status).toBe('requested');

    await admin
      .from('plan_subscriptions')
      .update({ status: 'active' })
      .eq('customer_id', customerId);

    expect((await requestMyPlan()).ok).toBe(false);
    const r = await row();
    expect(r.status).toBe('active');
    expect(r.plan).toBe('commission');
  });

  it('reports no plan to cancel when the customer has no row', async () => {
    expect((await cancelMyPlan()).ok).toBe(false);
    const { count } = await admin
      .from('plan_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId);
    expect(count).toBe(0);
  });

  it('creates the customer row for a host who never opened the account page', async () => {
    const original = process.env.TEST_CLERK_ID!;
    const fresh = `test-plan-${nodeCrypto.randomUUID()}`;
    process.env.TEST_CLERK_ID = fresh;
    try {
      expect((await requestMyPlan()).ok).toBe(true);
      const { data: created } = await admin
        .from('customers')
        .select('id')
        .eq('clerk_user_id', fresh)
        .single();
      const { data: sub } = await admin
        .from('plan_subscriptions')
        .select('plan, status')
        .eq('customer_id', created!.id as string)
        .single();
      expect(sub).toEqual({ plan: 'commission', status: 'requested' });
    } finally {
      await admin.from('customers').delete().eq('clerk_user_id', fresh);
      process.env.TEST_CLERK_ID = original;
    }
  });
});
