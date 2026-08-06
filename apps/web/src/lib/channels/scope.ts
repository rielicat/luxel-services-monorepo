import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { decryptPII } from '@/lib/crypto/pii';
import { providerApiKey } from './credentials';
import type { ChannelAccess, ChannelScope } from './types';

/**
 * The tenant boundary for the Hospitable mirror.
 *
 * A Hospitable token is scoped to ONE account (verified against their API spec:
 * "These tokens are scoped to your Hospitable account only", and no endpoint
 * takes an account parameter). Luxel manages hosts centrally, so a token alone
 * cannot say what a customer may see: `scope` says how to read what it returns.
 *
 * The scope vocabulary itself is provider-neutral and lives in ./types.ts — any
 * plugin faces the same central-versus-own question.
 */
export type { ChannelAccess, ChannelScope };

/** The customer's own stored Hospitable connection, or null. Never falls back
 *  to the operator credential — that decision belongs to the caller. */
async function ownConnectionToken(customerId: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('channel_connections')
    .select('token_enc')
    .eq('customer_id', customerId)
    .eq('provider', 'hospitable')
    .eq('status', 'connected')
    .maybeSingle();
  if (!data?.token_enc) return null;
  try {
    return decryptPII(data.token_enc as string);
  } catch {
    return null;
  }
}

/**
 * How this customer's listings are reachable.
 *
 * Withheld entirely from customers with no assignments: otherwise a customer
 * whose own connection broke would resolve to `central` with an empty allowed
 * set, and the strict mirror would have nothing to keep.
 */
export async function hospitableAccess(customerId: string): Promise<ChannelAccess | null> {
  const central = providerApiKey();
  const own = await ownConnectionToken(customerId);
  // A stored token that IS the operator credential is Luxel's, not this
  // customer's — the pre-central admin bootstrap persisted it as an "own"
  // connection. Treating it as `own` would bypass the assignment filter and
  // mirror every reachable listing into that one tenant.
  if (own && own !== central) return { token: own, scope: 'own' };
  if (!central) return null;
  const assigned = await allowedListingIds(customerId);
  return assigned?.length ? { token: central, scope: 'central' } : null;
}

/**
 * The external listing ids assigned to this customer.
 *
 * `null` means UNKNOWN (the read failed) and must never be read as "owns
 * nothing" — callers abort rather than act on an empty set they can't trust.
 */
export async function allowedListingIds(customerId: string): Promise<string[] | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('listing_assignments')
    .select('external_listing_id')
    .eq('customer_id', customerId);
  if (error) return null;
  return (data ?? []).map((r) => r.external_listing_id as string);
}

/**
 * Which customer owns this listing, for routing an inbound channel event.
 *
 * The assignment table is the authority, and there is deliberately NO fallback
 * to `properties.owner_id`: the mirror follows assignment, so a row that
 * disagrees is stale, and trusting it would deliver another tenant's event.
 * Null means nobody has claimed the listing yet — the operator-queue state,
 * which the scheduled reconcile resolves via attribution.
 */
export async function customerForListing(externalListingId: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('listing_assignments')
    .select('customer_id')
    .eq('external_listing_id', externalListingId)
    .maybeSingle();
  return (data?.customer_id as string | undefined) ?? null;
}

/** Which of these listing ids are not assigned to anybody yet — the operator
 *  queue for onboarding a newly granted account.
 *
 *  `null` means the read FAILED. Falling back to an empty "taken" set would
 *  present every already-owned listing as free to claim. */
export async function unassignedListingIds(remoteIds: string[]): Promise<string[] | null> {
  if (!remoteIds.length) return [];
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('listing_assignments')
    .select('external_listing_id')
    .in('external_listing_id', remoteIds);
  if (error) return null;
  const taken = new Set((data ?? []).map((r) => r.external_listing_id as string));
  return remoteIds.filter((id) => !taken.has(id));
}

/** Import-time claim: a listing mirrored under a customer's OWN token is
 *  theirs, so record it. Never overwrites an existing assignment —
 *  re-attribution is a deliberate operator act, not a sync side effect. */
export async function claimListing(externalListingId: string, customerId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from('listing_assignments').upsert(
    {
      external_listing_id: externalListingId,
      customer_id: customerId,
      assigned_at: new Date().toISOString(),
      assigned_by: 'own_token_import',
    },
    { onConflict: 'external_listing_id', ignoreDuplicates: true },
  );
}

/** Assign a listing to a customer. Caller MUST have verified operator rights.
 *  A transfer takes the mirror with it: leaving the previous owner's rows in
 *  place would keep them reading a listing they no longer hold.
 *
 *  `expectedOwnerId` is what the operator SAW when they decided — `null` for
 *  "it was unassigned". The write is a compare-and-set against it, so a screen
 *  that went stale (someone else assigned it meanwhile) fails loudly instead of
 *  silently transferring another customer's listing. */
export async function assignListing(
  externalListingId: string,
  customerId: string,
  assignedBy: string,
  expectedOwnerId: string | null,
): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const row = {
    external_listing_id: externalListingId,
    customer_id: customerId,
    assigned_at: new Date().toISOString(),
    assigned_by: assignedBy,
  };

  if (expectedOwnerId === null) {
    // Operator saw it unassigned: a plain insert fails if anyone claimed it.
    const { error } = await supabase.from('listing_assignments').insert(row);
    if (error) return false;
  } else {
    const { data, error } = await supabase
      .from('listing_assignments')
      .update(row)
      .eq('external_listing_id', externalListingId)
      .eq('customer_id', expectedOwnerId)
      .select('external_listing_id');
    if (error || !data?.length) return false;
  }

  await supabase
    .from('properties')
    .delete()
    .eq('external_listing_id', externalListingId)
    .neq('owner_id', customerId);
  return true;
}

/** Offboarding: drop the assignment AND the mirror. Deleting a customer's data
 *  is deliberate — the sync never does it as a side effect of an empty filter.
 *
 *  `expectedCustomerId` is the owner the operator confirmed in the dialog. If
 *  the row changed hands since the screen rendered, nothing is deleted — the
 *  alternative is destroying a different customer's data on a stale click. */
export async function unassignListing(
  externalListingId: string,
  expectedCustomerId: string,
): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('listing_assignments')
    .delete()
    .eq('external_listing_id', externalListingId)
    .eq('customer_id', expectedCustomerId)
    .select('external_listing_id');
  if (error || !data?.length) return false;
  // Scoped to the owner we just confirmed, never the listing globally.
  await supabase
    .from('properties')
    .delete()
    .eq('external_listing_id', externalListingId)
    .eq('owner_id', expectedCustomerId);
  return true;
}
