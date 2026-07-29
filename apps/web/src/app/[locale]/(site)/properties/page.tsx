import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { getPlan, type PlanRow } from '@/lib/plans';
import { fetchProperties, fetchConnection, type HostConnection } from '@/lib/host/queries';
import { saveHospitableConnection } from '@/lib/channels/hospitable';
import { hospitableAccess } from '@/lib/channels/scope';
import {
  reconcileHospitableProperties,
  syncHospitableAccount,
} from '@/lib/channels/hospitable-sync';
import { PropertiesClient, type PropertyRow } from './properties-client';

export const dynamic = 'force-dynamic';

const FULL_SYNC_STALE_MS = 15 * 60_000;

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
  let syncFailed = false;
  let centralManaged = false;
  if (customer) {
    connection = await fetchConnection(customer.id);
    // The grid is a strict mirror of the channel: on every load we pull the
    // listing list live and reconcile (upsert + prune). Tenancy comes from
    // `hospitableAccess`: a customer's own token is the boundary by itself,
    // while Luxel's operator credential is filtered through the listing
    // assignments — see lib/channels/scope.ts.
    const access = await hospitableAccess(customer.id);
    const token = access?.token ?? null;
    centralManaged = access?.scope === 'central';
    if (access) {
      const r = await reconcileHospitableProperties(customer.id, token!, access.scope).catch(
        () => null,
      );
      syncFailed = !r?.ok;
      // Only a customer's OWN token is persisted as their connection. The
      // central credential must never be copied into a customer row — it is
      // Luxel's, and storing it there would make every listing it can reach
      // look like that customer's own account.
      if (r?.ok && !connection && access.scope === 'own') {
        await saveHospitableConnection(customer.id, token!, r.accountLabel);
        connection = await fetchConnection(customer.id);
      }
      // Self-operating sync: reservations, guest messages and cleanings refresh
      // automatically whenever the host visits and the last full sync is stale —
      // no manual button. The heavy work runs AFTER the response streams (the
      // page must never block on it); its results show on the next load.
      // (Real-time messaging additionally flows through the channel webhook.)
      const syncedAt = connection?.messages_synced_at
        ? new Date(connection.messages_synced_at).getTime()
        : 0;
      // Central-scope customers have no connection row of their own, so the
      // staleness clock comes from the last property sync instead.
      const eligible = access.scope === 'own' ? Boolean(connection) : true;
      if (r?.ok && eligible && Date.now() - syncedAt > FULL_SYNC_STALE_MS) {
        const customerId = customer.id;
        const scope = access.scope;
        after(async () => {
          await syncHospitableAccount(customerId, token!, new Date(), scope).catch(() => {});
        });
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
      centralManaged={centralManaged}
    />
  );
}
