import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { getPlan, type PlanRow } from '@/lib/plans';
import { fetchProperties, fetchConnection, type HostConnection } from '@/lib/host/queries';
import {
  customerHospitableToken,
  founderEnvHospitableToken,
  saveHospitableConnection,
} from '@/lib/channels/hospitable';
import { reconcileHospitableProperties } from '@/lib/channels/hospitable-sync';
import { PropertiesClient, type PropertyRow } from './properties-client';

export const dynamic = 'force-dynamic';

export default async function PropertiesPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const supabase = createSupabaseServiceRoleClient();
  const { data: customer } = await supabase
    .from('customers')
    .select('id, email')
    .eq('clerk_user_id', userId)
    .maybeSingle();

  let properties: PropertyRow[] = [];
  let plan: PlanRow | null = null;
  let connection: HostConnection | null = null;
  let syncFailed = false;
  if (customer) {
    connection = await fetchConnection(customer.id);
    // The grid is a strict mirror of Hospitable: on every load we pull the
    // listing list live and reconcile (upsert + prune). Token resolution is
    // tenant-safe by construction: a stored connection uses ITS token only (a
    // decrypt failure surfaces as a sync error — never an env fallthrough), and
    // the HOSPITABLE_API_TOKEN env bootstrap is released exclusively to
    // allowlisted operator emails (LUXEL_ADMIN_EMAILS), where it is persisted
    // encrypted as that account's own connection.
    const token = connection
      ? await customerHospitableToken(customer.id)
      : founderEnvHospitableToken(customer.email);
    if (token) {
      const r = await reconcileHospitableProperties(customer.id, token).catch(() => null);
      syncFailed = !r?.ok;
      if (r?.ok && !connection) {
        await saveHospitableConnection(customer.id, token, r.accountLabel);
        connection = await fetchConnection(customer.id);
      }
    } else if (connection) {
      // A connection exists but its token can't be used → the mirror is stale.
      syncFailed = true;
    }
    [properties, plan] = await Promise.all([
      fetchProperties(customer.id) as Promise<PropertyRow[]>,
      getPlan(customer.id),
    ]);
  }

  return (
    <PropertiesClient
      initial={properties}
      plan={plan}
      connection={connection}
      syncFailed={syncFailed}
    />
  );
}
