import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-plan-${nodeCrypto.randomUUID()}`;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let admin: ReturnType<typeof createClient>;
let requestMyPlan: (i: unknown) => Promise<{ ok: boolean }>;
let cancelMyPlan: () => Promise<{ ok: boolean }>;
let customerId: string;

const row = async () =>
  (await admin.from('plan_subscriptions').select('*').eq('customer_id', customerId).single()).data!;

beforeAll(async () => {
  if (!LIVE) return;
  const p = await import('../src/app/[locale]/(site)/properties/plan-actions');
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
  it('requests a plan, cancels it, and re-requests another one on the same row', async () => {
    expect((await requestMyPlan({ plan: 'hybrid' })).ok).toBe(true);
    let r = await row();
    expect(r.plan).toBe('hybrid');
    expect(r.status).toBe('requested');
    expect(r.current_period_end).toBeNull();

    expect((await cancelMyPlan()).ok).toBe(true);
    r = await row();
    expect(r.status).toBe('cancelled');

    expect((await requestMyPlan({ plan: 'commission' })).ok).toBe(true);
    const { data: rows } = await admin
      .from('plan_subscriptions')
      .select('plan, status')
      .eq('customer_id', customerId);
    expect(rows).toEqual([{ plan: 'commission', status: 'requested' }]);
  });

  it('keeps an operator-activated plan and never activates one itself', async () => {
    expect((await requestMyPlan({ plan: 'fixed' })).ok).toBe(true);
    await admin
      .from('plan_subscriptions')
      .update({ status: 'active' })
      .eq('customer_id', customerId);
    expect((await requestMyPlan({ plan: 'fixed' })).ok).toBe(true);
    expect((await row()).status).toBe('requested');
  });

  it('rejects unknown plan keys', async () => {
    for (const plan of ['ai', 'ai_cleaning', '', 42, null]) {
      expect((await requestMyPlan({ plan })).ok).toBe(false);
    }
    const { count } = await admin
      .from('plan_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId);
    expect(count).toBe(0);
  });
});
