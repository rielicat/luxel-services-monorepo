import 'server-only';

/**
 * The provider-agnostic channel contract.
 *
 * Written after migrating providers twice in one month. The lesson was not that
 * the client was hard to replace — it was that provider identity had leaked into
 * the DATA: `hosp:` prefixes on reservation ids, vendor UUIDs in
 * external_listing_id, and a tenant boundary keyed on both. So this file owns
 * two things: the operations every provider must offer, and the reference format
 * that keeps vendor identity explicit instead of string-concatenated at call
 * sites.
 */

export type ProviderId = 'hospitable' | 'beds24' | 'channex';

/**
 * A reference to something living in a provider's system. Stored as
 * `"<provider>:<id>"`, never assembled by hand — see `encodeRef`/`decodeRef`.
 */
export interface ChannelRef {
  provider: ProviderId;
  id: string;
}

/** Legacy prefix kept because live rows use it. `hosp:` predates this type. */
const REF_PREFIX: Record<ProviderId, string> = {
  hospitable: 'hosp',
  beds24: 'b24',
  channex: 'cnx',
};
const PREFIX_TO_PROVIDER = Object.fromEntries(
  Object.entries(REF_PREFIX).map(([p, prefix]) => [prefix, p as ProviderId]),
) as Record<string, ProviderId>;

export function encodeRef(ref: ChannelRef): string {
  return `${REF_PREFIX[ref.provider]}:${ref.id}`;
}

/** Null for anything unrecognised — an unknown prefix must never be guessed at,
 *  because callers use these to decide what to prune. */
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
 * What a provider can actually do. Read from the UI, not assumed: on a
 * push-model channel manager the calendar returns the prices WE pushed, so
 * "published vs recommended" is a meaningless comparison and the property
 * calendar must not pretend otherwise.
 */
export interface ChannelCapabilities {
  /** Can post into the guest thread on the OTA. Without it the product's
   *  check-in delivery and AI replies do not function at all. */
  sendsGuestMessages: boolean;
  /** The nightly price read back is what the OTA publishes, NOT merely what we
   *  last pushed. False on push-authoritative channel managers. */
  readsPublishedPrice: boolean;
  /** Accepts nightly rate/availability writes. */
  writesRates: boolean;
  /** Carries a per-listing host identity usable for auto-attribution. When
   *  false, assignment is operator-asserted rather than derived. */
  hasHostIdentity: boolean;
  /** Delivers webhooks; when false the sync must poll. */
  webhooks: boolean;
}

export interface ChannelListing {
  ref: ChannelRef;
  name: string | null;
  /** The host's own identity on the channel, when the provider exposes it.
   *  Null means attribution must be asserted by an operator. */
  hostEmail: string | null;
  listed: boolean;
  address: string | null;
  checkinTime: string | null;
  checkoutTime: string | null;
  /** Everything else, verbatim, for the adapter's own mapping. */
  raw: unknown;
}

export interface ChannelReservation {
  ref: ChannelRef;
  listingRef: ChannelRef;
  /** ISO date, not datetime — stays are day-grained everywhere in this product. */
  arrivalDate: string;
  departureDate: string;
  status: string | null;
  guestName: string | null;
}

export interface ChannelCalendarDay {
  date: string;
  available: boolean;
  /** Whole currency units, never cents — adapters normalise. Null when the
   *  provider has no price for that night. */
  priceClp: number | null;
  minStay: number | null;
}

export interface ChannelMessage {
  ref: ChannelRef;
  body: string | null;
  fromGuest: boolean;
  createdAt: string;
}

/** One nightly write. Inclusive `from`, inclusive `to`. */
export interface RateUpdate {
  from: string;
  to: string;
  priceClp?: number;
  minStay?: number;
  available?: boolean;
}

export interface PushResult {
  ok: boolean;
  /** Provider-side identifier for the write, when one is returned — used to
   *  make a retry idempotent. Null when the provider gives nothing back. */
  ref: string | null;
  error?: string;
}

/**
 * Every read returns `T[] | null`, and null means INCOMPLETE, never empty.
 *
 * This is the single most important rule in the file. The mirror prunes rows
 * absent from a provider response, so a partial list read as complete deletes a
 * host's access codes, cleaning history and guest data. Adapters must return
 * null on any failed page rather than a truncated array.
 */
export interface ChannelProvider {
  readonly id: ProviderId;
  readonly capabilities: ChannelCapabilities;

  listListings(): Promise<ChannelListing[] | null>;
  listReservations(
    listing: ChannelRef,
    fromDate: string,
    toDate: string,
  ): Promise<ChannelReservation[] | null>;
  listCalendar(
    listing: ChannelRef,
    fromDate: string,
    toDate: string,
  ): Promise<ChannelCalendarDay[] | null>;
  listMessages(reservation: ChannelRef): Promise<ChannelMessage[] | null>;

  /** Returns the provider's message id, or null if the send failed. Callers
   *  treat null as "not delivered" and retry within a bounded window. */
  sendMessage(reservation: ChannelRef, body: string): Promise<string | null>;

  /** Present only when `capabilities.writesRates`. */
  pushRates?(listing: ChannelRef, updates: RateUpdate[]): Promise<PushResult>;
}
