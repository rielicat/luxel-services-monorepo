'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { WHATSAPP_TEMPLATE_KINDS } from '@luxel/shared/whatsapp';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase';

const HOSPITABLE_BASE = 'https://public.api.hospitable.com/v2';
const HOST_CONNECT_NUDGE_KIND = 'host_connect_reminder';

const CustomerSchema = z.object({ customerId: z.string().uuid() });
const EmailSchema = z.object({
  customerId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(200),
});
const InviteSchema = z.object({
  customerId: z.string().uuid(),
  inviteUrl: z
    .string()
    .trim()
    .max(2000)
    .regex(/^https:\/\/\S+$/),
});
const NoteSchema = z.object({
  customerId: z.string().uuid(),
  note: z.string().trim().max(2000),
});
const AssignSchema = z.object({
  customerId: z.string().uuid(),
  externalListingId: z.string().trim().min(1).max(128),
});

interface RemoteListing {
  platform?: string | null;
  platform_email?: string | null;
  platform_user_id?: string | null;
  platform_name?: string | null;
}

interface RemoteProperty {
  id: string;
  name?: string | null;
  public_name?: string | null;
  listings?: RemoteListing[] | null;
}

interface RemoteChannel {
  platform?: string | null;
  user_id?: string | null;
  name?: string | null;
  login?: string | null;
  email?: string | null;
}

export interface CentralListing {
  id: string;
  name: string;
  airbnbEmails: string[];
  airbnbUserIds: string[];
  airbnbName: string | null;
}

export interface CentralChannel {
  platform: string;
  userId: string | null;
  name: string | null;
  emails: string[];
}

export interface CentralView {
  configured: boolean;
  ok: boolean;
  listings: CentralListing[];
  channels: CentralChannel[];
}

const EMPTY_CENTRAL = (configured: boolean, ok: boolean): CentralView => ({
  configured,
  ok,
  listings: [],
  channels: [],
});

function providerApiKey(): string | null {
  return process.env.PROVIDER_API_KEY ?? process.env.HOSPITABLE_API_TOKEN ?? null;
}

function normalizeEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  return value || null;
}

function normalizeUserId(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  return value || null;
}

function hostFirstName(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  if (first) return first;
  const local = (email ?? '').split('@')[0]?.trim() ?? '';
  return local || 'anfitrión';
}

function digitsOnly(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (!trimmed.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else {
      digits = digits.replace(/^0+/, '');
      if (digits.length <= 10) digits = `56${digits}`;
    }
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

async function hospitableGet<T>(
  token: string,
  path: string,
): Promise<{ ok: boolean; data: T[]; nextUrl: string | null }> {
  try {
    const res = await fetch(path.startsWith('http') ? path : `${HOSPITABLE_BASE}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, data: [], nextUrl: null };
    const json = (await res.json()) as { data?: T[]; links?: { next?: string | null } };
    if (!Array.isArray(json.data)) return { ok: false, data: [], nextUrl: null };
    return { ok: true, data: json.data, nextUrl: json.links?.next ?? null };
  } catch {
    return { ok: false, data: [], nextUrl: null };
  }
}

function airbnbListings(property: RemoteProperty): RemoteListing[] {
  return (property.listings ?? []).filter((l) => (l.platform ?? '').toLowerCase() === 'airbnb');
}

async function readCentral(): Promise<CentralView> {
  const token = providerApiKey();
  if (!token) return EMPTY_CENTRAL(false, false);

  const properties: RemoteProperty[] = [];
  let url: string | null = '/properties?per_page=100&include=listings';
  for (let page = 0; url && page < 10; page++) {
    const res: Awaited<ReturnType<typeof hospitableGet<RemoteProperty>>> = await hospitableGet(
      token,
      url,
    );
    if (!res.ok) {
      console.error('admin.connections_hospitable_failed', { path: url });
      return EMPTY_CENTRAL(true, false);
    }
    properties.push(...res.data);
    url = res.nextUrl;
  }

  const channelsRes = await hospitableGet<RemoteChannel>(token, '/channels?per_page=100');
  if (!channelsRes.ok) console.warn('admin.connections_channels_failed');

  const listings: CentralListing[] = properties.map((property) => {
    const airbnb = airbnbListings(property);
    return {
      id: property.id,
      name: property.public_name ?? property.name ?? property.id,
      airbnbEmails: [
        ...new Set(
          airbnb
            .map((l) => normalizeEmail(l.platform_email))
            .filter((e): e is string => Boolean(e)),
        ),
      ],
      airbnbUserIds: [
        ...new Set(
          airbnb
            .map((l) => normalizeUserId(l.platform_user_id))
            .filter((u): u is string => Boolean(u)),
        ),
      ],
      airbnbName: airbnb.find((l) => l.platform_name)?.platform_name ?? null,
    };
  });

  const channels: CentralChannel[] = channelsRes.data.map((channel) => ({
    platform: (channel.platform ?? '').toLowerCase() || 'airbnb',
    userId: normalizeUserId(channel.user_id),
    name: channel.name ?? null,
    emails: [
      ...new Set(
        [normalizeEmail(channel.login), normalizeEmail(channel.email)].filter((e): e is string =>
          Boolean(e),
        ),
      ),
    ],
  }));

  return { configured: true, ok: true, listings, channels };
}

export async function loadCentralView(): Promise<CentralView> {
  const admin = await requireAdmin();
  if (!admin) return EMPTY_CENTRAL(false, false);
  return readCentral();
}

type Patch = Record<string, unknown>;

function stampFor(state: string, now: string): Patch {
  if (state === 'invite_sent') return { invite_sent_at: now };
  if (state === 'connecting') return { connecting_at: now };
  if (state === 'connected') return { connected_at: now };
  if (state === 'no_listings') return { no_listings_at: now };
  if (state === 'needs_operator') return { needs_operator_at: now };
  return {};
}

async function writeConnection(customerId: string, patch: Patch): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('host_connection')
    .upsert(
      { customer_id: customerId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'customer_id' },
    );
  if (error) {
    console.error('admin.connection_write_failed', {
      customerId,
      keys: Object.keys(patch).join(','),
      message: error.message,
    });
  }
  return !error;
}

async function readConnection(customerId: string): Promise<Patch | null | undefined> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('host_connection')
    .select(
      'state, claimed_airbnb_email, invite_url, invite_sent_at, channel_user_id, last_checked_at',
    )
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) {
    console.error('admin.connection_read_failed', { customerId, message: error.message });
    return undefined;
  }
  return (data ?? null) as Patch | null;
}

async function recordEvent(
  customerId: string,
  event: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('analytics_events').insert({
    event,
    distinct_id: customerId,
    customer_id: customerId,
    properties: { ...properties, actor: 'operator' },
    source: 'server',
  });
  if (error) console.warn('admin.connection_event_failed', { event, message: error.message });
}

function back(customerId: string, params: Record<string, string>): string {
  const query = new URLSearchParams({ id: customerId, ...params });
  return `/connections?${query.toString()}#c-${customerId}`;
}

export async function saveClaimedEmail(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const customerId = String(formData.get('customerId') ?? '');
  if (!admin) redirect(back(customerId, { error: 'denied' }));

  const parsed = EmailSchema.safeParse({ customerId, email: String(formData.get('email') ?? '') });
  if (!parsed.success) redirect(back(customerId, { error: 'invalid_email' }));

  const { email } = parsed.data;
  const supabase = createServiceClient();
  const [signupRes, claimRes] = await Promise.all([
    supabase.from('customers').select('id').eq('email', email),
    supabase.from('host_connection').select('customer_id').eq('claimed_airbnb_email', email),
  ]);
  if (signupRes.error || claimRes.error) {
    console.error('admin.connection_claim_read_failed', {
      customerId,
      message: signupRes.error?.message ?? claimRes.error?.message,
    });
    redirect(back(customerId, { error: 'write_failed' }));
  }

  const rivals = new Set(
    [
      ...((signupRes.data ?? []) as { id: string }[]).map((r) => r.id),
      ...((claimRes.data ?? []) as { customer_id: string }[]).map((r) => r.customer_id),
    ].filter((id) => id !== customerId),
  );
  if (rivals.size) {
    await writeConnection(customerId, {
      state: 'needs_operator',
      ...stampFor('needs_operator', new Date().toISOString()),
    });
    revalidatePath('/connections');
    redirect(back(customerId, { error: 'email_taken' }));
  }

  const now = new Date().toISOString();
  const ok = await writeConnection(customerId, {
    claimed_airbnb_email: email,
    claimed_at: now,
  });
  if (ok) await recordEvent(customerId, 'host_connect_email_claimed', { email });
  revalidatePath('/connections');
  redirect(back(customerId, ok ? { ok: 'email_saved' } : { error: 'write_failed' }));
}

export async function saveInviteLink(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const customerId = String(formData.get('customerId') ?? '');
  if (!admin) redirect(back(customerId, { error: 'denied' }));

  const parsed = InviteSchema.safeParse({
    customerId,
    inviteUrl: String(formData.get('inviteUrl') ?? ''),
  });
  if (!parsed.success) redirect(back(customerId, { error: 'invalid_url' }));

  const ok = await writeConnection(parsed.data.customerId, { invite_url: parsed.data.inviteUrl });
  revalidatePath('/connections');
  redirect(back(customerId, ok ? { ok: 'invite_saved' } : { error: 'write_failed' }));
}

export async function markInviteSent(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const customerId = String(formData.get('customerId') ?? '');
  if (!admin) redirect(back(customerId, { error: 'denied' }));

  const parsed = CustomerSchema.safeParse({ customerId });
  if (!parsed.success) redirect(back(customerId, { error: 'invalid' }));

  const current = await readConnection(customerId);
  if (current === undefined) redirect(back(customerId, { error: 'write_failed' }));
  if (!current?.invite_url) redirect(back(customerId, { error: 'no_invite' }));

  const now = new Date().toISOString();
  const ok = await writeConnection(customerId, {
    state: 'invite_sent',
    ...stampFor('invite_sent', now),
  });
  if (ok) await recordEvent(customerId, 'host_connect_invite_sent', { sentAt: now });
  revalidatePath('/connections');
  redirect(back(customerId, ok ? { ok: 'invite_sent' } : { error: 'write_failed' }));
}

export async function saveConnectionNote(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const customerId = String(formData.get('customerId') ?? '');
  if (!admin) redirect(back(customerId, { error: 'denied' }));

  const parsed = NoteSchema.safeParse({ customerId, note: String(formData.get('note') ?? '') });
  if (!parsed.success) redirect(back(customerId, { error: 'invalid' }));

  const ok = await writeConnection(customerId, { operator_note: parsed.data.note || null });
  revalidatePath('/connections');
  redirect(back(customerId, ok ? { ok: 'note_saved' } : { error: 'write_failed' }));
}

export async function assignListingToHost(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const customerId = String(formData.get('customerId') ?? '');
  if (!admin) redirect(back(customerId, { error: 'denied' }));

  const parsed = AssignSchema.safeParse({
    customerId,
    externalListingId: String(formData.get('externalListingId') ?? ''),
  });
  if (!parsed.success) redirect(back(customerId, { error: 'invalid' }));

  const { customerId: owner, externalListingId } = parsed.data;
  const supabase = createServiceClient();
  const { error } = await supabase.from('listing_assignments').insert({
    external_listing_id: externalListingId,
    customer_id: owner,
    assigned_at: new Date().toISOString(),
    assigned_by: `operator:${admin.email}`,
  });
  if (error) {
    console.error('admin.connection_assign_failed', {
      externalListingId,
      customerId: owner,
      message: error.message,
    });
    redirect(back(owner, { error: 'assign_failed' }));
  }

  await supabase
    .from('properties')
    .delete()
    .eq('external_listing_id', externalListingId)
    .neq('owner_id', owner);
  await recordEvent(owner, 'host_connect_listing_assigned', { externalListingId });

  const central = await readCentral();
  const listing = central.listings.find((l) => l.id === externalListingId);
  const now = new Date().toISOString();
  const stateOk = await writeConnection(owner, {
    state: 'connected',
    ...stampFor('connected', now),
    last_checked_at: now,
    ...(listing?.airbnbUserIds[0] ? { channel_user_id: listing.airbnbUserIds[0] } : {}),
  });
  revalidatePath('/connections');
  revalidatePath('/plans');
  redirect(back(owner, stateOk ? { ok: 'assigned' } : { error: 'assigned_state_failed' }));
}

export async function reverifyConnection(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const customerId = String(formData.get('customerId') ?? '');
  if (!admin) redirect(back(customerId, { error: 'denied' }));

  const parsed = CustomerSchema.safeParse({ customerId });
  if (!parsed.success) redirect(back(customerId, { error: 'invalid' }));

  const central = await readCentral();
  if (!central.configured) redirect(back(customerId, { error: 'hospitable_off' }));
  if (!central.ok) redirect(back(customerId, { error: 'hospitable_failed' }));

  const supabase = createServiceClient();
  const [customerRes, assignmentsRes] = await Promise.all([
    supabase.from('customers').select('email').eq('id', customerId).maybeSingle(),
    supabase
      .from('listing_assignments')
      .select('external_listing_id')
      .eq('customer_id', customerId),
  ]);
  const current = await readConnection(customerId);
  if (customerRes.error || assignmentsRes.error || current === undefined) {
    console.error('admin.connection_verify_read_failed', {
      customerId,
      message: customerRes.error?.message ?? assignmentsRes.error?.message,
    });
    redirect(back(customerId, { error: 'write_failed' }));
  }

  const emails = new Set(
    [
      normalizeEmail((customerRes.data as { email?: string | null } | null)?.email),
      normalizeEmail(current?.claimed_airbnb_email as string | null),
    ].filter((e): e is string => Boolean(e)),
  );
  const channelUserId = normalizeUserId(current?.channel_user_id as string | null);
  const assigned = new Set(
    ((assignmentsRes.data ?? []) as { external_listing_id: string }[]).map(
      (a) => a.external_listing_id,
    ),
  );

  const mine = central.listings.filter(
    (listing) =>
      assigned.has(listing.id) ||
      (channelUserId !== null && listing.airbnbUserIds.includes(channelUserId)) ||
      listing.airbnbEmails.some((email) => emails.has(email)),
  );
  const linked = central.channels.find(
    (channel) =>
      (channelUserId !== null && channel.userId === channelUserId) ||
      channel.emails.some((email) => emails.has(email)),
  );

  const previous = String(current?.state ?? 'not_started');
  const state = mine.length
    ? 'connected'
    : linked
      ? 'no_listings'
      : previous === 'connected' || previous === 'no_listings'
        ? 'needs_operator'
        : previous;

  const now = new Date().toISOString();
  const nextUserId =
    mine.find((l) => l.airbnbUserIds.length)?.airbnbUserIds[0] ?? linked?.userId ?? channelUserId;
  const ok = await writeConnection(customerId, {
    state,
    ...stampFor(state, now),
    last_checked_at: now,
    ...(nextUserId ? { channel_user_id: nextUserId } : {}),
  });
  await recordEvent(customerId, 'host_connect_verified', {
    state,
    listings: mine.length,
    unassigned: mine.filter((l) => !assigned.has(l.id)).length,
  });
  revalidatePath('/connections');
  redirect(back(customerId, ok ? { ok: 'verified', state } : { error: 'write_failed' }));
}

export async function sendConnectionNudge(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const customerId = String(formData.get('customerId') ?? '');
  if (!admin) redirect(back(customerId, { error: 'denied' }));

  const parsed = CustomerSchema.safeParse({ customerId });
  if (!parsed.success) redirect(back(customerId, { error: 'invalid' }));

  const supabase = createServiceClient();
  const customerRes = await supabase
    .from('customers')
    .select('phone, full_name, email')
    .eq('id', customerId)
    .maybeSingle();
  const current = await readConnection(customerId);
  if (customerRes.error || current === undefined) {
    redirect(back(customerId, { error: 'write_failed' }));
  }

  const customer = (customerRes.data ?? null) as {
    phone?: string | null;
    full_name?: string | null;
    email?: string | null;
  } | null;
  const inviteUrl = String(current?.invite_url ?? '').trim();
  if (!inviteUrl) redirect(back(customerId, { error: 'no_invite' }));

  const phone = digitsOnly(customer?.phone);
  if (!phone) redirect(back(customerId, { error: 'no_phone' }));

  const kinds: readonly string[] = WHATSAPP_TEMPLATE_KINDS;
  if (!kinds.includes(HOST_CONNECT_NUDGE_KIND)) {
    await recordEvent(customerId, 'host_connect_nudge', { outcome: 'template_not_approved' });
    revalidatePath('/connections');
    redirect(back(customerId, { error: 'template_not_approved' }));
  }

  const url = process.env.WHATSAPP_WORKER_SEND_URL;
  const token = process.env.INTERNAL_SEND_TOKEN;
  if (!url || !token) {
    await recordEvent(customerId, 'host_connect_nudge', { outcome: 'bridge_off' });
    redirect(back(customerId, { error: 'bridge_off' }));
  }

  let wamid: string | null = null;
  try {
    const res = await fetch(url!, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token! },
      body: JSON.stringify({
        to: phone,
        template: {
          kind: HOST_CONNECT_NUDGE_KIND,
          params: [hostFirstName(customer?.full_name, customer?.email), inviteUrl],
        },
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { wamid?: string | null };
      wamid = json.wamid ?? null;
    }
  } catch {
    wamid = null;
  }

  await recordEvent(customerId, 'host_connect_nudge', { outcome: wamid ? 'sent' : 'send_failed' });
  revalidatePath('/connections');
  redirect(back(customerId, wamid ? { ok: 'nudged' } : { error: 'send_failed' }));
}
