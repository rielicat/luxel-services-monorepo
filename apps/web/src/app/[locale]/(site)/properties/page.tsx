import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { getPlan, type PlanRow } from '@/lib/plans';
import { fetchProperties, fetchConnection, type HostConnection } from '@/lib/host/queries';
import { hospitableTokenForCustomer } from '@/lib/channels/hospitable';
import { reconcileHospitableProperties } from '@/lib/channels/hospitable-sync';
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
    connection = await fetchConnection(customer.id);
    // When the host has a connected Hospitable account, pull their property list
    // live on every load so the grid reflects Hospitable directly (no background
    // cron needed). Gated on an existing connection so we never reconcile with the
    // env founder-token fallback here. A full sync (reservations/messages/AI) still
    // runs on connect, the manual Sync button and webhooks.
    if (connection) {
      const token = await hospitableTokenForCustomer(customer.id);
      if (token) {
        try {
          await reconcileHospitableProperties(customer.id, token);
        } catch {
          /* Hospitable hiccup → fall back to the stored mirror */
        }
      }
    }
    [properties, plan] = await Promise.all([
      fetchProperties(customer.id) as Promise<PropertyRow[]>,
      getPlan(customer.id),
    ]);
  }

  return <PropertiesClient initial={properties} plan={plan} connection={connection} />;
}
