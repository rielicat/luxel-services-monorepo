import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { listHospitableProperties, type HospitableProperty } from './hospitable';
import { assignListing, unassignedListingIds } from './scope';
import { providerApiKey } from './credentials';

/**
 * Attribution without an operator.
 *
 * Every listing in Luxel's central channel account carries the host's own
 * channel identity (`listings[].platform_email`, verified live 2026-07). When
 * that email matches exactly one Luxel customer, the listing is theirs and we
 * say so — no human step, which is the whole point of the managed model.
 *
 * It NEVER guesses. No match, or more than one candidate, leaves the listing
 * unassigned for the operator screen: an assignment IS the tenant boundary, and
 * a wrong one hands a host someone else's property.
 */

/** Channel emails that identify the owner of this listing (Airbnb only —
 *  `direct`/`manual` rows are Luxel's own bookkeeping, not a host identity). */
function ownerEmails(rp: HospitableProperty): string[] {
  return (rp.listings ?? [])
    .filter((l) => l.platform === 'airbnb' && l.platform_email)
    .map((l) => l.platform_email!.trim().toLowerCase())
    .filter(Boolean);
}

export type AutoAssignResult = { ok: boolean; assigned: number; ambiguous: number };

export async function autoAssignListings(): Promise<AutoAssignResult> {
  const token = providerApiKey();
  if (!token) return { ok: false, assigned: 0, ambiguous: 0 };

  const remote = await listHospitableProperties(token);
  if (!remote) return { ok: false, assigned: 0, ambiguous: 0 };

  const free = await unassignedListingIds(remote.map((r) => r.id));
  // A failed read would look like "everything is unassigned" — never act on it.
  if (!free) return { ok: false, assigned: 0, ambiguous: 0 };
  if (!free.length) return { ok: true, assigned: 0, ambiguous: 0 };

  const freeSet = new Set(free);
  const candidates = remote.filter((rp) => freeSet.has(rp.id));
  const emails = [...new Set(candidates.flatMap(ownerEmails))];
  if (!emails.length) return { ok: true, assigned: 0, ambiguous: candidates.length };

  const supabase = createSupabaseServiceRoleClient();
  const { data: rows, error } = await supabase
    .from('customers')
    .select('id, email')
    .in('email', emails);
  if (error) return { ok: false, assigned: 0, ambiguous: 0 };

  // An email shared by two customer records is not a match we can trust.
  const byEmail = new Map<string, string[]>();
  for (const c of rows ?? []) {
    const key = (c.email as string).trim().toLowerCase();
    byEmail.set(key, [...(byEmail.get(key) ?? []), c.id as string]);
  }

  let assigned = 0;
  let ambiguous = 0;
  for (const rp of candidates) {
    const owners = new Set(ownerEmails(rp).flatMap((e) => byEmail.get(e) ?? []));
    if (owners.size !== 1) {
      ambiguous++;
      continue;
    }
    const [customerId] = [...owners];
    // expectedOwnerId null = "we saw it unassigned"; a concurrent operator
    // assignment makes this fail rather than override them.
    if (await assignListing(rp.id, customerId!, 'auto:channel_email', null)) assigned++;
    else ambiguous++;
  }
  return { ok: true, assigned, ambiguous };
}
