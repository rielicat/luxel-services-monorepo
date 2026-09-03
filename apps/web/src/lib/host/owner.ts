import 'server-only';
import { getOrCreateCustomer } from '@/lib/customer';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export async function currentCustomerId(): Promise<string | null> {
  const customer = await getOrCreateCustomer();
  return customer?.id ?? null;
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
