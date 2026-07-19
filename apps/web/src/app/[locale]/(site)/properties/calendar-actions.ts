'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';
import { syncPropertyCalendars } from '@/lib/calendar/sync';

const FeedSchema = z.object({
  propertyId: z.string().uuid(),
  label: z.string().min(1).max(40),
  url: z.string().url().max(500),
});

export async function addCalendarFeed(input: unknown): Promise<{ ok: boolean }> {
  const p = FeedSchema.safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('property_calendars')
    .insert({ property_id: p.data.propertyId, label: p.data.label, ical_url: p.data.url });
  if (error) return { ok: false };
  await syncPropertyCalendars(p.data.propertyId);
  revalidatePath('/properties');
  return { ok: true };
}

export async function removeCalendarFeed(feedId: string): Promise<{ ok: boolean }> {
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data: feed } = await supabase
    .from('property_calendars')
    .select('property_id')
    .eq('id', feedId)
    .maybeSingle();
  if (!feed || !(await ownsProperty(cid, feed.property_id))) return { ok: false };
  await supabase.from('property_calendars').delete().eq('id', feedId);
  await syncPropertyCalendars(feed.property_id);
  revalidatePath('/properties');
  return { ok: true };
}

export async function syncNow(propertyId: string): Promise<{ ok: boolean; imported?: number }> {
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, propertyId))) return { ok: false };
  const r = await syncPropertyCalendars(propertyId);
  revalidatePath('/properties');
  return { ok: true, imported: r.imported };
}

const BlockSchema = z.object({
  propertyId: z.string().uuid(),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  summary: z.string().max(120).optional(),
});

export async function addManualBlock(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const p = BlockSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'validation' };
  if (p.data.endsOn <= p.data.startsOn) return { ok: false, error: 'range' };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId)))
    return { ok: false, error: 'forbidden' };
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('calendar_blocks').insert({
    property_id: p.data.propertyId,
    starts_on: p.data.startsOn,
    ends_on: p.data.endsOn,
    source: 'manual',
    summary: p.data.summary ?? 'Bloqueado por el anfitrión',
  });
  if (error) return { ok: false, error: 'store' };
  revalidatePath('/properties');
  return { ok: true };
}

export async function removeBlock(blockId: string): Promise<{ ok: boolean }> {
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data: block } = await supabase
    .from('calendar_blocks')
    .select('property_id, source')
    .eq('id', blockId)
    .maybeSingle();
  if (!block || block.source !== 'manual' || !(await ownsProperty(cid, block.property_id)))
    return { ok: false };
  await supabase.from('calendar_blocks').delete().eq('id', blockId);
  revalidatePath('/properties');
  return { ok: true };
}

/** Ensures the property has an export token and returns its public iCal feed path. */
export async function exportUrl(propertyId: string): Promise<{ ok: boolean; url?: string }> {
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data: prop } = await supabase
    .from('properties')
    .select('ical_token')
    .eq('id', propertyId)
    .maybeSingle();
  let token = prop?.ical_token as string | null | undefined;
  if (!token) {
    token = randomBytes(18).toString('base64url');
    await supabase.from('properties').update({ ical_token: token }).eq('id', propertyId);
  }
  return { ok: true, url: `/api/calendar/${token}` };
}
