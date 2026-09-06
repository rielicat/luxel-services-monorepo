import { describe, it, expect } from 'vitest';
import { rateLimit, callerKey } from '../src/lib/rate-limit';

describe('the guard on the open events endpoint', () => {
  it('allows a caller up to the limit and refuses the next one', () => {
    const key = `caller-${Math.random()}`;
    const now = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit(key, 5, now)).toBe(true);
    expect(rateLimit(key, 5, now)).toBe(false);
  });

  it('lets the same caller through again once the window has passed', () => {
    const key = `caller-${Math.random()}`;
    const now = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) rateLimit(key, 5, now);
    expect(rateLimit(key, 5, now)).toBe(false);
    expect(rateLimit(key, 5, now + 61_000)).toBe(true);
  });

  it('counts each caller separately', () => {
    const now = 1_700_000_000_000;
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 5; i++) rateLimit(a, 5, now);
    expect(rateLimit(a, 5, now)).toBe(false);
    expect(rateLimit(b, 5, now)).toBe(true);
  });

  it('takes the first address from a forwarded chain', () => {
    expect(callerKey(new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
    expect(callerKey(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
    expect(callerKey(new Headers())).toBe('unknown');
  });
});
