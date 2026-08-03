/**
 * Drives the real Beds24 adapter against the real account when a token is
 * present, and skips cleanly otherwise so CI stays green.
 *
 * Read-only by design. It never calls sendMessage or pushRates: both write to a
 * live listing that is taking real bookings, and a test suite must not be able
 * to message someone's guest.
 *
 *   set -a; source apps/web/.env.local; set +a; pnpm --filter @luxel/web test
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Beds24Provider, expandRange } from '../src/lib/channels/beds24';
import { encodeRef } from '../src/lib/channels/types';
import type { ChannelListing } from '../src/lib/channels/types';

const TOKEN = process.env.BEDS24_REFRESH_TOKEN;
const LIVE = Boolean(TOKEN);

describe('beds24 range expansion', () => {
  it('expands a compressed range into one entry per night, inclusive', () => {
    // Beds24 returns ranges, not days: a single row spanned 2026-08-03..08-17
    // on the live account. Treating one row as one night would render a
    // fortnight of calendar as a single cell.
    const days = expandRange({ from: '2026-08-03', to: '2026-08-05', numAvail: 1, price1: 166450 });
    expect(days.map((d) => d.date)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
    expect(days.every((d) => d.price === 166450)).toBe(true);
    expect(days.every((d) => d.state === 'open')).toBe(true);
  });

  it('reports zero availability as blocked, never as reserved', () => {
    // A calendar alone cannot tell a booking from a host block. Claiming
    // 'reserved' here would inflate occupancy and 30-day revenue, which are
    // computed from that state.
    const [day] = expandRange({ from: '2026-09-01', to: '2026-09-01', numAvail: 0, price1: 1000 });
    expect(day.state).toBe('blocked');
  });

  it('keeps prices in whole units — Beds24 is not cents', () => {
    // Hospitable returned cents and this adapter must not copy that ÷100.
    const [day] = expandRange({
      from: '2026-09-01',
      to: '2026-09-01',
      numAvail: 1,
      price1: 166450,
    });
    expect(day.price).toBe(166450);
  });
});

describe.skipIf(!LIVE)('beds24 adapter (live account)', () => {
  let provider: Beds24Provider;
  let listings: ChannelListing[] | null;

  beforeAll(async () => {
    provider = new Beds24Provider(TOKEN!);
    listings = await provider.listListings();
  });

  it('lists listings with the fields the mirror needs', () => {
    expect(listings).not.toBeNull();
    expect(listings!.length).toBeGreaterThan(0);
    const l = listings![0];
    expect(l.ref.provider).toBe('beds24');
    expect(encodeRef(l.ref)).toMatch(/^b24:/);
    expect(l.currency).toBe('CLP');
    expect(l.checkinTime).toBeTruthy();
    expect(l.checkoutTime).toBeTruthy();
    // Beds24 exposes no host email — attribution keys on airbnbUserId instead.
    expect(l.hostEmail).toBeNull();
  });

  it('lists reservations carrying the OTA confirmation code', async () => {
    const res = await provider.listReservations(listings![0].ref, '2026-01-01', '2027-06-01');
    expect(res).not.toBeNull();
    expect(res!.length).toBeGreaterThan(0);
    const r = res![0];
    expect(r.arrivalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.departureDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The cross-provider stay key. Hospitable exposes the same value as `code`,
    // so a cutover map is built from an identifier Airbnb owns.
    expect(res!.some((x) => x.confirmationCode)).toBe(true);
    // Beds24 says 'new' for a live Airbnb booking; the contract normalises it.
    expect(['confirmed', 'pending', 'cancelled', 'unknown']).toContain(r.state);
  });

  it('reads a per-night calendar with real prices', async () => {
    const days = await provider.listCalendar(listings![0].ref, '2026-08-03', '2026-08-10');
    expect(days).not.toBeNull();
    // One entry per night, not per range.
    expect(days!.length).toBe(8);
    expect(new Set(days!.map((d) => d.date)).size).toBe(8);
    const priced = days!.filter((d) => d.price != null);
    expect(priced.length).toBeGreaterThan(0);
    // Sanity: a Santiago nightly rate in CLP is five or six figures. If this
    // ever reads as ~1600, someone reintroduced a cents conversion.
    expect(priced[0].price!).toBeGreaterThan(10_000);
  });

  it('returns null rather than an empty list for an unknown listing', async () => {
    // null means INCOMPLETE. The mirror prunes against these lists, so a bogus
    // id must never look like "this host has no calendar".
    const days = await provider.listCalendar(
      { provider: 'beds24', id: '999999999' },
      '2026-08-03',
      '2026-08-04',
    );
    expect(days).toBeNull();
  });

  it('declares capabilities honestly', () => {
    expect(provider.capabilities.hasHostIdentity).toBe(false);
    expect(provider.capabilities.writesRates).toBe(true);
    expect(typeof provider.pushRates).toBe('function');
  });
});
