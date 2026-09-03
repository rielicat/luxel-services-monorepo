import 'server-only';
import { createSupabaseServiceRoleClient } from './supabase/server';
import type { PlanKey } from './plan-pricing';

export type PlanStatus = 'requested' | 'active' | 'cancelled';

export type PlanRow = {
  plan: PlanKey;
  status: PlanStatus;
  current_period_end: string | null;
};

export async function getPlan(customerId: string): Promise<PlanRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('plan_subscriptions')
    .select('plan, status, current_period_end')
    .eq('customer_id', customerId)
    .maybeSingle();
  return (data as PlanRow | null) ?? null;
}

export async function requestPlan(customerId: string): Promise<boolean> {
  const current = await getPlan(customerId);
  if (current?.status === 'active') return false;

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('plan_subscriptions').upsert(
    {
      customer_id: customerId,
      plan: 'commission' satisfies PlanKey,
      status: 'requested',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'customer_id' },
  );
  return !error;
}

export async function cancelPlan(customerId: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('plan_subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('customer_id', customerId)
    .select('customer_id')
    .maybeSingle();
  return !error && Boolean(data);
}
