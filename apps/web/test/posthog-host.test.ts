import { describe, it, expect } from 'vitest';
import { POSTHOG_HOST, posthogHost } from '@luxel/shared/posthog';

describe('which host receives PostHog traffic', () => {
  it('defaults to the managed reverse proxy on our own domain', () => {
    expect(posthogHost({})).toBe('https://t.serviciosluxel.cl');
    expect(POSTHOG_HOST).toBe('https://t.serviciosluxel.cl');
  });

  it('takes an absolute override', () => {
    expect(posthogHost({ NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com' })).toBe(
      'https://us.i.posthog.com',
    );
  });

  it('drops a trailing slash, so a path is never doubled', () => {
    expect(posthogHost({ NEXT_PUBLIC_POSTHOG_HOST: 'https://t.serviciosluxel.cl/' })).toBe(
      'https://t.serviciosluxel.cl',
    );
  });

  it('ignores a relative or blank value', () => {
    expect(posthogHost({ NEXT_PUBLIC_POSTHOG_HOST: '/ingest' })).toBe(POSTHOG_HOST);
    expect(posthogHost({ NEXT_PUBLIC_POSTHOG_HOST: '   ' })).toBe(POSTHOG_HOST);
  });
});
