/**
 * CIDR matching decides who may post an inbound channel event, so an
 * off-by-one in the mask is an authorisation bug. These pin the boundaries.
 */
import { describe, it, expect } from 'vitest';
import { ipInCidr, sourceIp } from '../src/lib/channels/webhook-auth';

describe('ipInCidr', () => {
  it('matches Hospitable’s published range at both edges', () => {
    expect(ipInCidr('38.80.170.0', '38.80.170.0/24')).toBe(true);
    expect(ipInCidr('38.80.170.255', '38.80.170.0/24')).toBe(true);
    // One below and one above — the adjacent /24s must not be inside it.
    expect(ipInCidr('38.80.169.255', '38.80.170.0/24')).toBe(false);
    expect(ipInCidr('38.80.171.0', '38.80.170.0/24')).toBe(false);
  });

  it('handles a /32 and a /0 without sign-bit surprises', () => {
    expect(ipInCidr('10.0.0.1', '10.0.0.1/32')).toBe(true);
    expect(ipInCidr('10.0.0.2', '10.0.0.1/32')).toBe(false);
    expect(ipInCidr('1.2.3.4', '0.0.0.0/0')).toBe(true);
    // High addresses set the top bit; a signed shift would break these.
    expect(ipInCidr('255.255.255.255', '255.255.255.0/24')).toBe(true);
    expect(ipInCidr('200.0.0.1', '128.0.0.0/1')).toBe(true);
    expect(ipInCidr('127.0.0.1', '128.0.0.0/1')).toBe(false);
  });

  it('refuses anything malformed rather than matching loosely', () => {
    // A permissive parser here would hand authorisation to junk input.
    expect(ipInCidr('38.80.170.1', '38.80.170.0/33')).toBe(false);
    expect(ipInCidr('38.80.170.1', 'garbage')).toBe(false);
    expect(ipInCidr('38.80.170', '38.80.170.0/24')).toBe(false);
    expect(ipInCidr('38.80.170.256', '38.80.170.0/24')).toBe(false);
    expect(ipInCidr('38.80.170.01x', '38.80.170.0/24')).toBe(false);
    expect(ipInCidr('', '38.80.170.0/24')).toBe(false);
    // IPv6 never silently matches an IPv4 rule.
    expect(ipInCidr('2001:db8::1', '38.80.170.0/24')).toBe(false);
  });
});

describe('sourceIp', () => {
  it('prefers the header a proxy in front of Vercel cannot overwrite', () => {
    const h = new Headers({
      'x-vercel-forwarded-for': '38.80.170.5',
      'x-forwarded-for': '1.2.3.4',
      'x-real-ip': '5.6.7.8',
    });
    expect(sourceIp(h)).toBe('38.80.170.5');
  });

  it('falls back in order and trims a list', () => {
    expect(sourceIp(new Headers({ 'x-forwarded-for': ' 9.9.9.9 , 10.0.0.1' }))).toBe('9.9.9.9');
    expect(sourceIp(new Headers({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
  });

  it('is null when nothing identifies the caller', () => {
    expect(sourceIp(new Headers())).toBeNull();
    expect(sourceIp(new Headers({ 'x-forwarded-for': '' }))).toBeNull();
  });
});
