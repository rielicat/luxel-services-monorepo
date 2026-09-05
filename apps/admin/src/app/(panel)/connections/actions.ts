'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { recordEvent } from '@luxel/core/analytics/store';
import {
  claimAirbnbEmail,
  confirmConnection,
  getHostConnection,
  markInviteSent as setInviteSent,
  saveInviteUrl,
  setOperatorNote,
  verifyConnection,
} from '@luxel/core/channels/connection';
import { providerApiKey } from '@luxel/core/channels/credentials';
import {
  airbnbIdentities,
  listHospitableChannels,
  listHospitableProperties,
  normalizeChannelEmail,
  normalizeChannelUserId,
} from '@luxel/core/channels/hospitable';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase';

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

async function readCentral(): Promise<CentralView> {
  const token = providerApiKey();
  if (!token) return EMPTY_CENTRAL(false, false);

  const properties = await listHospitableProperties(token);
  if (!properties) {
    console.error('admin.connections_hospitable_failed');
    return EMPTY_CENTRAL(true, false);
  }

  const remoteChannels = await listHospitableChannels(token);
  if (!remoteChannels) console.warn('admin.connections_channels_failed');

  const listings: CentralListing[] = properties.map((property) => {
    const identities = airbnbIdentities(property);
    return {
      id: property.id,
      name: property.public_name ?? property.name ?? property.id,
      airbnbEmails: [...new Set(identities.map((i) => i.email).filter((e) => e !== null))],
      airbnbUserIds: [...new Set(identities.map((i) => i.userId).filter((u) => u !== null))],
      airbnbName: identities.find((i) => i.name)?.name ?? null,
    };
  });

  const channels: CentralChannel[] = (remoteChannels ?? []).map((channel) => ({
    platform: (channel.platform ?? '').toLowerCase() || 'airbnb',
    userId: normalizeChannelUserId(channel.user_id),
    name: channel.name,
    emails: [
      ...new Set(
        [normalizeChannelEmail(channel.login), normalizeChannelEmail(channel.email)].filter(
          (e) => e !== null,
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

async function operatorEvent(
  customerId: string,
  event: string,
  properties: Record<string, unknown>,
): Promise<void> {
  await recordEvent({
    event,
    distinctId: customerId,
    customerId,
    properties: { ...properties, actor: 'operator' },
    source: 'server',
  });
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

  const result = await claimAirbnbEmail(parsed.data.customerId, parsed.data.email);
  revalidatePath('/connections');
  if (result.conflict) redirect(back(customerId, { error: 'email_taken' }));
  if (!result.ok) redirect(back(customerId, { error: result.error ?? 'write_failed' }));

  await operatorEvent(customerId, 'host_connect_email_claimed', { email: parsed.data.email });
  redirect(back(customerId, { ok: 'email_saved' }));
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

  const ok = await saveInviteUrl(parsed.data.customerId, parsed.data.inviteUrl);
  revalidatePath('/connections');
  redirect(back(customerId, ok ? { ok: 'invite_saved' } : { error: 'write_failed' }));
}

export async function markInviteSent(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const customerId = String(formData.get('customerId') ?? '');
  if (!admin) redirect(back(customerId, { error: 'denied' }));

  const parsed = CustomerSchema.safeParse({ customerId });
  if (!parsed.success) redirect(back(customerId, { error: 'invalid' }));

  const current = await getHostConnection(customerId);
  if (!current) redirect(back(customerId, { error: 'write_failed' }));
  if (!current.inviteUrl) redirect(back(customerId, { error: 'no_invite' }));

  const ok = await setInviteSent(customerId);
  if (ok) await operatorEvent(customerId, 'host_connect_invite_sent', {});
  revalidatePath('/connections');
  redirect(back(customerId, ok ? { ok: 'invite_sent' } : { error: 'write_failed' }));
}

export async function saveConnectionNote(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const customerId = String(formData.get('customerId') ?? '');
  if (!admin) redirect(back(customerId, { error: 'denied' }));

  const parsed = NoteSchema.safeParse({ customerId, note: String(formData.get('note') ?? '') });
  if (!parsed.success) redirect(back(customerId, { error: 'invalid' }));

  const ok = await setOperatorNote(parsed.data.customerId, parsed.data.note);
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
  await operatorEvent(owner, 'host_connect_listing_assigned', { externalListingId });

  const central = await readCentral();
  const listing = central.listings.find((l) => l.id === externalListingId);
  const state = await confirmConnection(owner, {
    channelUserId: listing?.airbnbUserIds[0] ?? null,
    listings: 1,
  });
  revalidatePath('/connections');
  revalidatePath('/plans');
  redirect(back(owner, state ? { ok: 'assigned' } : { error: 'assigned_state_failed' }));
}

export async function reverifyConnection(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const customerId = String(formData.get('customerId') ?? '');
  if (!admin) redirect(back(customerId, { error: 'denied' }));

  const parsed = CustomerSchema.safeParse({ customerId });
  if (!parsed.success) redirect(back(customerId, { error: 'invalid' }));

  if (!providerApiKey()) redirect(back(customerId, { error: 'hospitable_off' }));

  const result = await verifyConnection(parsed.data.customerId);
  revalidatePath('/connections');
  if (!result.ok) redirect(back(customerId, { error: 'hospitable_failed' }));

  await operatorEvent(customerId, 'host_connect_verified', {
    state: result.state,
    listings: result.listings,
  });
  redirect(back(customerId, { ok: 'verified', state: result.state }));
}
