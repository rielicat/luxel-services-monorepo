'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateCustomer } from '@/lib/customer';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

const ProfileSchema = z.object({
  full_name: z.string().min(2).max(120).optional(),
  phone: z.string().min(8).max(20).optional(),
});

export async function updateProfileAction(formData: FormData) {
  const customer = await getOrCreateCustomer();
  if (!customer) return { ok: false, error: 'unauthorized' as const };

  const parsed = ProfileSchema.safeParse({
    full_name: (formData.get('full_name') as string | null) || undefined,
    phone: (formData.get('phone') as string | null) || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'validation' as const };

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('customers')
    .update({
      full_name: parsed.data.full_name ?? null,
      phone: parsed.data.phone ?? null,
    })
    .eq('id', customer.id);
  if (error) return { ok: false, error: 'generic' as const };

  revalidatePath('/account', 'page');
  revalidatePath('/account/profile', 'page');
  return { ok: true };
}

export async function setSubscriptionStatusAction(
  subscriptionId: string,
  status: 'active' | 'paused' | 'cancelled',
) {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: 'unauthorized' as const };

  const supabase = createSupabaseServiceRoleClient();

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('clerk_user_id', userId)
    .single();
  if (!customer) return { ok: false, error: 'unauthorized' as const };

  const { error } = await supabase
    .from('subscriptions')
    .update({ status })
    .eq('id', subscriptionId)
    .eq('customer_id', customer.id);
  if (error) return { ok: false, error: 'generic' as const };

  revalidatePath('/account', 'page');
  return { ok: true };
}
