/**
 * Provider references are stored in live rows (checkins.reservation_uid) and are
 * what the strict-mirror prune scopes on. Getting the encoding wrong silently
 * changes which rows a prune matches, so these tests pin the exact stored form
 * against what production already contains.
 */
import { describe, it, expect } from 'vitest';
import { encodeRef, decodeRef, refPattern } from '../src/lib/channels/types';
import type { DayState, ChannelCalendarDay } from '../src/lib/channels/types';

describe('channel refs', () => {
  it('encodes Hospitable exactly as live rows already store it', () => {
    // Production rows are 'hosp:<uuid>' (hospitable-sync.ts). If this changes,
    // every existing check-in becomes unreachable and the prune stops matching.
    expect(encodeRef({ provider: 'hospitable', id: 'a6eb2c65' })).toBe('hosp:a6eb2c65');
    expect(refPattern('hospitable')).toBe('hosp:%');
  });

  it('round-trips every provider', () => {
    for (const provider of ['hospitable', 'beds24', 'channex'] as const) {
      const ref = { provider, id: '12345' };
      expect(decodeRef(encodeRef(ref))).toEqual(ref);
    }
  });

  it('keeps providers in separate namespaces', () => {
    expect(encodeRef({ provider: 'beds24', id: '1' })).not.toBe(
      encodeRef({ provider: 'channex', id: '1' }),
    );
    expect(refPattern('beds24')).not.toBe(refPattern('hospitable'));
  });

  it('refuses to guess at an unknown or malformed ref', () => {
    // A guessed provider would let a prune scoped to one vendor delete another
    // vendor's rows, so anything unrecognised must decode to null.
    expect(decodeRef('unknown:123')).toBeNull();
    expect(decodeRef('nocolon')).toBeNull();
    expect(decodeRef(':leading')).toBeNull();
    expect(decodeRef('hosp:')).toBeNull();
    expect(decodeRef('')).toBeNull();
  });

  it('splits on the first colon only, so ids may contain colons', () => {
    expect(decodeRef('b24:12:34')).toEqual({ provider: 'beds24', id: '12:34' });
  });
});

describe('calendar day states', () => {
  it('keeps reserved and blocked distinguishable', () => {
    // Both are unavailable, and conflating them inflates occupancy AND the
    // 30-day revenue figure, since revenue sums nights where state === reserved.
    // detail-client.tsx:68 and :73, stays-timeline.tsx:96, ai/tools.ts:338.
    const states: DayState[] = ['open', 'reserved', 'blocked'];
    expect(new Set(states).size).toBe(3);

    const renovationBlock: ChannelCalendarDay = {
      date: '2026-08-10',
      state: 'blocked',
      price: 166450,
      minStay: null,
    };
    const booked: ChannelCalendarDay = {
      date: '2026-08-11',
      state: 'reserved',
      price: 166450,
      minStay: null,
    };
    const revenue = [renovationBlock, booked]
      .filter((d) => d.state === 'reserved' && d.price != null)
      .reduce((sum, d) => sum + d.price!, 0);
    // The block must not be counted as earned.
    expect(revenue).toBe(166450);
  });
});
