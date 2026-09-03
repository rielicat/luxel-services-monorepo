import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  airbnbIdentities,
  listHospitableProperties,
  normalizeChannelEmail,
  type AirbnbIdentity,
} from './hospitable';
import { assignListing, unassignedListingIds } from './scope';
import { providerApiKey } from './credentials';
import {
  channelUserOwners,
  claimedEmailOwners,
  confirmConnection,
  markNeedsOperator,
} from './connection';

type AutoAssignResult = {
  ok: boolean;
  assigned: number;
  ambiguous: number;
  needsOperator: number;
};

const EMPTY = { assigned: 0, ambiguous: 0, needsOperator: 0 };

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

function ownersFor(
  identities: AirbnbIdentity[],
  index: Map<string, string[]>,
  key: 'email' | 'userId',
): Set<string> {
  return new Set(identities.flatMap((i) => (i[key] ? (index.get(i[key]!) ?? []) : [])));
}

async function signupEmailOwners(emails: string[]): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>();
  if (!emails.length) return out;
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('customers').select('id, email').in('email', emails);
  if (error) return null;
  for (const row of data ?? []) {
    const key = normalizeChannelEmail(row.email as string | null);
    if (!key) continue;
    out.set(key, [...(out.get(key) ?? []), row.id as string]);
  }
  return out;
}

export async function autoAssignListings(): Promise<AutoAssignResult> {
  const token = providerApiKey();
  if (!token) return { ok: false, ...EMPTY };

  const remote = await listHospitableProperties(token);
  if (!remote) return { ok: false, ...EMPTY };

  const free = await unassignedListingIds(remote.map((r) => r.id));
  if (!free) return { ok: false, ...EMPTY };
  if (!free.length) return { ok: true, ...EMPTY };

  const freeSet = new Set(free);
  const candidates = remote.filter((rp) => freeSet.has(rp.id));
  const identities = new Map(candidates.map((rp) => [rp.id, airbnbIdentities(rp)]));
  const all = [...identities.values()].flat();
  const emails = unique(all.map((i) => i.email));
  const userIds = unique(all.map((i) => i.userId));
  if (!emails.length && !userIds.length) {
    return { ok: true, assigned: 0, ambiguous: candidates.length, needsOperator: 0 };
  }

  const bySignup = await signupEmailOwners(emails);
  const byClaim = await claimedEmailOwners(emails);
  const byUser = await channelUserOwners(userIds);
  if (!bySignup || !byClaim || !byUser) return { ok: false, ...EMPTY };

  let assigned = 0;
  let ambiguous = 0;
  let needsOperator = 0;
  for (const rp of candidates) {
    const ids = identities.get(rp.id) ?? [];
    const signupOwners = ownersFor(ids, bySignup, 'email');
    const claimOwners = ownersFor(ids, byClaim, 'email');
    const userOwners = ownersFor(ids, byUser, 'userId');

    const byEmail = new Set([...signupOwners, ...claimOwners]);
    const owners = userOwners.size ? userOwners : byEmail;
    const reason = userOwners.size
      ? 'auto:channel_user_id'
      : signupOwners.size
        ? 'auto:channel_email'
        : 'auto:claimed_email';

    if (owners.size !== 1) {
      ambiguous++;
      if (owners.size > 1) {
        for (const rival of owners) if (await markNeedsOperator(rival)) needsOperator++;
      }
      continue;
    }

    const [customerId] = [...owners];
    if (!(await assignListing(rp.id, customerId!, reason, null))) {
      ambiguous++;
      continue;
    }
    assigned++;
    const state = await confirmConnection(customerId!, {
      channelUserId: ids.find((i) => i.userId)?.userId ?? null,
      listings: 1,
    });
    if (state === 'needs_operator') needsOperator++;
  }
  return { ok: true, assigned, ambiguous, needsOperator };
}
