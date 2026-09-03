import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChannelListing, ChannelReservation, ProviderId } from './types';
import { decodeRef, encodeRef } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, 'public', any>;

interface RelinkResult {
  relinked: number;
  checkinsMoved: number;
  unmatched: string[];
}

export async function mergeThreads(
  supabase: Supabase,
  fromId: string,
  intoId: string,
): Promise<void> {
  const { data: have } = await supabase
    .from('guest_messages')
    .select('external_id')
    .eq('thread_id', intoId)
    .not('external_id', 'is', null);
  const seen = (have ?? []).map((m) => m.external_id as string);
  if (seen.length) {
    await supabase.from('guest_messages').delete().eq('thread_id', fromId).in('external_id', seen);
  }
  await supabase.from('guest_messages').update({ thread_id: intoId }).eq('thread_id', fromId);
  await supabase.from('guest_threads').delete().eq('id', fromId);
  await supabase
    .from('guest_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', intoId);
}

async function rekeyThread(
  supabase: Supabase,
  propertyId: string,
  from: string,
  to: string,
): Promise<void> {
  const { data: threads } = await supabase
    .from('guest_threads')
    .select('id, external_thread_id')
    .eq('property_id', propertyId)
    .eq('channel', 'hospitable')
    .in('external_thread_id', [from, to]);
  const old = threads?.find((t) => t.external_thread_id === from);
  if (!old) return;
  const dup = threads?.find((t) => t.external_thread_id === to);
  if (dup) await mergeThreads(supabase, dup.id as string, old.id as string);
  await supabase.from('guest_threads').update({ external_thread_id: to }).eq('id', old.id);
}

export async function rekeyCheckinsByConfirmationCode(
  supabase: Supabase,
  propertyId: string,
  uidByCode: Map<string, string>,
): Promise<number | null> {
  if (!uidByCode.size) return 0;
  const { data: rows, error } = await supabase
    .from('checkins')
    .select('id, reservation_uid, confirmation_code, revoked_at')
    .eq('property_id', propertyId)
    .eq('origin', 'channel')
    .in('confirmation_code', [...uidByCode.keys()]);
  if (error) return null;
  if (!rows?.length) return 0;

  const taken = new Set(rows.map((r) => r.reservation_uid as string | null));
  let moved = 0;
  for (const [code, next] of uidByCode) {
    if (taken.has(next)) continue;
    const mine = rows.filter((r) => String(r.confirmation_code).trim() === code);
    const row = mine.find((r) => r.revoked_at == null) ?? mine[0];
    if (!row) continue;
    const { error: moveError } = await supabase
      .from('checkins')
      .update({ reservation_uid: next, revoked_at: null })
      .eq('id', row.id);
    if (moveError) continue;
    taken.add(next);
    moved += 1;
    const from = decodeRef(String(row.reservation_uid ?? ''))?.id;
    const to = decodeRef(next)?.id;
    if (from && to && from !== to) await rekeyThread(supabase, propertyId, from, to);
  }
  return moved;
}

export async function mergeOrphanThreads(
  supabase: Supabase,
  propertyId: string,
  liveIds: Set<string>,
): Promise<number> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: threads } = await supabase
    .from('guest_threads')
    .select('id, external_thread_id')
    .eq('property_id', propertyId)
    .eq('channel', 'hospitable')
    .not('external_thread_id', 'is', null)
    .gte('updated_at', since)
    .order('created_at', { ascending: true });
  if (!threads?.length) return 0;
  const live = new Map(
    threads
      .filter((t) => liveIds.has(t.external_thread_id as string))
      .map((t) => [t.id as string, t.external_thread_id as string] as const),
  );
  const orphans = threads.filter((t) => !liveIds.has(t.external_thread_id as string));
  if (!orphans.length || !live.size) return 0;

  let merged = 0;
  for (const orphan of orphans) {
    const { data: msgs } = await supabase
      .from('guest_messages')
      .select('external_id')
      .eq('thread_id', orphan.id)
      .not('external_id', 'is', null);
    const ids = (msgs ?? []).map((m) => m.external_id as string);
    if (!ids.length) continue;
    const { data: hits } = await supabase
      .from('guest_messages')
      .select('thread_id')
      .in('external_id', ids)
      .in('thread_id', [...live.keys()])
      .limit(1);
    const targetId = hits?.[0]?.thread_id as string | undefined;
    const targetExt = targetId ? live.get(targetId) : undefined;
    if (!targetId || !targetExt) continue;
    await mergeThreads(supabase, targetId, orphan.id as string);
    await supabase
      .from('guest_threads')
      .update({ external_thread_id: targetExt })
      .eq('id', orphan.id);
    live.delete(targetId);
    live.set(orphan.id as string, targetExt);
    merged += 1;
  }
  return merged;
}

export async function relinkByConfirmationCode(
  supabase: Supabase,
  customerId: string,
  provider: ProviderId,
  listings: ChannelListing[],
  reservationsByListing: Map<string, ChannelReservation[]>,
): Promise<RelinkResult> {
  const result: RelinkResult = { relinked: 0, checkinsMoved: 0, unmatched: [] };

  const { data: stored } = await supabase
    .from('properties')
    .select('id, external_listing_id')
    .eq('owner_id', customerId)
    .not('external_listing_id', 'is', null);
  if (!stored?.length) return result;

  const incomingIds = new Set(listings.map((l) => l.ref.id));
  const needsRelink = stored.filter((p) => !incomingIds.has(p.external_listing_id as string));
  if (!needsRelink.length) return result;

  for (const property of needsRelink) {
    const { data: mine } = await supabase
      .from('checkins')
      .select('id, reservation_uid, confirmation_code')
      .eq('property_id', property.id)
      .not('confirmation_code', 'is', null);

    const { data: blocks } = await supabase
      .from('calendar_blocks')
      .select('confirmation_code')
      .eq('property_id', property.id)
      .not('confirmation_code', 'is', null);

    const myCodes = new Set(
      [
        ...(mine ?? []).map((c) => c.confirmation_code),
        ...(blocks ?? []).map((b) => b.confirmation_code),
      ]
        .map((c) => String(c).trim())
        .filter(Boolean),
    );
    if (!myCodes.size) {
      result.unmatched.push(property.external_listing_id as string);
      continue;
    }

    let matched: { listingId: string; byCode: Map<string, string> } | null = null;
    for (const listing of listings) {
      const byCode = new Map<string, string>();
      for (const r of reservationsByListing.get(listing.ref.id) ?? []) {
        const code = r.confirmationCode?.trim();
        if (code) byCode.set(code, r.ref.id);
      }
      if ([...byCode.keys()].some((code) => myCodes.has(code))) {
        matched = { listingId: listing.ref.id, byCode };
        break;
      }
    }
    if (!matched) {
      result.unmatched.push(property.external_listing_id as string);
      continue;
    }

    const oldExternalId = property.external_listing_id as string;

    const { data: held, error: heldError } = await supabase
      .from('listing_assignments')
      .select('customer_id')
      .eq('external_listing_id', matched.listingId)
      .maybeSingle();
    if (heldError) {
      result.unmatched.push(oldExternalId);
      continue;
    }

    if (held && held.customer_id !== customerId) {
      result.unmatched.push(oldExternalId);
      continue;
    }

    if (held) {
      await supabase
        .from('listing_assignments')
        .delete()
        .eq('external_listing_id', oldExternalId)
        .eq('customer_id', customerId);
    } else {
      const { error } = await supabase
        .from('listing_assignments')
        .update({ external_listing_id: matched.listingId })
        .eq('external_listing_id', oldExternalId)
        .eq('customer_id', customerId);
      if (error) {
        result.unmatched.push(oldExternalId);
        continue;
      }
    }

    await supabase
      .from('properties')
      .update({ external_listing_id: matched.listingId })
      .eq('id', property.id);
    result.relinked += 1;

    const uidByCode = new Map(
      [...matched.byCode].map(([code, id]) => [code, encodeRef({ provider, id })] as const),
    );
    result.checkinsMoved +=
      (await rekeyCheckinsByConfirmationCode(supabase, property.id as string, uidByCode)) ?? 0;
  }

  return result;
}

export function pruneWouldWipeEverything(storedIds: string[], remoteIds: string[]): boolean {
  if (!storedIds.length || !remoteIds.length) return false;
  const remote = new Set(remoteIds);
  return !storedIds.some((id) => remote.has(id));
}
