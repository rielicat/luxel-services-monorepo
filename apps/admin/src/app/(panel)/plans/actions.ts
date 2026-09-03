'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase';

const Schema = z.object({
  id: z.string().uuid(),
  status: z.enum(['active', 'cancelled']),
});

const EVENT = { active: 'plan_activated', cancelled: 'plan_cancelled' } as const;

export async function setPlanStatus(input: {
  id: string;
  status: string;
}): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.plan_status_denied', { id: input.id });
    return { ok: false };
  }

  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    console.warn('admin.plan_status_invalid', { id: input.id, status: input.status });
    return { ok: false };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('plan_subscriptions')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
    .select('customer_id, plan')
    .maybeSingle();

  const row = (data ?? null) as { customer_id: string; plan: string } | null;
  if (error || !row) {
    console.error('admin.plan_status_write_failed', {
      id: parsed.data.id,
      status: parsed.data.status,
      message: error?.message ?? 'no row updated',
    });
    return { ok: false };
  }

  const { error: eventError } = await supabase.from('analytics_events').insert({
    event: EVENT[parsed.data.status],
    distinct_id: row.customer_id,
    customer_id: row.customer_id,
    properties: { plan: row.plan, actor: 'operator' },
    source: 'server',
  });
  if (eventError) {
    console.warn('admin.plan_status_event_failed', {
      id: parsed.data.id,
      message: eventError.message,
    });
  }

  revalidatePath('/plans');
  revalidatePath('/');
  return { ok: true };
}

export async function submitPlanStatus(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const { ok } = await setPlanStatus({ id, status: String(formData.get('status') ?? '') });
  redirect(ok ? '/plans' : `/plans?failed=${encodeURIComponent(id)}`);
}
