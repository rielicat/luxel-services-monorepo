/**
 * Provider references are stored in live rows (checkins.reservation_uid,
 * calendar_blocks.external_uid) and are what the strict-mirror prune scopes on.
 * Getting the encoding wrong silently changes which rows a prune matches, so
 * these tests pin the exact stored form against what production already
 * contains.
 */
import { describe, it, expect } from 'vitest';
import { encodeRef, decodeRef, refPattern } from '../src/lib/channels/types';

describe('channel refs', () => {
  it('encodes Hospitable exactly as live rows already store it', () => {
    // Production rows are 'hosp:<uuid>'. If this changes, every existing
    // check-in becomes unreachable and the prune stops matching.
    expect(encodeRef({ provider: 'hospitable', id: 'a6eb2c65' })).toBe('hosp:a6eb2c65');
    expect(refPattern('hospitable')).toBe('hosp:%');
  });

  it('round-trips', () => {
    const ref = { provider: 'hospitable', id: '12345' } as const;
    expect(decodeRef(encodeRef(ref))).toEqual(ref);
  });

  it('refuses to guess at an unknown or malformed ref', () => {
    // The prefix of a provider that is no longer registered must decode to
    // null, not be guessed at: a guess would let a prune scoped to the active
    // provider delete rows belonging to a namespace it does not own.
    expect(decodeRef('b24:123')).toBeNull();
    expect(decodeRef('unknown:123')).toBeNull();
    expect(decodeRef('nocolon')).toBeNull();
    expect(decodeRef(':leading')).toBeNull();
    expect(decodeRef('hosp:')).toBeNull();
    expect(decodeRef('')).toBeNull();
  });

  it('splits on the first colon only, so ids may contain colons', () => {
    expect(decodeRef('hosp:12:34')).toEqual({ provider: 'hospitable', id: '12:34' });
  });
});
