'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase';
import { checkinToken } from '@/lib/checkin';
import { listHospitableCalendar, providerApiKey, setHospitableCalendar } from '@/lib/hospitable';
import {
  BLOCK_SOURCE,
  BLOCK_SUMMARY,
  DATE_RE,
  MANUAL_ORIGIN,
  MAX_NIGHTS,
  TIME_RE,
  manualRef,
  santiagoToday,
  nightsBetween,
  stayNights,
} from '@/lib/stays';

export interface StayActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  detail?: string;
}

type SupabaseClient = ReturnType<typeof createServiceClient>;

const OverlapCode = '23P01';

const CreateSchema = z.object({
  propertyId: z.string().uuid(),
  guestName: z.string().trim().min(2).max(120),
  arrival: z.string().regex(DATE_RE),
  departure: z.string().regex(DATE_RE),
  arrivalTime: z.string().trim().regex(TIME_RE).or(z.literal('')),
  departureTime: z.string().trim().regex(TIME_RE).or(z.literal('')),
});

const CancelSchema = z.object({
  stayId: z.string().uuid(),
  propertyId: z.string().uuid(),
  confirm: z.boolean(),
});

interface BlockRange {
  starts_on: string;
  ends_on: string;
}

async function recordStayEvent(
  actor: string,
  event: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('analytics_events').insert({
    event,
    distinct_id: `operator:${actor}`,
    properties: { ...properties, actor: 'operator' },
    source: 'server',
  });
  if (error) console.warn('admin.stay_event_failed', { event, message: error.message });
}

async function blocksInRange(
  supabase: SupabaseClient,
  propertyId: string,
  from: string,
  to: string,
  skipUid: string | null,
): Promise<BlockRange[] | null> {
  const { data, error } = await supabase
    .from('calendar_blocks')
    .select('starts_on, ends_on, external_uid')
    .eq('property_id', propertyId)
    .gt('ends_on', from)
    .lt('starts_on', to)
    .limit(500);
  if (error) {
    console.error('admin.stay_blocks_read_failed', { propertyId, message: error.message });
    return null;
  }
  return ((data ?? []) as (BlockRange & { external_uid: string | null })[])
    .filter((b) => b.ends_on > b.starts_on)
    .filter((b) => !skipUid || b.external_uid !== skipUid)
    .map((b) => ({ starts_on: b.starts_on, ends_on: b.ends_on }));
}

async function pushAvailability(
  token: string,
  listingId: string,
  nights: string[],
  available: boolean,
): Promise<StayActionResult | null> {
  const result = await setHospitableCalendar(
    token,
    listingId,
    nights.map((date) => ({ date, available })),
  );
  if (result.ok) return null;
  console.error('admin.stay_calendar_write_failed', {
    listingId,
    available,
    status: result.status,
    nights: nights.length,
  });
  return {
    ok: false,
    error: available ? 'release_failed' : 'hospitable_refused',
    detail: result.detail ?? `HTTP ${result.status}`,
  };
}

export async function createManualStay(input: {
  propertyId: string;
  guestName: string;
  arrival: string;
  departure: string;
  arrivalTime: string;
  departureTime: string;
}): Promise<StayActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.stay_create_denied', { propertyId: input.propertyId });
    return { ok: false, error: 'denied' };
  }

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const { propertyId, guestName, arrival, departure } = parsed.data;
  if (departure <= arrival) return { ok: false, error: 'bad_range' };
  if (arrival < santiagoToday()) return { ok: false, error: 'past' };
  const nights = stayNights(arrival, departure);
  if (!nights.length || nights.length > MAX_NIGHTS) return { ok: false, error: 'too_long' };

  const supabase = createServiceClient();
  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .select('id, external_listing_id')
    .eq('id', propertyId)
    .maybeSingle();
  if (propertyError) {
    console.error('admin.stay_property_read_failed', {
      propertyId,
      message: propertyError.message,
    });
    return { ok: false, error: 'read_failed' };
  }
  if (!property) return { ok: false, error: 'unknown_property' };
  const listingId = (property.external_listing_id as string | null) ?? '';
  if (!listingId) return { ok: false, error: 'no_listing' };

  const token = providerApiKey();
  if (!token) return { ok: false, error: 'no_credential' };

  const known = await blocksInRange(supabase, propertyId, arrival, departure, null);
  if (!known) return { ok: false, error: 'read_failed' };
  if (known.length) return { ok: false, error: 'overlaps' };

  const lastNight = nights[nights.length - 1]!;
  const remote = await listHospitableCalendar(token, listingId, arrival, lastNight);
  if (!remote) return { ok: false, error: 'calendar_unreadable' };
  const free = new Set(remote.filter((day) => day.available === true).map((day) => day.date));
  if (!nights.every((night) => free.has(night))) return { ok: false, error: 'taken' };

  const blocked = await pushAvailability(token, listingId, nights, false);
  if (blocked) return blocked;

  const stayId = randomUUID();
  const uid = manualRef(stayId);
  const rollback = async (): Promise<void> => {
    const others = await blocksInRange(supabase, propertyId, arrival, departure, uid);
    const taken = new Set((others ?? []).flatMap((b) => nightsBetween(b.starts_on, b.ends_on)));
    const orphaned = nights.filter((d) => !taken.has(d));
    const failure = await pushAvailability(token, listingId, orphaned, true);
    if (failure) {
      console.error('admin.stay_rollback_failed', {
        propertyId,
        listingId,
        nights: orphaned,
        error: failure.error,
      });
    }
  };

  const { error: blockError } = await supabase.from('calendar_blocks').insert({
    property_id: propertyId,
    starts_on: arrival,
    ends_on: departure,
    source: BLOCK_SOURCE,
    origin: MANUAL_ORIGIN,
    summary: BLOCK_SUMMARY,
    external_uid: uid,
  });
  if (blockError) {
    await rollback();
    if (blockError.code === OverlapCode) return { ok: false, error: 'overlaps' };
    console.error('admin.stay_block_write_failed', { propertyId, message: blockError.message });
    return { ok: false, error: 'write_failed' };
  }

  const { error: checkinError } = await supabase.from('checkins').insert({
    property_id: propertyId,
    token: checkinToken(),
    status: 'pending',
    origin: MANUAL_ORIGIN,
    reservation_uid: uid,
    guest_name: guestName,
    arrival_date: arrival,
    departure_date: departure,
    arrival_time: parsed.data.arrivalTime || null,
    departure_time: parsed.data.departureTime || null,
  });
  if (checkinError) {
    await supabase
      .from('calendar_blocks')
      .delete()
      .eq('property_id', propertyId)
      .eq('external_uid', uid);
    await rollback();
    console.error('admin.stay_checkin_write_failed', { propertyId, message: checkinError.message });
    return { ok: false, error: 'write_failed' };
  }

  await recordStayEvent(admin.email, 'manual_stay_created', {
    propertyId,
    stayId,
    nights: nights.length,
  });
  revalidatePath('/stays');
  return { ok: true, message: 'created' };
}

export async function cancelManualStay(input: {
  stayId: string;
  propertyId: string;
  confirm: boolean;
}): Promise<StayActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.stay_cancel_denied', { propertyId: input.propertyId });
    return { ok: false, error: 'denied' };
  }

  const parsed = CancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  if (!parsed.data.confirm) return { ok: false, error: 'confirm_cancel' };
  const { stayId, propertyId } = parsed.data;
  const uid = manualRef(stayId);

  const supabase = createServiceClient();
  const [propertyRes, checkinRes, blockRes] = await Promise.all([
    supabase.from('properties').select('external_listing_id').eq('id', propertyId).maybeSingle(),
    supabase
      .from('checkins')
      .select('id, arrival_date, departure_date')
      .eq('property_id', propertyId)
      .eq('origin', MANUAL_ORIGIN)
      .eq('reservation_uid', uid)
      .maybeSingle(),
    supabase
      .from('calendar_blocks')
      .select('id, starts_on, ends_on')
      .eq('property_id', propertyId)
      .eq('origin', MANUAL_ORIGIN)
      .eq('external_uid', uid)
      .maybeSingle(),
  ]);
  if (propertyRes.error || checkinRes.error || blockRes.error) {
    console.error('admin.stay_cancel_read_failed', {
      propertyId,
      message:
        propertyRes.error?.message ?? checkinRes.error?.message ?? blockRes.error?.message ?? '',
    });
    return { ok: false, error: 'read_failed' };
  }
  const checkin = checkinRes.data as { id: string } | null;
  const block = blockRes.data as { id: string; starts_on: string; ends_on: string } | null;
  if (!checkin && !block) return { ok: false, error: 'unknown_stay' };

  const listingId = (propertyRes.data?.external_listing_id as string | null) ?? '';
  if (block && !listingId) return { ok: false, error: 'no_listing' };
  let released = 0;
  if (block && listingId) {
    const token = providerApiKey();
    if (!token) return { ok: false, error: 'no_credential' };
    const others = await blocksInRange(supabase, propertyId, block.starts_on, block.ends_on, uid);
    if (!others) return { ok: false, error: 'read_failed' };
    const taken = new Set(others.flatMap((b) => nightsBetween(b.starts_on, b.ends_on)));
    const free = nightsBetween(block.starts_on, block.ends_on).filter((d) => !taken.has(d));
    const failure = await pushAvailability(token, listingId, free, true);
    if (failure) return failure;
    released = free.length;
  }

  if (checkin) {
    const { error } = await supabase
      .from('checkins')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', checkin.id);
    if (error) {
      console.error('admin.stay_revoke_failed', { propertyId, message: error.message });
      return { ok: false, error: 'write_failed' };
    }
  }
  if (block) {
    const { error } = await supabase.from('calendar_blocks').delete().eq('id', block.id);
    if (error) {
      console.error('admin.stay_block_delete_failed', { propertyId, message: error.message });
      return { ok: false, error: 'write_failed' };
    }
  }

  await recordStayEvent(admin.email, 'manual_stay_cancelled', { propertyId, stayId, released });
  revalidatePath('/stays');
  return { ok: true, message: 'cancelled' };
}

function staysUrl(params: Record<string, string>, hash: string): string {
  const entries = Object.entries(params).filter(([, value]) => value);
  const query = new URLSearchParams(entries).toString();
  return `/stays${query ? `?${query}` : ''}${hash}`;
}

function feedbackUrl(
  result: StayActionResult,
  params: Record<string, string>,
  hash: string,
): string {
  return staysUrl(
    result.ok
      ? { ...params, ok: result.message ?? 'saved' }
      : { ...params, error: result.error ?? 'write_failed', detail: result.detail ?? '' },
    hash,
  );
}

export async function submitCreateManualStay(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const result = await createManualStay({
    propertyId,
    guestName: String(formData.get('guestName') ?? ''),
    arrival: String(formData.get('arrival') ?? ''),
    departure: String(formData.get('departure') ?? ''),
    arrivalTime: String(formData.get('arrivalTime') ?? ''),
    departureTime: String(formData.get('departureTime') ?? ''),
  });
  redirect(feedbackUrl(result, { id: propertyId }, `#p-${propertyId}`));
}

export async function submitCancelManualStay(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const stayId = String(formData.get('stayId') ?? '');
  const result = await cancelManualStay({
    stayId,
    propertyId,
    confirm: String(formData.get('confirm') ?? '') === 'yes',
  });
  redirect(feedbackUrl(result, { id: propertyId, stay: stayId }, `#p-${propertyId}`));
}
