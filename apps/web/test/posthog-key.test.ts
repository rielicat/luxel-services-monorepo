import { describe, it, expect } from 'vitest';
import { posthogKey } from '../src/lib/posthog/key';

describe('which variable switches PostHog on', () => {
  it('reads the name this repository has always used', () => {
    expect(posthogKey({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_ours' })).toBe('phc_ours');
  });

  it('also reads the name PostHog own setup page gives', () => {
    expect(posthogKey({ NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_theirs' })).toBe('phc_theirs');
  });

  it('prefers this repository name when both are set', () => {
    expect(
      posthogKey({
        NEXT_PUBLIC_POSTHOG_KEY: 'phc_ours',
        NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_theirs',
      }),
    ).toBe('phc_ours');
  });

  it('treats an empty or blank value as unset, so the provider stays off', () => {
    expect(posthogKey({ NEXT_PUBLIC_POSTHOG_KEY: '   ' })).toBeNull();
    expect(posthogKey({})).toBeNull();
  });
});
