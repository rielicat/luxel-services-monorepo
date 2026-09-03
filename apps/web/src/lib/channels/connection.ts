import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { providerApiKey } from './credentials';
import {
  airbnbIdentities,
  listHospitableChannels,
  listHospitableProperties,
  normalizeChannelEmail,
  normalizeChannelUserId,
  type HospitableProperty,
} from './hospitable';
import { allowedListingIds } from './scope';

export const HOST_CONNECTION_STATES = [
  'not_started',
  'invite_sent',
  'connecting',
  'connected',
  'no_listings',
  'needs_operator',
] as const;

export type HostConnectionState = (typeof HOST_CONNECTION_STATES)[number];

export interface HostConnection {
  customerId: string;
  state: HostConnectionState;
  claimedAirbnbEmail: string | null;
  claimedAt: string | null;
  inviteUrl: string | null;
  inviteSentAt: string | null;
  connectingAt: string | null;
  connectedAt: string | null;
  noListingsAt: string | null;
  needsOperatorAt: string | null;
  channelUserId: string | null;
  lastCheckedAt: string | null;
  operatorNote: string | null;
}

const TABLE = 'host_connection';

const COLUMNS =
  'customer_id, state, claimed_airbnb_email, claimed_at, invite_url, invite_sent_at, connecting_at, connected_at, no_listings_at, needs_operator_at, channel_user_id, last_checked_at, operator_note';

type Row = Record<string, unknown>;

function isState(value: unknown): value is HostConnectionState {
  return HOST_CONNECTION_STATES.includes(value as HostConnectionState);
}

function text(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' && value ? value : null;
}

function blank(customerId: string): HostConnection {
  return {
    customerId,
    state: 'not_started',
    claimedAirbnbEmail: null,
    claimedAt: null,
    inviteUrl: null,
    inviteSentAt: null,
    connectingAt: null,
    connectedAt: null,
    noListingsAt: null,
    needsOperatorAt: null,
    channelUserId: null,
    lastCheckedAt: null,
    operatorNote: null,
  };
}

function toConnection(row: Row): HostConnection {
  const state = row.state;
  return {
    customerId: String(row.customer_id),
    state: isState(state) ? state : 'not_started',
    claimedAirbnbEmail: text(row, 'claimed_airbnb_email'),
    claimedAt: text(row, 'claimed_at'),
    inviteUrl: text(row, 'invite_url'),
    inviteSentAt: text(row, 'invite_sent_at'),
    connectingAt: text(row, 'connecting_at'),
    connectedAt: text(row, 'connected_at'),
    noListingsAt: text(row, 'no_listings_at'),
    needsOperatorAt: text(row, 'needs_operator_at'),
    channelUserId: text(row, 'channel_user_id'),
    lastCheckedAt: text(row, 'last_checked_at'),
    operatorNote: text(row, 'operator_note'),
  };
}

export async function getHostConnection(customerId: string): Promise<HostConnection | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) return null;
  return data ? toConnection(data as Row) : blank(customerId);
}

export async function listHostConnections(
  states?: HostConnectionState[],
): Promise<HostConnection[] | null> {
  const supabase = createSupabaseServiceRoleClient();
  const query = supabase.from(TABLE).select(COLUMNS).order('updated_at', { ascending: false });
  const { data, error } = await (states?.length ? query.in('state', states) : query);
  if (error) return null;
  return ((data ?? []) as Row[]).map(toConnection);
}

async function write(customerId: string, patch: Row): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { customer_id: customerId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'customer_id' },
    );
  return !error;
}

function stampFor(state: HostConnectionState, now: string): Row {
  if (state === 'invite_sent') return { invite_sent_at: now };
  if (state === 'connecting') return { connecting_at: now };
  if (state === 'connected') return { connected_at: now };
  if (state === 'no_listings') return { no_listings_at: now };
  if (state === 'needs_operator') return { needs_operator_at: now };
  return {};
}

async function transition(
  customerId: string,
  state: HostConnectionState,
  patch: Row = {},
): Promise<boolean> {
  const current = await getHostConnection(customerId);
  const now = new Date().toISOString();
  const stamp = current?.state === state ? {} : stampFor(state, now);
  return write(customerId, { state, ...stamp, ...patch });
}

async function ownersByColumn(
  column: 'claimed_airbnb_email' | 'channel_user_id',
  values: string[],
  vouchedOnly = false,
): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>();
  if (!values.length) return out;
  const supabase = createSupabaseServiceRoleClient();
  const query = supabase.from(TABLE).select(`customer_id, ${column}`).in(column, values);
  const { data, error } = await (vouchedOnly ? query.not('invite_url', 'is', null) : query);
  if (error) return null;
  for (const row of (data ?? []) as Row[]) {
    const key = text(row, column);
    if (!key) continue;
    out.set(key, [...(out.get(key) ?? []), String(row.customer_id)]);
  }
  return out;
}

export function claimedEmailOwners(emails: string[]): Promise<Map<string, string[]> | null> {
  return ownersByColumn('claimed_airbnb_email', emails, true);
}

export function channelUserOwners(userIds: string[]): Promise<Map<string, string[]> | null> {
  return ownersByColumn('channel_user_id', userIds);
}

async function customerExists(customerId: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase.from('customers').select('id').eq('id', customerId).maybeSingle();
  return Boolean(data);
}

async function customerEmail(customerId: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('customers')
    .select('email')
    .eq('id', customerId)
    .maybeSingle();
  return normalizeChannelEmail(data?.email as string | null | undefined);
}

async function otherCustomersWithEmail(customerId: string, email: string): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase.from('customers').select('id').eq('email', email);
  return ((data ?? []) as Row[]).map((r) => String(r.id)).filter((id) => id !== customerId);
}

async function otherClaimants(customerId: string, email: string): Promise<string[]> {
  const owners = await claimedEmailOwners([email]);
  return (owners?.get(email) ?? []).filter((id) => id !== customerId);
}

export async function markNeedsOperator(customerId: string): Promise<boolean> {
  const current = await getHostConnection(customerId);
  if (current?.state === 'connected') return false;
  if (current?.state === 'needs_operator') return false;
  return transition(customerId, 'needs_operator');
}

export interface ClaimResult {
  ok: boolean;
  state: HostConnectionState;
  conflict: boolean;
  error?: 'invalid_email' | 'write_failed' | 'unknown_customer';
}

export async function claimAirbnbEmail(customerId: string, email: string): Promise<ClaimResult> {
  const normalized = normalizeChannelEmail(email);
  const current = (await getHostConnection(customerId)) ?? blank(customerId);
  if (!normalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    return { ok: false, state: current.state, conflict: false, error: 'invalid_email' };
  }

  if (!(await customerExists(customerId))) {
    return { ok: false, state: current.state, conflict: false, error: 'unknown_customer' };
  }

  const rivals = [
    ...new Set([
      ...(await otherCustomersWithEmail(customerId, normalized)),
      ...(await otherClaimants(customerId, normalized)),
    ]),
  ];
  const conflict = rivals.length > 0;
  const state: HostConnectionState =
    conflict && current.state !== 'connected' ? 'needs_operator' : current.state;

  const now = new Date().toISOString();
  const ok = await transition(customerId, state, {
    claimed_airbnb_email: normalized,
    claimed_at: now,
    ...(conflict ? { operator_note: `Email ya reclamado por ${rivals.join(', ')}` } : {}),
  });
  if (!ok) return { ok: false, state: current.state, conflict, error: 'write_failed' };

  if (conflict) console.warn('connection.claim_conflict', { customerId, rivals: rivals.length });
  return { ok: true, state, conflict };
}

export async function recordInvite(customerId: string, inviteUrl: string): Promise<boolean> {
  const url = inviteUrl.trim();
  if (!/^https:\/\/\S+$/.test(url)) return false;
  const current = await getHostConnection(customerId);
  const state: HostConnectionState =
    current && ['connected', 'no_listings'].includes(current.state) ? current.state : 'invite_sent';
  return transition(customerId, state, {
    invite_url: url,
    invite_sent_at: new Date().toISOString(),
  });
}

export async function markConnecting(customerId: string): Promise<boolean> {
  const current = await getHostConnection(customerId);
  if (current && ['connected', 'no_listings'].includes(current.state)) return true;
  return transition(customerId, 'connecting');
}

export async function setOperatorNote(customerId: string, note: string): Promise<boolean> {
  return write(customerId, { operator_note: note.trim() || null });
}

export interface ConfirmInput {
  channelUserId: string | null;
  listings: number;
}

export async function confirmConnection(
  customerId: string,
  input: ConfirmInput,
): Promise<HostConnectionState | null> {
  const userId = normalizeChannelUserId(input.channelUserId);
  if (userId) {
    const owners = await channelUserOwners([userId]);
    if (!owners) return null;
    const rivals = (owners.get(userId) ?? []).filter((id) => id !== customerId);
    if (rivals.length) {
      await markNeedsOperator(customerId);
      for (const rival of rivals) await markNeedsOperator(rival);
      return 'needs_operator';
    }
  }

  const state: HostConnectionState = input.listings > 0 ? 'connected' : 'no_listings';
  const ok = await transition(customerId, state, {
    ...(userId ? { channel_user_id: userId } : {}),
    last_checked_at: new Date().toISOString(),
  });
  return ok ? state : null;
}

export type VerifyOutcome = 'connected' | 'no_listings' | 'not_found' | 'unavailable';

export interface VerifyResult {
  ok: boolean;
  outcome: VerifyOutcome;
  state: HostConnectionState;
  listings: number;
  channelUserId: string | null;
}

async function knownEmails(customerId: string, current: HostConnection): Promise<Set<string>> {
  const candidates = new Set<string>();
  const signup = await customerEmail(customerId);
  if (signup) candidates.add(signup);
  if (current.claimedAirbnbEmail && current.inviteUrl) candidates.add(current.claimedAirbnbEmail);

  const out = new Set<string>();
  for (const email of candidates) {
    const rivals = [
      ...(await otherCustomersWithEmail(customerId, email)),
      ...(await otherClaimants(customerId, email)),
    ];
    if (!rivals.length) out.add(email);
  }
  return out;
}

function firstUserId(properties: HospitableProperty[]): string | null {
  for (const property of properties) {
    for (const identity of airbnbIdentities(property)) {
      if (identity.userId) return identity.userId;
    }
  }
  return null;
}

async function reconcileAssignments(
  properties: HospitableProperty[],
  assigned: Set<string>,
): Promise<void> {
  if (properties.every((p) => assigned.has(p.id))) return;
  try {
    const { autoAssignListings } = await import('./auto-assign');
    await autoAssignListings();
  } catch {}
}

export async function verifyConnection(customerId: string): Promise<VerifyResult> {
  const current = (await getHostConnection(customerId)) ?? blank(customerId);
  const unavailable: VerifyResult = {
    ok: false,
    outcome: 'unavailable',
    state: current.state,
    listings: 0,
    channelUserId: current.channelUserId,
  };

  const token = providerApiKey();
  if (!token) return unavailable;

  const remote = await listHospitableProperties(token);
  if (!remote) return unavailable;

  const emails = await knownEmails(customerId, current);
  const assigned = new Set((await allowedListingIds(customerId)) ?? []);
  const mine = remote.filter((property) => {
    if (assigned.has(property.id)) return true;
    return airbnbIdentities(property).some(
      (identity) =>
        (current.channelUserId !== null && identity.userId === current.channelUserId) ||
        (identity.email !== null && emails.has(identity.email)),
    );
  });

  if (mine.length) {
    const channelUserId = firstUserId(mine) ?? current.channelUserId;
    const state = await confirmConnection(customerId, { channelUserId, listings: mine.length });
    if (!state) return unavailable;
    await reconcileAssignments(mine, assigned);
    return {
      ok: true,
      outcome: state === 'needs_operator' ? 'not_found' : 'connected',
      state,
      listings: mine.length,
      channelUserId,
    };
  }

  const channels = await listHospitableChannels(token);
  if (!channels) return unavailable;
  const linked = channels.find((channel) => {
    const userId = normalizeChannelUserId(channel.user_id);
    if (current.channelUserId !== null && userId === current.channelUserId) return true;
    const login = normalizeChannelEmail(channel.login);
    const mail = normalizeChannelEmail(channel.email);
    return Boolean((login && emails.has(login)) || (mail && emails.has(mail)));
  });

  if (linked) {
    const channelUserId = normalizeChannelUserId(linked.user_id) ?? current.channelUserId;
    const state = await confirmConnection(customerId, { channelUserId, listings: 0 });
    if (!state) return unavailable;
    return {
      ok: true,
      outcome: state === 'needs_operator' ? 'not_found' : 'no_listings',
      state,
      listings: 0,
      channelUserId,
    };
  }

  const lost = current.state === 'connected' || current.state === 'no_listings';
  const state: HostConnectionState = lost ? 'needs_operator' : current.state;
  await transition(customerId, state, { last_checked_at: new Date().toISOString() });
  return {
    ok: true,
    outcome: 'not_found',
    state,
    listings: 0,
    channelUserId: current.channelUserId,
  };
}
