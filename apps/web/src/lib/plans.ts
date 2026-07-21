import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { AI_PLAN_CLP, TRIAL_DAYS } from '@/lib/plan-pricing';

export { AI_PLAN_CLP };
const WINBACK_DAYS = 30;

export type PlanRow = {
  plan: 'ai' | 'ai_cleaning';
  status: 'trialing' | 'active' | 'cancelled';
  trial_ends_at: string | null;
  current_period_end: string | null;
};

export async function getPlan(customerId: string): Promise<PlanRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('plan_subscriptions')
    .select('plan, status, trial_ends_at, current_period_end')
    .eq('customer_id', customerId)
    .maybeSingle();
  return (data as PlanRow | null) ?? null;
}

export async function startTrial(customerId: string, plan: 'ai' | 'ai_cleaning'): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
  const { error } = await supabase.from('plan_subscriptions').upsert(
    {
      customer_id: customerId,
      plan,
      status: 'trialing',
      trial_ends_at: trialEnds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'customer_id' },
  );
  return !error;
}

export async function cancelPlan(customerId: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('plan_subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('customer_id', customerId);
  return !error;
}

/** Win-back on cancel: extend the free period to 30 days and keep the plan alive. */
export async function extendTrial(customerId: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const trialEnds = new Date(Date.now() + WINBACK_DAYS * 86_400_000).toISOString();
  const { error } = await supabase
    .from('plan_subscriptions')
    .update({ status: 'trialing', trial_ends_at: trialEnds, updated_at: new Date().toISOString() })
    .eq('customer_id', customerId);
  return !error;
}

/** Moves a plan from trial to active with a 30-day period. In production this is
 *  called after a MercadoPago preapproval is authorized; in dev-mock it's direct. */
export async function activatePlan(customerId: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const periodEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const { error } = await supabase
    .from('plan_subscriptions')
    .update({
      status: 'active',
      current_period_end: periodEnd,
      provider: 'mercadopago',
      updated_at: new Date().toISOString(),
    })
    .eq('customer_id', customerId);
  return !error;
}
