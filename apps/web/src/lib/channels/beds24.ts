import 'server-only';
import type {
  ChannelProvider,
  ChannelCapabilities,
  ChannelListing,
  ChannelReservation,
  ChannelCalendarDay,
  ChannelMessage,
  ChannelRef,
  RateUpdate,
  PushResult,
  ReservationState,
} from './types';

/**
 * Beds24 API v2 adapter.
 *
 * Named for the vendor it speaks to, like the Hospitable client beside it —
 * every shape below is Beds24's. Verified against a live account on 2026-08-02;
 * where their documentation and reality disagreed, the comment says so.
 *
 * Auth is a header token, not a Bearer. A long-lived refresh token mints a
 * short-lived access token, and the refresh token dies after 30 days unused —
 * so an idle host connection lapses silently unless something exercises it.
 */

const BASE = 'https://beds24.com/api/v2';

/** Beds24 reports `expiresIn` per response — their spec example says 3600, a
 *  live account returned 86400. Never hardcode it; re-mint on the reported
 *  expiry with a margin. */
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(refreshToken: string): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  try {
    const res = await fetch(`${BASE}/authentication/token`, {
      headers: { refreshToken, accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string; expiresIn?: number };
    if (!body.token) return null;
    cached = {
      token: body.token,
      expiresAt: Date.now() + (body.expiresIn ?? 3600) * 1000,
    };
    return cached.token;
  } catch {
    return null;
  }
}

/** Beds24 returns `{success, data}`; a 2xx whose body carries no `data` array is
 *  a failure, not an empty result. Callers prune against these lists. */
async function get<T>(token: string, path: string): Promise<T[] | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { token, accept: 'application/json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as { success?: boolean; data?: T[] };
    if (!Array.isArray(body.data)) return null;
    return body.data;
  } catch {
    return null;
  }
}

interface Beds24Room {
  id: number;
  name?: string | null;
}
interface Beds24Property {
  id: number;
  name?: string | null;
  currency?: string | null;
  address?: string | null;
  city?: string | null;
  checkInStart?: string | null;
  checkOutEnd?: string | null;
  roomTypes?: Beds24Room[];
  account?: { ownerId?: number } | null;
}

interface Beds24Booking {
  id: number;
  propertyId: number;
  arrival: string;
  departure: string;
  status?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** The OTA's own confirmation code — Airbnb's HM… — and the only reservation
   *  identifier that survives a change of provider. */
  apiReference?: string | null;
  apiSource?: string | null;
}

/** Range-compressed, NOT one row per night. A single entry can span weeks. */
interface Beds24CalendarRange {
  from: string;
  to: string;
  numAvail?: number | null;
  minStay?: number | null;
  /** Whole currency units in the property's own currency. Hospitable returned
   *  cents; copying that ÷100 here would show prices at a hundredth. */
  price1?: number | null;
}

/**
 * Beds24 has its own status vocabulary, not the OTA's — a live Airbnb booking
 * reads as `new`. Normalised here because cancellation revokes a guest's
 * door-code link, and that must not hinge on matching an untyped word.
 */
function toState(status: string | null | undefined): ReservationState {
  switch ((status ?? '').toLowerCase()) {
    case 'new':
    case 'confirmed':
      return 'confirmed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'request':
    case 'inquiry':
      return 'pending';
    default:
      return 'unknown';
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Expands a Beds24 range into one entry per night, `to` inclusive. */
export function expandRange(r: Beds24CalendarRange): ChannelCalendarDay[] {
  const out: ChannelCalendarDay[] = [];
  const end = new Date(`${r.to}T00:00:00Z`).getTime();
  for (let t = new Date(`${r.from}T00:00:00Z`).getTime(); t <= end; t += 86_400_000) {
    out.push({
      date: iso(new Date(t)),
      // A calendar alone cannot tell reserved from host-blocked — both read as
      // zero availability. The sync resolves `reserved` by joining reservations;
      // claiming 'reserved' here would inflate occupancy and revenue.
      state: (r.numAvail ?? 0) > 0 ? 'open' : 'blocked',
      price: r.price1 ?? null,
      minStay: r.minStay ?? null,
    });
  }
  return out;
}

export class Beds24Provider implements ChannelProvider {
  readonly id = 'beds24' as const;

  readonly capabilities: ChannelCapabilities = {
    // Verified present in the OpenAPI spec and reachable (HTTP 200) on a live
    // account. NOT yet proven to deliver into the Airbnb thread, and NOT
    // confirmed as included in the Channel Management Only plan.
    sendsGuestMessages: true,
    // The calendar reflects Airbnb's own published rates while the channel is
    // not push-authoritative. Revisit if the connect level is raised to `full`.
    readsPublishedPrice: true,
    writesRates: true,
    // No host email anywhere: the Airbnb user object carries only airbnbUserId,
    // firstName and picture. Attribution keys on the id, mapped once by an
    // operator, rather than on an email match.
    hasHostIdentity: false,
    webhooks: true,
  };

  constructor(private readonly refreshToken: string) {}

  private async token(): Promise<string | null> {
    return accessToken(this.refreshToken);
  }

  /** propertyId → first roomId. The calendar is keyed on rooms while bookings
   *  are keyed on properties; an Airbnb import is 1:1, so the first room is the
   *  listing. Cached per instance to avoid a lookup per calendar read. */
  private rooms = new Map<string, number>();

  async listListings(): Promise<ChannelListing[] | null> {
    const token = await this.token();
    if (!token) return null;
    const rows = await get<Beds24Property>(token, '/properties?includeAllRooms=true');
    if (!rows) return null;
    return rows.map((p) => {
      const roomId = p.roomTypes?.[0]?.id;
      if (roomId) this.rooms.set(String(p.id), roomId);
      return {
        ref: { provider: 'beds24', id: String(p.id) },
        name: p.name ?? null,
        hostEmail: null,
        listed: true,
        address: [p.address, p.city].filter(Boolean).join(', ') || null,
        checkinTime: p.checkInStart ?? null,
        checkoutTime: p.checkOutEnd ?? null,
        currency: p.currency ?? null,
        raw: p,
      };
    });
  }

  async listReservations(
    listing: ChannelRef,
    fromDate: string,
    toDate: string,
  ): Promise<ChannelReservation[] | null> {
    const token = await this.token();
    if (!token) return null;
    const rows = await get<Beds24Booking>(
      token,
      `/bookings?propertyId=${encodeURIComponent(listing.id)}` +
        `&arrivalFrom=${fromDate}&departureTo=${toDate}`,
    );
    if (!rows) return null;
    return rows.map((b) => ({
      ref: { provider: 'beds24', id: String(b.id) },
      listingRef: { provider: 'beds24', id: String(b.propertyId) },
      arrivalDate: b.arrival,
      departureDate: b.departure,
      state: toState(b.status),
      rawStatus: b.status ?? null,
      confirmationCode: b.apiReference || null,
      guestName: [b.firstName, b.lastName].filter(Boolean).join(' ') || null,
    }));
  }

  async listCalendar(
    listing: ChannelRef,
    fromDate: string,
    toDate: string,
  ): Promise<ChannelCalendarDay[] | null> {
    const token = await this.token();
    if (!token) return null;

    let roomId = this.rooms.get(listing.id);
    if (!roomId) {
      const props = await get<Beds24Property>(
        token,
        `/properties?id=${encodeURIComponent(listing.id)}&includeAllRooms=true`,
      );
      roomId = props?.[0]?.roomTypes?.[0]?.id;
      if (roomId) this.rooms.set(listing.id, roomId);
    }
    if (!roomId) return null;

    // Their docs are explicit and easy to miss: "By default no data will be
    // returned. You should include at least one includeX parameter." Omitting
    // these yields an empty body that reads as "no calendar", not as an error.
    const rows = await get<{ calendar?: Beds24CalendarRange[] }>(
      token,
      `/inventory/rooms/calendar?roomId=${roomId}&startDate=${fromDate}&endDate=${toDate}` +
        '&includePrices=true&includeNumAvail=true&includeMinStay=true',
    );
    if (!rows) return null;
    const ranges = rows[0]?.calendar ?? [];
    return ranges.flatMap(expandRange);
  }

  async listMessages(reservation: ChannelRef): Promise<ChannelMessage[] | null> {
    const token = await this.token();
    if (!token) return null;
    const rows = await get<{
      id: number;
      message?: string | null;
      source?: string | null;
      time?: string | null;
    }>(token, `/bookings/messages?bookingId=${encodeURIComponent(reservation.id)}`);
    if (!rows) return null;
    return (
      rows
        // `internalNote` and `system` are not guest conversation. Treating an
        // internal note as a guest message would have the AI reply to staff.
        .filter((m) => m.source === 'guest' || m.source === 'host')
        .map((m) => ({
          ref: { provider: 'beds24', id: String(m.id) },
          body: m.message ?? null,
          fromGuest: m.source === 'guest',
          createdAt: m.time ?? new Date().toISOString(),
        }))
    );
  }

  async sendMessage(reservation: ChannelRef, body: string): Promise<string | null> {
    const token = await this.token();
    if (!token) return null;
    try {
      const res = await fetch(`${BASE}/bookings/messages`, {
        method: 'POST',
        headers: { token, accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify([{ bookingId: Number(reservation.id), message: body }]),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as Array<{ success?: boolean; new?: { id?: number }[] }>;
      const first = Array.isArray(json) ? json[0] : null;
      if (!first?.success) return null;
      // A send with no returned id still succeeded; report a sentinel so the
      // caller records delivery rather than retrying into a duplicate.
      return first.new?.[0]?.id != null ? String(first.new[0].id) : 'sent';
    } catch {
      return null;
    }
  }

  async pushRates(listing: ChannelRef, updates: RateUpdate[]): Promise<PushResult> {
    const token = await this.token();
    if (!token) return { ok: false, ref: null, error: 'auth' };
    const roomId = this.rooms.get(listing.id);
    if (!roomId) return { ok: false, ref: null, error: 'unknown_room' };
    try {
      const res = await fetch(`${BASE}/inventory/rooms/calendar`, {
        method: 'POST',
        headers: { token, accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify([
          {
            roomId,
            calendar: updates.map((u) => ({
              from: u.from,
              to: u.to,
              ...(u.price != null ? { price1: u.price } : {}),
              ...(u.minStay != null ? { minStay: u.minStay } : {}),
              ...(u.available != null ? { numAvail: u.available ? 1 : 0 } : {}),
            })),
          },
        ]),
      });
      if (!res.ok) return { ok: false, ref: null, error: `http_${res.status}` };
      return { ok: true, ref: null };
    } catch {
      return { ok: false, ref: null, error: 'network' };
    }
  }
}
