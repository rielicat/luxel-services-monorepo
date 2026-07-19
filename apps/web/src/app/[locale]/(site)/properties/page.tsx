import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { getPlan, type PlanRow } from '@/lib/plans';
import { fetchProperties, fetchConnection, type HostConnection } from '@/lib/host/queries';
import { PropertiesClient, type PropertyRow } from './properties-client';

export const dynamic = 'force-dynamic';

export default async function PropertiesPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const supabase = createSupabaseServiceRoleClient();
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('clerk_user_id', userId)
    .maybeSingle();

  let properties: PropertyRow[] = [];
  let plan: PlanRow | null = null;
  let connection: HostConnection | null = null;
  if (customer) {
    [properties, plan, connection] = await Promise.all([
      fetchProperties(customer.id) as Promise<PropertyRow[]>,
      getPlan(customer.id),
      fetchConnection(customer.id),
    ]);
  }

  return <PropertiesClient initial={properties} plan={plan} connection={connection} />;
}
