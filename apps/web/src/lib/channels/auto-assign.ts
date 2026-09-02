import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { listHospitableProperties, type HospitableProperty } from './hospitable';
import { assignListing, unassignedListingIds } from './scope';
import { providerApiKey } from './credentials';

function ownerEmails(rp: HospitableProperty): string[] {
  return (rp.listings ?? [])
    .filter((l) => l.platform === 'airbnb' && l.platform_email)
    .map((l) => l.platform_email!.trim().toLowerCase())
    .filter(Boolean);
}

type AutoAssignResult = { ok: boolean; assigned: number; ambiguous: number };

export async function autoAssignListings(): Promise<AutoAssignResult> {
  const token = providerApiKey();
  if (!token) return { ok: false, assigned: 0, ambiguous: 0 };

  const remote = await listHospitableProperties(token);
  if (!remote) return { ok: false, assigned: 0, ambiguous: 0 };

  const free = await unassignedListingIds(remote.map((r) => r.id));
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
    if (await assignListing(rp.id, customerId!, 'auto:channel_email', null)) assigned++;
    else ambiguous++;
  }
  return { ok: true, assigned, ambiguous };
}
