/**
 * End-to-end proof of the AI-plan subscription lifecycle: start a 14-day trial,
 * the win-back extension to 30 days, cancel, and reactivate.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-plan-${nodeCrypto.randomUUID()}`;
// Enable the payment dev-mock so trial→active activation is testable without MP.
delete process.env.MERCADOPAGO_ACCESS_TOKEN;
process.env.LUXEL_DEV_MOCK_PAYMENTS = '1';

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let admin: ReturnType<typeof createClient>;
let startPlan: (i: unknown) => Promise<{ ok: boolean }>;
let cancelMyPlan: () => Promise<{ ok: boolean }>;
let extendMyTrial: () => Promise<{ ok: boolean }>;
let activateMyPlan: () => Promise<{ ok: boolean; reason?: string }>;
let customerId: string;

const daysFromNow = (iso: string) => (new Date(iso).getTime() - Date.now()) / 86_400_000;

beforeAll(async () => {
  if (!LIVE) return;
  const p = await import('../src/app/[locale]/(site)/properties/plan-actions');
  startPlan = p.startPlan;
  cancelMyPlan = p.cancelMyPlan;
  extendMyTrial = p.extendMyTrial;
  activateMyPlan = p.activateMyPlan;
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

describe.skipIf(!LIVE)('AI-plan subscription (end to end)', () => {
  it('runs trial → win-back → cancel → reactivate', async () => {
    expect((await startPlan({ plan: 'ai' })).ok).toBe(true);
    let row = (
      await admin.from('plan_subscriptions').select('*').eq('customer_id', customerId).single()
    ).data!;
    expect(row.status).toBe('trialing');
    expect(daysFromNow(row.trial_ends_at as string)).toBeGreaterThan(13);
    expect(daysFromNow(row.trial_ends_at as string)).toBeLessThan(15);

    expect((await extendMyTrial()).ok).toBe(true);
    row = (
      await admin.from('plan_subscriptions').select('*').eq('customer_id', customerId).single()
    ).data!;
    expect(row.status).toBe('trialing');
    expect(daysFromNow(row.trial_ends_at as string)).toBeGreaterThan(29);

    expect((await cancelMyPlan()).ok).toBe(true);
    row = (
      await admin.from('plan_subscriptions').select('status').eq('customer_id', customerId).single()
    ).data!;
    expect(row.status).toBe('cancelled');

    // Reactivate — upsert flips it back to trialing without a duplicate row.
    expect((await startPlan({ plan: 'ai' })).ok).toBe(true);
    const { data: rows } = await admin
      .from('plan_subscriptions')
      .select('status')
      .eq('customer_id', customerId);
    expect(rows).toHaveLength(1);
    expect(rows![0].status).toBe('trialing');
  });

  it('activates the trial to a paid plan via the payment dev-mock', async () => {
    expect((await startPlan({ plan: 'ai' })).ok).toBe(true);
    const r = await activateMyPlan();
    expect(r.ok).toBe(true);
    const row = (
      await admin
        .from('plan_subscriptions')
        .select('status, current_period_end, provider')
        .eq('customer_id', customerId)
        .single()
    ).data!;
    expect(row.status).toBe('active');
    expect(row.current_period_end).toBeTruthy();
    expect(row.provider).toBe('mercadopago');
  });
});
