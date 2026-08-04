import 'server-only';

/**
 * The provider-agnostic channel contract.
 *
 * Written after nearly migrating providers. The lesson was not that the client
 * was hard to replace — it was that provider identity had leaked into the DATA:
 * `hosp:` prefixes on reservation ids, vendor UUIDs in external_listing_id, and
 * a tenant boundary keyed on both. So this file owns two things: the reference
 * format that keeps vendor identity explicit instead of string-concatenated at
 * call sites, and the plugin shape the scheduled sync drives.
 *
 * ADDING A PROVIDER is four edits and no rewrite:
 *   1. a member of `ProviderId` and its prefix in `REF_PREFIX` below,
 *   2. an adapter module implementing `ChannelPlugin`,
 *   3. one line in `./registry.ts`,
 *   4. the `provider` check constraint in supabase/migrations/0018.
 * Nothing outside those four knows the vendor's name.
 */

export type ProviderId = 'hospitable';

/**
 * A reference to something living in a provider's system. Stored as
 * `"<provider>:<id>"`, never assembled by hand — see `encodeRef`/`decodeRef`.
 */
export interface ChannelRef {
  provider: ProviderId;
  id: string;
}

/** `hosp:` predates this type and is what live rows contain — it is data, not a
 *  naming choice, so it cannot be tidied. */
const REF_PREFIX: Record<ProviderId, string> = {
  hospitable: 'hosp',
};
const PREFIX_TO_PROVIDER = Object.fromEntries(
  Object.entries(REF_PREFIX).map(([p, prefix]) => [prefix, p as ProviderId]),
) as Record<string, ProviderId>;

export function encodeRef(ref: ChannelRef): string {
  return `${REF_PREFIX[ref.provider]}:${ref.id}`;
}

/** Null for anything unrecognised — an unknown prefix must never be guessed at,
 *  because callers use these to decide what to prune. A ref left behind by a
 *  provider that is no longer registered decodes to null, so a prune scoped to
 *  the active provider cannot match it. */
export function decodeRef(stored: string): ChannelRef | null {
  const sep = stored.indexOf(':');
  if (sep <= 0) return null;
  const provider = PREFIX_TO_PROVIDER[stored.slice(0, sep)];
  const id = stored.slice(sep + 1);
  if (!provider || !id) return null;
  return { provider, id };
}

/** Matches the stored form for one provider — for `.like()` scoping of prunes. */
export function refPattern(provider: ProviderId): string {
  return `${REF_PREFIX[provider]}:%`;
}

/**
 * Channel access scope — the tenant boundary for the mirror.
 *
 *  - `own`     the customer's own stored connection. Everything it returns is
 *              theirs by definition.
 *  - `central` Luxel's operator credential. What it returns is NOT theirs by
 *              default, so callers MUST intersect with `allowedListingIds` and
 *              may never import or prune outside it.
 */
export type ChannelScope = 'own' | 'central';
export interface ChannelAccess {
  token: string;
  scope: ChannelScope;
}

/**
 * What a provider can actually do. Every flag here gates a real branch — a
 * capability nothing reads is a comment pretending to be code.
 */
export interface ChannelCapabilities {
  /** Can post into the guest thread on the OTA. Without it the product's
   *  check-in delivery and AI replies do not function at all. */
  sendsGuestMessages: boolean;
  /** Carries a per-listing host identity usable for auto-attribution. When
   *  false, assignment is operator-asserted and `autoAssign` is not called. */
  hasHostIdentity: boolean;
  /** Delivers webhooks; when false the sync must poll. */
  webhooks: boolean;
}

/**
 * A listing, normalised. Only the fields the provider-agnostic machinery
 * actually reads — the vendor's full shape stays in its own adapter.
 */
export interface ChannelListing {
  ref: ChannelRef;
  name: string | null;
  /** The host's own identity on the channel, when the provider exposes it.
   *  Null means attribution must be asserted by an operator. */
  hostEmail: string | null;
}

/** Normalised across providers, because cancellation drives revocation of a
 *  guest's door-code link. A raw vendor string cannot be branched on safely. */
export type ReservationState = 'confirmed' | 'cancelled' | 'pending' | 'unknown';

export interface ChannelReservation {
  ref: ChannelRef;
  listingRef: ChannelRef;
  /** ISO date, not datetime — stays are day-grained everywhere in this product. */
  arrivalDate: string;
  departureDate: string;
  state: ReservationState;
  /**
   * The OTA's own confirmation code (Airbnb's HM… code). The ONLY identifier
   * that survives a change of provider, because the vendor's reservation id does
   * not. Capturing it while still on the current provider is what makes a
   * cutover possible at all — see `./relink.ts`.
   */
  confirmationCode: string | null;
}

/** What one customer's mirror pass produced, in terms no vendor owns. */
export interface ChannelSyncOutcome {
  ok: boolean;
  properties: number;
  reservations: number;
  /** Guest messages the AI answered during this pass. */
  replies: number;
  /** Properties re-keyed from a previous provider's ids onto this one's. */
  relinked: number;
}

/**
 * One channel provider, as a plugin.
 *
 * The seam is deliberately drawn around the whole MIRROR PASS rather than around
 * a set of REST calls. Replacing a provider is not "swap the HTTP client" — the
 * expensive parts are attribution, tenant scoping, and knowing which reservation
 * has already had a guest messaged. A plugin owns all of it and reports back in
 * `ChannelSyncOutcome`; the scheduler below it knows nothing about any vendor.
 */
export interface ChannelPlugin {
  readonly id: ProviderId;
  readonly capabilities: ChannelCapabilities;

  /** How this customer's listings are reachable, or null if they are not. */
  access(customerId: string): Promise<ChannelAccess | null>;

  /** One full mirror pass for one customer. Must never prune off an incomplete
   *  read — see the `T[] | null` rule in the adapter. */
  sync(customerId: string, access: ChannelAccess, now: Date): Promise<ChannelSyncOutcome>;

  /** Attribute unassigned listings to customers from the channel's own host
   *  identity. Present only when `capabilities.hasHostIdentity`. */
  autoAssign?(): Promise<{ assigned: number } | null>;
}
