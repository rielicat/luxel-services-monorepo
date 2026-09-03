import { describe, it, expect } from 'vitest';
import { encodeRef, decodeRef, refPattern } from '@luxel/core/channels/types';

describe('channel refs', () => {
  it('encodes Hospitable exactly as live rows already store it', () => {
    expect(encodeRef({ provider: 'hospitable', id: 'a6eb2c65' })).toBe('hosp:a6eb2c65');
    expect(refPattern('hospitable')).toBe('hosp:%');
  });

  it('round-trips', () => {
    const ref = { provider: 'hospitable', id: '12345' } as const;
    expect(decodeRef(encodeRef(ref))).toEqual(ref);
  });

  it('refuses to guess at an unknown or malformed ref', () => {
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
