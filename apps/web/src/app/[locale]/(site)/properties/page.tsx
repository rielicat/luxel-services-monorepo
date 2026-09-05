import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';
import { fetchProperties, fetchConnection, type HostConnection } from '@luxel/core/host/queries';
import { saveHospitableConnection } from '@luxel/core/channels/hospitable';
import { hospitableAccess } from '@luxel/core/channels/scope';
import {
  reconcileHospitableProperties,
  syncHospitableAccount,
} from '@luxel/core/channels/hospitable-sync';
import { connectionRequestedAt } from '@luxel/core/channels/onboarding-queue';
import { getHostConnection } from '@luxel/core/channels/connection';
import { PropertiesClient, type PropertyRow } from './properties-client';
import type { ConnectState } from './connect-panel';

export const dynamic = 'force-dynamic';

const FULL_SYNC_STALE_MS = 15 * 60_000;

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
  let connection: HostConnection | null = null;
  let syncFailed = false;
  let centralManaged = false;
  let connectState: ConnectState = {
    stage: 'not_started',
    requestedAt: null,
    airbnbEmail: null,
    inviteUrl: null,
  };
  if (customer) {
    connection = await fetchConnection(customer.id);
    const access = await hospitableAccess(customer.id);
    const token = access?.token ?? null;
    centralManaged = access?.scope === 'central';
    if (access) {
      const r = await reconcileHospitableProperties(customer.id, token!, access.scope).catch(
        () => null,
      );
      syncFailed = !r?.ok;
      if (r?.ok && !connection && access.scope === 'own') {
        await saveHospitableConnection(customer.id, token!, r.accountLabel);
        connection = await fetchConnection(customer.id);
      }
      const syncedAt = connection?.messages_synced_at
        ? new Date(connection.messages_synced_at).getTime()
        : 0;
      const eligible = access.scope === 'own' ? Boolean(connection) : true;
      if (r?.ok && eligible && Date.now() - syncedAt > FULL_SYNC_STALE_MS) {
        const customerId = customer.id;
        const scope = access.scope;
        after(async () => {
          await syncHospitableAccount(customerId, token!, new Date(), scope).catch(() => {});
        });
      }
    } else if (connection?.has_token) {
      syncFailed = true;
    } else {
      connection = null;
    }
    properties = (await fetchProperties(customer.id)) as PropertyRow[];

    const host = await getHostConnection(customer.id);
    if (host) {
      connectState = {
        stage: host.state,
        requestedAt: await connectionRequestedAt(customer.id),
        airbnbEmail: host.claimedAirbnbEmail,
        inviteUrl: host.inviteUrl,
      };
    }
    if (properties.length && connectState.stage !== 'needs_operator') {
      connectState = { ...connectState, stage: 'connected' };
    }
  }

  return (
    <PropertiesClient
      initial={properties}
      connection={connection}
      connectState={connectState}
      signupEmail={(customer?.email as string | null) ?? null}
      syncFailed={syncFailed}
      centralManaged={centralManaged}
    />
  );
}
