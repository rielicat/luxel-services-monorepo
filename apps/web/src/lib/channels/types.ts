import 'server-only';

export type ProviderId = 'hospitable';

interface ChannelRef {
  provider: ProviderId;
  id: string;
}

const REF_PREFIX: Record<ProviderId, string> = {
  hospitable: 'hosp',
};
const PREFIX_TO_PROVIDER = Object.fromEntries(
  Object.entries(REF_PREFIX).map(([p, prefix]) => [prefix, p as ProviderId]),
) as Record<string, ProviderId>;

export function encodeRef(ref: ChannelRef): string {
  return `${REF_PREFIX[ref.provider]}:${ref.id}`;
}

export function decodeRef(stored: string): ChannelRef | null {
  const sep = stored.indexOf(':');
  if (sep <= 0) return null;
  const provider = PREFIX_TO_PROVIDER[stored.slice(0, sep)];
  const id = stored.slice(sep + 1);
  if (!provider || !id) return null;
  return { provider, id };
}

export function refPattern(provider: ProviderId): string {
  return `${REF_PREFIX[provider]}:%`;
}

export type ChannelScope = 'own' | 'central';
export interface ChannelAccess {
  token: string;
  scope: ChannelScope;
}

interface ChannelCapabilities {
  sendsGuestMessages: boolean;
  hasHostIdentity: boolean;
  webhooks: boolean;
}

export interface ChannelListing {
  ref: ChannelRef;
  name: string | null;
  hostEmail: string | null;
}

export type ReservationState = 'confirmed' | 'cancelled' | 'pending' | 'unknown';

export interface ChannelReservation {
  ref: ChannelRef;
  listingRef: ChannelRef;
  arrivalDate: string;
  departureDate: string;
  state: ReservationState;
  confirmationCode: string | null;
}

export interface ChannelSyncOutcome {
  ok: boolean;
  properties: number;
  reservations: number;
  contacts: number;
  replies: number;
  relinked: number;
}

export interface ChannelPlugin {
  readonly id: ProviderId;
  readonly capabilities: ChannelCapabilities;

  access(customerId: string): Promise<ChannelAccess | null>;

  sync(customerId: string, access: ChannelAccess, now: Date): Promise<ChannelSyncOutcome>;

  autoAssign?(): Promise<{ assigned: number } | null>;
}
