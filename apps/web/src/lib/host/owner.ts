import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export async function currentCustomerId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('customers')
    .select('id')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function ownsProperty(customerId: string, propertyId: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('owner_id', customerId)
    .maybeSingle();
  return Boolean(data);
}
